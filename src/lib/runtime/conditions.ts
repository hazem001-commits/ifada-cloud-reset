// ============================================================
// src/lib/runtime/conditions.ts
// مرآة TypeScript لتقييم الشروط بـ sql/037 (_runtime_condition_holds) —
// للاختبار والتصحيح والمحاكاة فقط. السلطة الحية هي قاعدة البيانات.
//
// منظوران (نفس القاعدة بالسيرفر):
//   team  — حالة يعرفها الفريق كله فقط: عنصر مشترك وكل أسلافه مشتركون،
//           دليل مرئي للفريق (035)، خيط مشترك، حالة عالم، رابط مثبت.
//           اكتشاف خاص لا يُنتج أثراً جماعياً أبداً.
//   actor — منظور اللاعب نفسه المصرّح به (اكتشافه أو المشترك).
// ============================================================
import { MAX_ANCESTOR_DEPTH } from '@/lib/objectVisibility';
import type { LeadStatus, RuntimeCondition, RuntimeEffect, RuntimeScope } from './types';

const CODE_RE = /^[A-Z0-9_-]{1,64}$/;
const RULE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const LEAD_STATUSES: readonly LeadStatus[] = ['open', 'followed', 'closed'];

const code = (v: unknown): string | null => (typeof v === 'string' && CODE_RE.test(v) ? v : null);

/** شرط من JSON غير موثوق — أي شكل غريب = null (مغلق). */
export function parseCondition(raw: unknown): RuntimeCondition | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  switch (r.kind) {
    case 'object_discovered': {
      const object = code(r.object);
      return object ? { kind: 'object_discovered', object } : null;
    }
    case 'object_state': {
      const object = code(r.object);
      if (!object || !Array.isArray(r.states) || r.states.length < 1 || r.states.length > 8) return null;
      const states = r.states.map(code);
      return states.every((s): s is string => s !== null) ? { kind: 'object_state', object, states } : null;
    }
    case 'evidence_unlocked': {
      const evidence = code(r.evidence);
      return evidence ? { kind: 'evidence_unlocked', evidence } : null;
    }
    case 'connection_validated':
      return typeof r.rule === 'string' && RULE_RE.test(r.rule) ? { kind: 'connection_validated', rule: r.rule } : null;
    case 'world_state': {
      const state = code(r.state);
      return state ? { kind: 'world_state', state } : null;
    }
    case 'lead': {
      const lead = code(r.lead);
      const status = LEAD_STATUSES.find((s) => s === r.status);
      return lead && status ? { kind: 'lead', lead, status } : null;
    }
    default:
      return null;
  }
}

export function parseEffect(raw: unknown): RuntimeEffect | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  switch (r.kind) {
    case 'open_lead':
    case 'follow_lead':
    case 'close_lead': {
      const lead = code(r.lead);
      return lead ? { kind: r.kind, lead } : null;
    }
    case 'reveal_object': {
      const object = code(r.object);
      return object ? { kind: 'reveal_object', object } : null;
    }
    case 'advance_object_state': {
      const object = code(r.object);
      const from = code(r.from);
      const to = code(r.to);
      return object && from && to && from !== to ? { kind: 'advance_object_state', object, from, to } : null;
    }
    case 'reach_world_state': {
      const state = code(r.state);
      return state ? { kind: 'reach_world_state', state } : null;
    }
    case 'deliver_evidence': {
      const evidence = code(r.evidence);
      return evidence ? { kind: 'deliver_evidence', evidence } : null;
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------
// لقطة حالة جلسة (للمحاكاة) — نفس أعمدة الجداول الحية.
// ------------------------------------------------------------
export interface SnapshotObject {
  parent: string | null;
  state: string;
  discovered: boolean;
  discoveredBy: string | null;
  shared: boolean;
  gated: boolean;
  initialState: string;
  autoAdvance?: Readonly<Record<string, string>>;
}

export interface SnapshotEvidence {
  unlocked: boolean;
  /** 035: مرئي للفريق (عنوان بسياسة title، أو مسار مشترك بالقنوات). */
  teamVisible: boolean;
  /** من يقرأ المحتوى (توزيع 035). */
  readers: ReadonlySet<string>;
}

export interface SnapshotLead {
  holder: string | null;
  shared: boolean;
  status: LeadStatus;
  followed: boolean;
}

export interface RuntimeSnapshot {
  /** صفوف session_object_state الموجودة فقط (المغلق غير المكشوف غائب). */
  objects: Map<string, SnapshotObject>;
  /** كل عناصر القضية المكتوبة (لمعرفة الأب حتى لو لا صف له). */
  catalogueParents: ReadonlyMap<string, string | null>;
  evidence: Map<string, SnapshotEvidence>;
  connections: Set<string>;
  world: Set<string>;
  leads: Map<string, SnapshotLead>;
}

export type Perspective = { kind: 'team' } | { kind: 'actor'; userId: string };

export const perspectiveFor = (scope: RuntimeScope, actor: string | null): Perspective | null =>
  scope === 'team' ? { kind: 'team' } : actor ? { kind: 'actor', userId: actor } : null;

/** سلسلة الأسلاف بنفس قاعدة 026 (حلقة/عمق/أب مفقود = غير معروف). */
function chainKnown(s: RuntimeSnapshot, objectCode: string, known: (o: SnapshotObject) => boolean, includeSelf: boolean): boolean {
  const self = s.objects.get(objectCode);
  if (!self) return false;
  if (includeSelf && !known(self)) return false;
  const seen = new Set([objectCode]);
  let parent = s.catalogueParents.has(objectCode) ? s.catalogueParents.get(objectCode) ?? null : self.parent;
  let depth = 0;
  while (parent) {
    depth += 1;
    if (depth > MAX_ANCESTOR_DEPTH || seen.has(parent)) return false;
    seen.add(parent);
    const row = s.objects.get(parent);
    if (!row || !known(row)) return false;
    parent = s.catalogueParents.get(parent) ?? row.parent;
  }
  return true;
}

/** عنصر يعرفه الفريق: مكتشف ومشترك، وكل سلف مكتشف ومشترك. */
export const objectTeamKnown = (s: RuntimeSnapshot, objectCode: string) =>
  chainKnown(s, objectCode, (o) => o.discovered && o.shared, true);

/** عنصر يراه لاعب: مكتشف، (مشترك أو اكتشافه)، وكل سلف كذلك. */
export const objectVisibleTo = (s: RuntimeSnapshot, objectCode: string, userId: string) =>
  chainKnown(s, objectCode, (o) => o.discovered && (o.shared || o.discoveredBy === userId), true);

/**
 * منحة فتح القضية ليست اكتشافاً: عنصر جذري غير مغلق يُزرع معروفاً ومشتركاً
 * عند open_investigation، فلا يحقق object_discovered أبداً. discovered=true
 * وحدها ليست دليلاً — فقط عنصر مغلق كُشف أثناء اللعب أو عنصر فرعي وُجد بفعل.
 */
export function isOpenCaseRoot(s: RuntimeSnapshot, objectCode: string): boolean {
  const row = s.objects.get(objectCode);
  if (!row) return false;
  const parent = s.catalogueParents.has(objectCode) ? s.catalogueParents.get(objectCode) ?? null : row.parent;
  return !row.gated && !parent;
}

export function conditionHolds(s: RuntimeSnapshot, c: RuntimeCondition, p: Perspective): boolean {
  switch (c.kind) {
    case 'object_discovered':
    case 'object_state': {
      const row = s.objects.get(c.object);
      if (!row || !row.discovered) return false;
      if (c.kind === 'object_discovered' && isOpenCaseRoot(s, c.object)) return false;
      const known = p.kind === 'team' ? objectTeamKnown(s, c.object) : objectVisibleTo(s, c.object, p.userId);
      if (!known) return false;
      return c.kind === 'object_state' ? c.states.includes(row.state) : true;
    }
    case 'evidence_unlocked': {
      const ev = s.evidence.get(c.evidence);
      if (!ev || !ev.unlocked) return false;
      return p.kind === 'team' ? ev.teamVisible : ev.readers.has(p.userId);
    }
    case 'connection_validated':
      return s.connections.has(c.rule);
    case 'world_state':
      return s.world.has(c.state);
    case 'lead': {
      const l = s.leads.get(c.lead);
      if (!l) return false;
      if (!(l.shared || (p.kind === 'actor' && l.holder === p.userId))) return false;
      if (c.status === 'open') return true;
      if (c.status === 'followed') return l.followed;
      return l.status === 'closed';
    }
  }
}

export const allConditionsHold = (s: RuntimeSnapshot, conditions: readonly RuntimeCondition[], p: Perspective) =>
  conditions.length > 0 && conditions.every((c) => conditionHolds(s, c, p));
