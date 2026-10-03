// ============================================================
// src/lib/connections/validate.ts
// مدقق الروابط — دوال نقية حتمية. لا شبكة، لا نموذج لغوي، لا حالة.
// السيرفر يستدعيها مع: قواعد القضية (سيرفر فقط) + معرفة المقترِح
// المصرّح بها، ثم يطبّق الآثار عبر المسارات المعتمدة (unlock_evidence…).
// ============================================================
import {
  NODE_KINDS,
  RELATION_KINDS,
  type AuthoredConnectionRule,
  type ConnectionEffect,
  type ConnectionRuleSet,
  type DerivedUnlockCondition,
  type KnowledgeView,
  type NodeRef,
  type PlayerConnection,
  type ProposalOutcome,
} from './types';

export const MIN_NODES = 2;
export const MAX_NODES = 5;
const ID_RE = /^[A-Za-z0-9_:-]{1,64}$/;

export const nodeKey = (n: NodeRef): string => `${n.kind}:${n.id.trim().toUpperCase()}`;

const NOT_ESTABLISHED: ProposalOutcome = { status: 'not_established' };

/** فحص شكل الطلب فقط — لا يلمس الحقيقة. */
export function checkShape(p: PlayerConnection): ProposalOutcome | null {
  if (!Array.isArray(p.nodes) || p.nodes.length < MIN_NODES) return { status: 'invalid_request', reason: 'too_few_nodes' };
  if (p.nodes.length > MAX_NODES) return { status: 'invalid_request', reason: 'too_many_nodes' };
  for (const n of p.nodes) {
    if (!n || !(NODE_KINDS as readonly string[]).includes(n.kind) || typeof n.id !== 'string' || !ID_RE.test(n.id.trim())) {
      return { status: 'invalid_request', reason: 'bad_node' };
    }
  }
  if (new Set(p.nodes.map(nodeKey)).size !== p.nodes.length) return { status: 'invalid_request', reason: 'duplicate_nodes' };
  if (p.relation !== undefined && !(RELATION_KINDS as readonly string[]).includes(p.relation)) {
    return { status: 'invalid_request', reason: 'bad_relation' };
  }
  return null;
}

function ruleMatches(rule: AuthoredConnectionRule, keys: ReadonlySet<string>, p: PlayerConnection): boolean {
  const required = rule.requires.map(nodeKey);
  if (!required.every((k) => keys.has(k))) return false;
  if (keys.size - required.length > (rule.allowExtra ?? 0)) return false;
  if (rule.relation && p.relation && rule.relation !== p.relation) return false;
  return true;
}

/**
 * تحقق من اقتراح لاعب.
 * ترتيب صارم: الشكل → خصوصية كل عقدة → اعتماد القواعد → المطابقة.
 * أي عقدة لا يعرفها المقترِح = "غير مثبت" (نفس رد الرابط الخاطئ).
 */
export function validateProposal(
  proposal: PlayerConnection,
  ruleSet: ConnectionRuleSet,
  knowledge: KnowledgeView,
): ProposalOutcome {
  const shape = checkShape(proposal);
  if (shape) return shape;

  // الخصوصية أولاً: لا تطابق ولا أي معالجة لعقدة غير مصرّح بها.
  if (!proposal.nodes.every((n) => knowledge.knows(n))) return NOT_ESTABLISHED;

  // قواعد مسودة لا تُطبَّق باللعب.
  if (ruleSet.status !== 'approved') return NOT_ESTABLISHED;

  const keys = new Set(proposal.nodes.map(nodeKey));
  // أول قاعدة مطابقة بالترتيب المكتوب — حتمي.
  const rule = ruleSet.rules.find((r) => ruleMatches(r, keys, proposal));
  if (!rule) return NOT_ESTABLISHED;
  return { status: 'validated', ruleId: rule.id, meaning: rule.meaning, effects: rule.effects };
}

function conditionMet(c: DerivedUnlockCondition, validated: ReadonlySet<string>): boolean {
  if (!c.all && !c.anyOf) return false; // شرط فارغ لا يتحقق أبداً (مغلق عند الشك)
  if (c.all && !c.all.every((id) => validated.has(id))) return false;
  if (c.anyOf) {
    const hits = c.anyOf.ids.filter((id) => validated.has(id)).length;
    if (hits < c.anyOf.min) return false;
  }
  return true;
}

/**
 * الشروط المشتقة المتحققة الآن ولم تُطبَّق من قبل. idempotent: تمرير
 * already يمنع تكرار الآثار.
 */
export function newlySatisfiedConditions(
  ruleSet: ConnectionRuleSet,
  validatedRuleIds: ReadonlySet<string>,
  alreadyApplied: ReadonlySet<string>,
): { conditionId: string; effects: ConnectionEffect[] }[] {
  if (ruleSet.status !== 'approved') return [];
  return ruleSet.conditions
    .filter((c) => !alreadyApplied.has(c.id) && conditionMet(c, validatedRuleIds))
    .map((c) => ({ conditionId: c.id, effects: c.effects }));
}

/**
 * سلامة مجموعة قواعد (للاختبارات والمراجعة): معرّفات فريدة، شروط تشير
 * لقواعد موجودة، min منطقي، ولا قاعدة تتطلب أقل من عقدتين أو أكثر من الحد.
 */
export function ruleSetProblems(ruleSet: ConnectionRuleSet): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const r of ruleSet.rules) {
    if (ids.has(r.id)) problems.push(`duplicate rule ${r.id}`);
    ids.add(r.id);
    if (r.requires.length < MIN_NODES || r.requires.length > MAX_NODES) problems.push(`rule ${r.id} size`);
    if (new Set(r.requires.map(nodeKey)).size !== r.requires.length) problems.push(`rule ${r.id} duplicate nodes`);
    if (r.requires.length + (r.allowExtra ?? 0) > MAX_NODES) problems.push(`rule ${r.id} allowExtra exceeds MAX_NODES`);
  }
  const cids = new Set<string>();
  for (const c of ruleSet.conditions) {
    if (cids.has(c.id)) problems.push(`duplicate condition ${c.id}`);
    cids.add(c.id);
    if (!c.all && !c.anyOf) problems.push(`condition ${c.id} empty`);
    for (const id of [...(c.all ?? []), ...(c.anyOf?.ids ?? [])]) {
      if (!ids.has(id)) problems.push(`condition ${c.id} → unknown rule ${id}`);
    }
    if (c.anyOf && (c.anyOf.min < 1 || c.anyOf.min > c.anyOf.ids.length)) problems.push(`condition ${c.id} min`);
  }
  return problems;
}

/** الرد الوحيد المسموح للاعب — نفس شكل propose_connection بالسيرفر (sql/027). */
export type PlayerProposalResponse =
  | { status: 'validated'; meaning: string }
  | { status: 'not_established' }
  | { status: 'invalid_request' };

/**
 * يجرّد نتيجة المدقق مما لا يخرج للاعب أبداً: معرّف القاعدة، الآثار
 * (أهداف الفتح)، سبب رفض الشكل. كل ما عدا ذلك يبقى بالسيرفر.
 */
export function toPlayerResponse(outcome: ProposalOutcome): PlayerProposalResponse {
  if (outcome.status === 'validated') return { status: 'validated', meaning: outcome.meaning };
  if (outcome.status === 'invalid_request') return { status: 'invalid_request' };
  return { status: 'not_established' };
}
