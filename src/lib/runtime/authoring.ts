// ============================================================
// src/lib/runtime/authoring.ts
// Lint تأليف قواعد المحرك — مرآة لمحفّز _runtime_rules_validate
// (sql/037) + فحوص على مستوى مجموعة القواعد. يُستخدم لمراجعة مسودات
// القواعد قبل إدخالها لقاعدة البيانات؛ قاعدة البيانات تبقى الحَكَم.
//
// ثابت السببية (WORLD-STATE CAUSALITY): حالة عالم كبرى (RAMI_FOUND-style)
// لا تُبلغ بسبب فتح دليل وحده. يلزم تقدّم تحقيقي حقيقي: حالة عنصر، عنصر
// مكتشف، خيط مُتتبَّع/مُغلق، رابط مثبت، أو حالة عالم سابقة. والمادة التي
// تصل نتيجةً لحالة عالم (مثل تقرير طبي بعد العثور) لا تكون سبباً لها.
// ============================================================
import { parseCondition, parseEffect } from './conditions';
import { RUNTIME_ONLY_REQUIRES, type RuntimeCondition, type RuntimeEffect, type RuntimeRule, type RuntimeScope } from './types';

export type AuthoringIssueCode =
  | 'RUNTIME_RULE_INVALID'
  | 'RUNTIME_RULE_SCOPE'
  | 'RUNTIME_RULE_REFERENCE'
  | 'RUNTIME_RULE_CAUSALITY'
  | 'RUNTIME_LEAD_LABEL';

export interface AuthoringIssue {
  rule: string;
  code: AuthoringIssueCode;
  detail: string;
}

/** ما تعرفه قاعدة البيانات عن القضية عند الاعتماد (مراجع فقط). */
export interface AuthoringCatalogue {
  /** parent = null → عنصر جذري (غير المغلق منه يُزرع معروفاً عند فتح القضية). */
  objects: ReadonlyMap<string, { gated: boolean; initialState: string; parent: string | null }>;
  /** دليل → متطلباته القديمة (requires) وهل يُمنح عند فتح القضية (is_initial). */
  evidence: ReadonlyMap<string, { requires: readonly string[]; initial?: boolean }>;
  leads: ReadonlyMap<string, { label: string }>;
  worldStates: ReadonlyMap<string, { major: boolean }>;
  /** قواعد روابط معتمدة (027). */
  approvedConnections: ReadonlySet<string>;
}

export interface RawRule {
  id: string;
  status: 'draft' | 'approved';
  scope: RuntimeScope;
  conditions: unknown;
  effects: unknown;
  sortOrder?: number;
}

/** عنصر جذري غير مغلق: معروف منذ فتح القضية — ليس اكتشافاً ولا تقدّماً. */
export const isOpenCaseRootObject = (o: { gated: boolean; parent: string | null } | undefined): boolean => !!o && !o.gated && !o.parent;

/**
 * شرط يُعتبر تقدّماً تحقيقياً — استقرائياً، حتى لا "يُغسل" دليل عبر قاعدة
 * وسيطة (دليل → كشف/تتبّع/تقدّم → حالة عالم كبرى):
 *   object_discovered — عنصر فرعي غير مغلق وُجد باللعب فقط (الكشف ليس فعلاً،
 *                       والجذر المعروف عند فتح القضية ليس اكتشافاً)
 *   object_state      — حالات تستثني الحالة الابتدائية (وصلها فعل لاعب أو تقدّم مشروط)
 *   connection_validated، خيط متتبَّع/مغلق — أفعال لاعب أو آثار مشروطة بتقدّم
 *   world_state       — حالة عالم كبرى فقط (مشروطة بتقدّم بدورها)
 */
export function isProgressCondition(c: RuntimeCondition, cat: AuthoringCatalogue): boolean {
  switch (c.kind) {
    case 'object_discovered': {
      const o = cat.objects.get(c.object);
      return !!o && !o.gated && !!o.parent;
    }
    case 'object_state': {
      const o = cat.objects.get(c.object);
      return !!o && !c.states.includes(o.initialState);
    }
    case 'connection_validated':
      return true;
    case 'world_state':
      return cat.worldStates.get(c.state)?.major === true;
    case 'lead':
      return c.status !== 'open';
    case 'evidence_unlocked':
      return false;
  }
}

/** شكل + نطاق (دائماً)، مثل محفّز SQL قبل الاعتماد. */
export function parseRule(raw: RawRule): { rule: RuntimeRule | null; issues: AuthoringIssue[] } {
  const issues: AuthoringIssue[] = [];
  const bad = (code: AuthoringIssueCode, detail: string) => issues.push({ rule: raw.id, code, detail });

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(raw.id)) bad('RUNTIME_RULE_INVALID', 'rule id');
  const rc = Array.isArray(raw.conditions) ? raw.conditions : null;
  const re = Array.isArray(raw.effects) ? raw.effects : null;
  if (!rc || rc.length < 1 || rc.length > 8) bad('RUNTIME_RULE_INVALID', 'conditions must be 1..8');
  if (!re || re.length < 1 || re.length > 8) bad('RUNTIME_RULE_INVALID', 'effects must be 1..8');

  const conditions = (rc ?? []).map(parseCondition);
  const effects = (re ?? []).map(parseEffect);
  conditions.forEach((c, i) => c === null && bad('RUNTIME_RULE_INVALID', `condition ${i}`));
  effects.forEach((e, i) => e === null && bad('RUNTIME_RULE_INVALID', `effect ${i}`));

  if (raw.scope === 'actor') {
    for (const e of effects) {
      if (e?.kind === 'reach_world_state') bad('RUNTIME_RULE_SCOPE', 'an actor rule cannot change the world');
      if (e?.kind === 'deliver_evidence') bad('RUNTIME_RULE_SCOPE', 'an actor rule cannot deliver material');
    }
  }

  if (issues.length > 0) return { rule: null, issues };
  return {
    rule: {
      id: raw.id,
      status: raw.status,
      scope: raw.scope,
      conditions: conditions as RuntimeCondition[],
      effects: effects as RuntimeEffect[],
      sortOrder: raw.sortOrder ?? 0,
    },
    issues,
  };
}

const NODE_CODE_IN_TEXT = /\b[A-Z]{1,3}-\d{2}\b|\{\{entity:/;

/** فحص قاعدة معتمدة ضد الكتالوج + كل القواعد المعتمدة الأخرى. */
export function validateApprovedRule(rule: RuntimeRule, cat: AuthoringCatalogue, others: readonly RuntimeRule[]): AuthoringIssue[] {
  const issues: AuthoringIssue[] = [];
  const bad = (code: AuthoringIssueCode, detail: string) => issues.push({ rule: rule.id, code, detail });

  for (const c of rule.conditions) {
    if ((c.kind === 'object_discovered' || c.kind === 'object_state') && !cat.objects.has(c.object)) bad('RUNTIME_RULE_REFERENCE', `unknown object ${c.object}`);
    else if (c.kind === 'object_discovered' && isOpenCaseRootObject(cat.objects.get(c.object))) {
      bad('RUNTIME_RULE_CAUSALITY', `object ${c.object} is known from case open (non-gated root); an open-case grant is not a discovery`);
    }
    if (c.kind === 'evidence_unlocked' && !cat.evidence.has(c.evidence)) bad('RUNTIME_RULE_REFERENCE', `unknown evidence ${c.evidence}`);
    if (c.kind === 'connection_validated' && !cat.approvedConnections.has(c.rule)) bad('RUNTIME_RULE_REFERENCE', `unknown or unapproved connection ${c.rule}`);
    if (c.kind === 'world_state' && !cat.worldStates.has(c.state)) bad('RUNTIME_RULE_REFERENCE', `unknown world state ${c.state}`);
    if (c.kind === 'lead' && !cat.leads.has(c.lead)) bad('RUNTIME_RULE_REFERENCE', `unknown lead ${c.lead}`);
  }
  for (const e of rule.effects) {
    if ((e.kind === 'open_lead' || e.kind === 'follow_lead' || e.kind === 'close_lead') && !cat.leads.has(e.lead)) bad('RUNTIME_RULE_REFERENCE', `unknown lead ${e.lead}`);
    if (e.kind === 'reveal_object' && !cat.objects.get(e.object)?.gated) bad('RUNTIME_RULE_REFERENCE', `reveal target ${e.object} must be a gated object`);
    if (e.kind === 'advance_object_state' && !cat.objects.has(e.object)) bad('RUNTIME_RULE_REFERENCE', `unknown object ${e.object}`);
    if (e.kind === 'reach_world_state' && !cat.worldStates.has(e.state)) bad('RUNTIME_RULE_REFERENCE', `unknown world state ${e.state}`);
    if (e.kind === 'deliver_evidence') {
      const ev = cat.evidence.get(e.evidence);
      if (!ev) bad('RUNTIME_RULE_REFERENCE', `unknown evidence ${e.evidence}`);
      else if (ev.requires.length !== 1 || ev.requires[0] !== RUNTIME_ONLY_REQUIRES[0] || ev.initial === true) {
        bad('RUNTIME_RULE_CAUSALITY', `delivered material ${e.evidence} must be runtime-only (requires = {@RUNTIME}, not initial)`);
      }
    }
  }

  const hasProgress = rule.conditions.some((c) => isProgressCondition(c, cat));
  if (!hasProgress && rule.effects.some((e) => e.kind === 'follow_lead' || e.kind === 'close_lead' || e.kind === 'advance_object_state')) {
    bad('RUNTIME_RULE_CAUSALITY', 'following/closing a lead or advancing an object needs investigation progression, not evidence alone');
  }
  const approvedOthers = others.filter((r) => r.status === 'approved' && r.id !== rule.id);

  for (const e of rule.effects) {
    if (e.kind !== 'reach_world_state') continue;
    const major = cat.worldStates.get(e.state)?.major === true;
    if (major) {
      if (!hasProgress) bad('RUNTIME_RULE_CAUSALITY', `major world state ${e.state} needs investigation progression, not evidence alone`);
      for (const c of rule.conditions) {
        if (c.kind !== 'evidence_unlocked') continue;
        const aftermath = approvedOthers.some(
          (r) =>
            r.conditions.some((x) => x.kind === 'world_state' && x.state === e.state) &&
            r.effects.some((x) => x.kind === 'deliver_evidence' && x.evidence === c.evidence),
        );
        if (aftermath) bad('RUNTIME_RULE_CAUSALITY', `${c.evidence} is aftermath of ${e.state} and cannot cause it`);
      }
    }
    if (rule.conditions.some((c) => c.kind === 'world_state' && c.state === e.state)) {
      bad('RUNTIME_RULE_CAUSALITY', 'rule requires the world state it reaches');
    }
  }

  // other direction: this rule delivers aftermath of W
  for (const e of rule.effects) {
    if (e.kind !== 'deliver_evidence') continue;
    for (const c of rule.conditions) {
      if (c.kind !== 'world_state' || cat.worldStates.get(c.state)?.major !== true) continue;
      const inverted = approvedOthers.some(
        (r) =>
          r.effects.some((x) => x.kind === 'reach_world_state' && x.state === c.state) &&
          r.conditions.some((x) => x.kind === 'evidence_unlocked' && x.evidence === e.evidence),
      );
      if (inverted) bad('RUNTIME_RULE_CAUSALITY', `${e.evidence} is aftermath of ${c.state} and cannot cause it`);
    }
  }
  return issues;
}

/**
 * Lint مجموعة كاملة (لمراجعة مسودة قبل الإدخال). إضافة لفحوص SQL:
 *   • لا كود عقدة ولا مرجع كيان داخل وصف خيط (الخيط اتجاه، لا جواب).
 */
export function lintRuleSet(raws: readonly RawRule[], cat: AuthoringCatalogue): AuthoringIssue[] {
  const issues: AuthoringIssue[] = [];
  const parsed: RuntimeRule[] = [];
  for (const raw of raws) {
    const { rule, issues: shape } = parseRule(raw);
    issues.push(...shape);
    if (rule) parsed.push(rule);
  }
  for (const rule of parsed) {
    if (rule.status === 'approved') issues.push(...validateApprovedRule(rule, cat, parsed));
  }
  for (const [lead, { label }] of cat.leads) {
    if (NODE_CODE_IN_TEXT.test(label)) issues.push({ rule: `lead:${lead}`, code: 'RUNTIME_LEAD_LABEL', detail: 'a lead label must not name a node code or entity' });
  }
  return issues;
}
