// ============================================================
// tests/runtime/runtimeModel.ts
// ⚠ TEST ONLY · NON-CANON · NEVER SEED.
// نموذج تنفيذي (مواصفة، ليس كود إنتاج) لسلوك sql/037: السلسلة المقيّدة،
// سجل الإطلاق مرة واحدة، النبضات، الإخفاء المغلق، وقراءة الفهرس.
// يستخدم مقيّم الشروط الحقيقي (src/lib/runtime/conditions.ts) — وتقارن
// اختبارات sql037 نص SQL بنفس القواعد بنداً بنداً. التحقق الحي مقابل
// Postgres حقيقي: tests/sql-local (اختياري، قاعدة محلية مؤقتة فقط).
// ============================================================
import { allConditionsHold, objectTeamKnown, objectVisibleTo, perspectiveFor, type RuntimeSnapshot, type SnapshotObject } from '../../src/lib/runtime/conditions';
import { CASCADE_LIMITS, type PulseCategory, type RuntimeEffect, type RuntimeRule } from '../../src/lib/runtime/types';

export interface ModelCatalogueObject {
  code: string;
  parent: string | null;
  category: string;
  title: string;
  initialState: string;
  gated: boolean;
  autoAdvance?: Record<string, string>;
}

export interface ModelPulse {
  actorId: string | null;
  category: PulseCategory;
  /** server-only (session_pulse_sources) — never exposed by the read model. */
  sourceKey: string;
}

export interface ModelWorld {
  objects: ModelCatalogueObject[];
  rules: RuntimeRule[];
  pulseCategories: Map<string, PulseCategory>; // 'object:CODE' | 'evidence:CODE' | 'lead:CODE'
  members: string[];
  snapshot: RuntimeSnapshot;
  firings: Map<string, string | null>; // rule|actorKey → actor
  pulses: ModelPulse[];
  pending: Set<string>;
  evidenceOwner: Map<string, string>; // evidence → the one member who can read it (spec)
  log: string[];
}

export function createWorld(objects: ModelCatalogueObject[], rules: RuntimeRule[], members: string[]): ModelWorld {
  const snapshot: RuntimeSnapshot = {
    objects: new Map(),
    catalogueParents: new Map(objects.map((o) => [o.code, o.parent])),
    evidence: new Map(),
    connections: new Set(),
    world: new Set(),
    leads: new Map(),
  };
  return { objects, rules, pulseCategories: new Map(), members, snapshot, firings: new Map(), pulses: [], pending: new Set(), evidenceOwner: new Map(), log: [] };
}

const objDef = (w: ModelWorld, code: string) => w.objects.find((o) => o.code === code);

function emitPulse(w: ModelWorld, sourceKey: string, actorId: string | null, catKey: string) {
  const category = w.pulseCategories.get(catKey);
  if (!category) return; // unmapped → no pulse (fail closed)
  if (w.pulses.some((p) => p.sourceKey === sourceKey)) return; // one per logical event
  w.pulses.push({ actorId, category, sourceKey });
}

/** open_investigation (037): every NON-gated object; roots discovered + shared. */
export function openInvestigation(w: ModelWorld) {
  for (const o of w.objects) {
    if (o.gated || w.snapshot.objects.has(o.code)) continue;
    w.snapshot.objects.set(o.code, {
      parent: o.parent, state: o.initialState, discovered: o.parent === null, discoveredBy: null,
      shared: o.parent === null, gated: false, initialState: o.initialState, autoAdvance: o.autoAdvance,
    });
  }
}

/** Object row write + its deferred trigger (pulse) — then the cascade. */
function onObjectChanged(w: ModelWorld, code: string, before: SnapshotObject | undefined, after: SnapshotObject, system: boolean) {
  if (after.discovered && !after.shared && after.discoveredBy && !(before?.discovered)) {
    emitPulse(w, `object:${code}`, after.discoveredBy, `object:${code}`);
  }
  if (system && after.discovered && !after.shared) emitPulse(w, `result:${code}@${after.state}`, null, `object:${code}`);
}

export function interact(w: ModelWorld, actor: string, code: string, to: string, opts: { discover?: boolean } = {}) {
  const row = w.snapshot.objects.get(code);
  if (!row || !objectVisibleOrUndiscoveredUnderKnown(w, code, actor)) throw new Error('OBJECT_NOT_FOUND');
  const before = { ...row };
  if (opts.discover && !row.discovered) {
    row.discovered = true;
    row.discoveredBy = actor;
  }
  row.state = to;
  onObjectChanged(w, code, before, row, false);
  cascade(w, actor);
}

export function shareObject(w: ModelWorld, actor: string, code: string) {
  const row = w.snapshot.objects.get(code);
  if (!row || !row.discovered || row.discoveredBy !== actor) throw new Error('NOT_YOUR_DISCOVERY');
  row.shared = true;
  cascade(w, actor);
}

/** Read-time auto-advance (019) — SYSTEM, never the reader. */
export function settleProcessing(w: ModelWorld, reader: string) {
  for (const [code, row] of w.snapshot.objects) {
    const to = row.autoAdvance?.[row.state];
    if (!to) continue;
    const before = { ...row };
    row.state = to;
    onObjectChanged(w, code, before, row, true);
    cascade(w, null);
  }
  cascade(w, reader);
}

export function shareLead(w: ModelWorld, actor: string, lead: string) {
  const l = w.snapshot.leads.get(lead);
  if (!l || !(l.shared || l.holder === actor)) throw new Error('LEAD_NOT_FOUND');
  l.shared = true;
  cascade(w, actor);
}

export function runtimeSettle(w: ModelWorld, actor: string) {
  for (const ev of [...w.pending]) {
    if (w.evidenceOwner.get(ev) === actor) deliver(w, ev, actor);
  }
  cascade(w, actor);
}

function deliver(w: ModelWorld, ev: string, actor: string | null) {
  if (!actor || w.evidenceOwner.get(ev) !== actor) {
    w.pending.add(ev);
    return;
  }
  w.pending.delete(ev);
  w.snapshot.evidence.set(ev, { unlocked: true, teamVisible: true, readers: new Set([actor]) });
  w.log.push(`deliver:${ev}`);
}

function applyEffect(w: ModelWorld, e: RuntimeEffect, scope: 'actor' | 'team', actor: string | null) {
  const s = w.snapshot;
  switch (e.kind) {
    case 'open_lead': {
      const existing = s.leads.get(e.lead);
      if (existing) {
        if (scope === 'team') existing.shared = true; // team open PROMOTES a private lead (holder kept)
        return;
      }
      s.leads.set(e.lead, scope === 'team' ? { holder: null, shared: true, status: 'open', followed: false } : { holder: actor, shared: false, status: 'open', followed: false });
      if (scope === 'actor') emitPulse(w, `lead:${e.lead}`, actor, `lead:${e.lead}`);
      return;
    }
    case 'follow_lead':
    case 'close_lead': {
      const l = s.leads.get(e.lead);
      if (!l || !(scope === 'team' ? l.shared : !l.shared && l.holder === actor)) return;
      if (e.kind === 'follow_lead') {
        l.followed = true;
        if (l.status !== 'closed') l.status = 'followed';
      } else l.status = 'closed';
      return;
    }
    case 'reveal_object': {
      const def = objDef(w, e.object);
      if (!def?.gated) throw new Error('RUNTIME_CONTENT_ERROR');
      const existing = s.objects.get(e.object);
      const before = existing ? { ...existing } : undefined;
      if (scope === 'team') {
        const row = existing ?? { parent: def.parent, state: def.initialState, discovered: true, discoveredBy: null, shared: true, gated: true, initialState: def.initialState };
        row.discovered = true;
        row.shared = true;
        s.objects.set(e.object, row);
        onObjectChanged(w, e.object, before, row, false);
      } else if (!existing || !existing.discovered) {
        const row = { parent: def.parent, state: def.initialState, discovered: true, discoveredBy: actor, shared: false, gated: true, initialState: def.initialState };
        s.objects.set(e.object, row);
        onObjectChanged(w, e.object, before, row, false);
      }
      return;
    }
    case 'advance_object_state': {
      const row = s.objects.get(e.object);
      if (!row || row.state !== e.from) return;
      const ok = scope === 'team' ? objectTeamKnown(s, e.object) : row.discovered && !row.shared && row.discoveredBy === actor;
      if (ok) row.state = e.to;
      return;
    }
    case 'reach_world_state':
      if (scope === 'team' && !s.world.has(e.state)) {
        s.world.add(e.state);
        w.log.push(`world:${e.state}`);
      }
      return;
    case 'deliver_evidence':
      if (scope === 'team') deliver(w, e.evidence, actor);
      return;
  }
}

/** _runtime_cascade: once-only ledger, deterministic order, bounded. Throws = rollback. */
export function cascade(w: ModelWorld, actor: string | null) {
  let total = 0;
  for (let pass = 1; ; pass += 1) {
    let fired = 0;
    for (const rule of [...w.rules].filter((r) => r.status === 'approved').sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))) {
      const p = perspectiveFor(rule.scope, actor);
      if (!p) continue;
      const key = `${rule.id}|${rule.scope === 'team' ? '' : actor}`;
      if (w.firings.has(key)) continue;
      if (!allConditionsHold(w.snapshot, rule.conditions, p)) continue;
      w.firings.set(key, actor);
      total += 1;
      if (total > CASCADE_LIMITS.maxFiringsPerTransaction) throw new Error('RUNTIME_CASCADE_LIMIT');
      for (const e of rule.effects) applyEffect(w, e, rule.scope, actor);
      fired += 1;
    }
    if (fired === 0) return;
    if (pass >= CASCADE_LIMITS.maxPasses) throw new Error('RUNTIME_CASCADE_LIMIT');
  }
}

/** investigation_object_index (037) rows as a given player sees them. */
export function indexFor(w: ModelWorld, viewer: string): { code: string; parent: string | null; title: string; state: string }[] {
  const out: { code: string; parent: string | null; title: string; state: string }[] = [];
  for (const def of w.objects) {
    const row = w.snapshot.objects.get(def.code);
    if (!row) continue; // gated + unrevealed: no row at all
    const visible = row.shared || row.discoveredBy === viewer || !row.discovered;
    // 026 ancestor chain
    if (def.parent && !objectVisibleTo(w.snapshot, def.parent, viewer)) continue;
    // 037 gated clause
    if (def.gated && !(row.discovered && (row.shared || row.discoveredBy === viewer))) continue;
    out.push({ code: def.code, parent: def.parent, title: def.title, state: visible ? row.state : 'HIDDEN' });
  }
  return out;
}

function objectVisibleOrUndiscoveredUnderKnown(w: ModelWorld, code: string, actor: string): boolean {
  return indexFor(w, actor).some((r) => r.code === code && r.state !== 'HIDDEN');
}
