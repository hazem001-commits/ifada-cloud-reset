// ============================================================
// src/lib/connections/types.ts
// محرك الروابط المتحقَّق منها — النموذج المشترك.
//
//   اللاعب يقترح رابطاً → السيرفر يتحقق ضد حقيقة القضية المكتوبة
//   → حالة اللعبة قد تتفاعل (دليل مشتق، فصل جديد، تناقض مثبت).
//
// ثلاث طبقات منفصلة عمداً:
//   1. PlayerConnection       — ما يقترحه اللاعب. لا يحمل أي حقيقة.
//   2. AuthoredConnectionRule — رابط صحيح مكتوب بالقضية (سيرفر فقط).
//   3. DerivedUnlockCondition — شرط مشتق من روابط مثبتة (سيرفر فقط).
//
// الذكاء الاصطناعي ليس مصدر حقيقة هنا: التحقق حتمي ومكتوب. قد
// يساعد لاحقاً باقتراح روابط مرشّحة، لكنها تمر بنفس المدقق.
// ============================================================

export const NODE_KINDS = [
  'evidence',
  'object',
  'entity',
  'location',
  'event',
  'claim',
  'question',
  'hypothesis',
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

/** مرجع عقدة ضمن قضية واحدة: النوع + كود/مقبض ضمن نطاق تلك القضية. */
export interface NodeRef {
  kind: NodeKind;
  id: string;
}

/** نوع العلاقة التي يدّعيها اللاعب (اختياري). */
export const RELATION_KINDS = [
  'supports',
  'contradicts',
  'same_entity',
  'sequence',
  'located_at',
  'explains',
] as const;

export type RelationKind = (typeof RELATION_KINDS)[number];

/** (1) اقتراح لاعب — بيانات إدخال فقط، لا تُعامل كحقيقة أبداً. */
export interface PlayerConnection {
  nodes: NodeRef[];
  relation?: RelationKind;
  /** ملاحظة حرة للفريق — لا تُقيَّم ولا تؤثر على التحقق. */
  note?: string;
}

/** أثر رابط مثبت (يطبّقه السيرفر عبر المسارات المعتمدة فقط). */
export type ConnectionEffect =
  /** يمر عبر unlock_evidence المعتمدة — نفس شروط الدليل وتخصصه. */
  | { kind: 'unlock_evidence'; evidence: string }
  | { kind: 'unlock_chapter'; chapter: string }
  | { kind: 'mark_contradiction'; id: string };

/** (2) رابط صحيح مكتوب — حقيقة قضية، سيرفر فقط. */
export interface AuthoredConnectionRule {
  id: string;
  /** العقد المطلوبة (مجموعة، الترتيب غير مهم). */
  requires: NodeRef[];
  /** إن حُدد: علاقة اللاعب (إن ذكرها) يجب أن تطابقه. */
  relation?: RelationKind;
  /**
   * كم عقدة زائدة يُسمح بها فوق المطلوب. الافتراضي 0 = تطابق تام —
   * يمنع "رمي كل ما أعرفه" لاصطياد قاعدة.
   */
  allowExtra?: number;
  /** معنى الرابط للفريق — يُعرض فقط بعد التثبيت. */
  meaning: string;
  effects: ConnectionEffect[];
}

/** (3) شرط مشتق: مجموعة روابط مثبتة → آثار (فصل، دليل مشتق). */
export interface DerivedUnlockCondition {
  id: string;
  /** كل هذه القواعد مثبتة. */
  all?: string[];
  /** أو: على الأقل min منها. */
  anyOf?: { ids: string[]; min: number };
  effects: ConnectionEffect[];
}

/**
 * مجموعة قواعد قضية. draft = مكتوبة من مستندات القضية لكن بانتظار
 * اعتماد (مثلاً قبل اعتماد خريطة أكواد الأدلة) — لا تُطبَّق باللعب.
 */
export interface ConnectionRuleSet {
  caseId: string;
  status: 'draft' | 'approved';
  rules: AuthoredConnectionRule[];
  conditions: DerivedUnlockCondition[];
}

/** ما يعرفه المقترِح فعلاً (مصرّح له) — من طبقة المعرفة المصرّح بها. */
export interface KnowledgeView {
  knows(node: NodeRef): boolean;
}

/**
 * نتيجة الاقتراح. "غير مثبت" واحدة لكل الحالات: رابط خاطئ، عقدة لا
 * يعرفها المقترِح، عقدة غير موجودة، قاعدة غير معتمدة — بلا سبب، حتى لا
 * يصير المدقق أداة كشف لما هو صحيح أو موجود.
 */
export type ProposalOutcome =
  | { status: 'validated'; ruleId: string; meaning: string; effects: ConnectionEffect[] }
  | { status: 'not_established' }
  | { status: 'invalid_request'; reason: InvalidReason };

/** أخطاء شكل الطلب فقط (لا علاقة لها بالحقيقة). */
export type InvalidReason = 'too_few_nodes' | 'too_many_nodes' | 'duplicate_nodes' | 'bad_node' | 'bad_relation';
