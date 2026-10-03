// ============================================================
// src/lib/ai/hypothesis.ts
// اختبار ضغط الفرضية — حدّ الإدخال/الإخراج الحتمي (بلا نموذج لغوي بعد).
//
// اللاعب: "كريم أخذ رامي إلى M1 بعد منتصف الليل."
// النظام المستقبلي يعيد — من المعرفة المصرّح بها فقط:
//   حقائق داعمة، حقائق مناقضة، افتراضات بلا سند، أسئلة أدلة ناقصة،
//   تعارضات زمنية.
// ولا يعيد أبداً: أدلة مخفية، حقيقة الحل، حقائق زميل خاصة، أو حكم
// "صح/خطأ" كأنه مصدر للحقيقة.
//
// الضمانات هنا بنيوية:
//   1. buildStressTestContext لا يقبل إلا AuthorizedKnowledge (نوع موسوم)،
//      ولا يضع بالسياق إلا حقائق أملك محتواها.
//   2. validateStressTestResult يرفض أي مخرج: يستشهد بحقيقة ليست بالسياق،
//      أو يحمل حقلاً غير معرّف (حكم/حل/ثقة)، أو يتجاوز الحدود.
// ============================================================
import type { AuthorizedFact, AuthorizedKnowledge } from './knowledge';

export const MAX_HYPOTHESIS_CHARS = 400;
export const MAX_CONTEXT_FACTS = 120;
const MAX_ITEMS = 8;
const MAX_NOTE = 280;

export interface StressTestContext {
  caseId: string;
  hypothesis: string;
  /** حقائق أملك محتواها فقط — هي وحدها قابلة للاستشهاد. */
  facts: readonly AuthorizedFact[];
  /**
   * عناوين أدلة "محجوبة" يعرضها سطح اللاعب نفسه (restricted) — لصياغة
   * "أسئلة أدلة ناقصة" فقط، وغير قابلة للاستشهاد. الدليل المخفي غائب هنا كلياً.
   */
  titleOnly: readonly string[];
}

export type ContextResult =
  | { ok: true; context: StressTestContext }
  | { ok: false; reason: 'EMPTY' | 'TOO_LONG' };

export function buildStressTestContext(knowledge: AuthorizedKnowledge, hypothesis: string): ContextResult {
  const text = hypothesis.replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'EMPTY' };
  if (text.length > MAX_HYPOTHESIS_CHARS) return { ok: false, reason: 'TOO_LONG' };
  const readable = knowledge.facts.filter((f) => f.visibility === 'readable').slice(0, MAX_CONTEXT_FACTS);
  const titleOnly = knowledge.facts.filter((f) => f.visibility === 'restricted').map((f) => f.title);
  return { ok: true, context: { caseId: knowledge.caseId, hypothesis: text, facts: readable, titleOnly } };
}

export interface FactCitation {
  factId: string;
  note: string;
}

/** الشكل الوحيد المقبول للمخرج — لا حقل حكم، لا حقل حل، لا درجة ثقة. */
export interface StressTestResult {
  supporting: FactCitation[];
  contradicting: FactCitation[];
  unsupportedAssumptions: string[];
  missingEvidenceQuestions: string[];
  timelineIssues: FactCitation[];
}

const RESULT_KEYS = ['supporting', 'contradicting', 'unsupportedAssumptions', 'missingEvidenceQuestions', 'timelineIssues'] as const;
const CITATION_KEYS = ['supporting', 'contradicting', 'timelineIssues'] as const;
const TEXT_KEYS = ['unsupportedAssumptions', 'missingEvidenceQuestions'] as const;

export type ResultCheck =
  | { ok: true; result: StressTestResult }
  | { ok: false; reason: 'NOT_OBJECT' | 'UNKNOWN_FIELD' | 'BAD_SHAPE' | 'UNCITED_FACT' | 'TOO_MANY' | 'TOO_LONG' };

/**
 * يتحقق من مخرج (نموذج لغوي مستقبلاً) قبل أن يصل للاعب. أي خرق = رفض
 * كامل — لا "تصحيح" جزئي قد يمرر شيئاً.
 */
export function validateStressTestResult(raw: unknown, context: StressTestContext): ResultCheck {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'NOT_OBJECT' };
  const obj = raw as Record<string, unknown>;
  // حقل غير معرّف (verdict، correct، solution، confidence…) = رفض.
  if (Object.keys(obj).some((k) => !(RESULT_KEYS as readonly string[]).includes(k))) return { ok: false, reason: 'UNKNOWN_FIELD' };
  const allowed = new Set(context.facts.map((f) => f.id));

  for (const key of CITATION_KEYS) {
    const list = obj[key];
    if (!Array.isArray(list)) return { ok: false, reason: 'BAD_SHAPE' };
    if (list.length > MAX_ITEMS) return { ok: false, reason: 'TOO_MANY' };
    for (const c of list) {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, reason: 'BAD_SHAPE' };
      const cc = c as Record<string, unknown>;
      if (Object.keys(cc).some((k) => k !== 'factId' && k !== 'note')) return { ok: false, reason: 'UNKNOWN_FIELD' };
      if (typeof cc.factId !== 'string' || typeof cc.note !== 'string') return { ok: false, reason: 'BAD_SHAPE' };
      // الاستشهاد بحقيقة خارج السياق (مخفية، لزميل، مختلقة) = رفض.
      if (!allowed.has(cc.factId)) return { ok: false, reason: 'UNCITED_FACT' };
      if (cc.note.length > MAX_NOTE) return { ok: false, reason: 'TOO_LONG' };
    }
  }
  for (const key of TEXT_KEYS) {
    const list = obj[key];
    if (!Array.isArray(list)) return { ok: false, reason: 'BAD_SHAPE' };
    if (list.length > MAX_ITEMS) return { ok: false, reason: 'TOO_MANY' };
    for (const t of list) {
      if (typeof t !== 'string') return { ok: false, reason: 'BAD_SHAPE' };
      if (t.length > MAX_NOTE) return { ok: false, reason: 'TOO_LONG' };
    }
  }
  return { ok: true, result: obj as unknown as StressTestResult };
}
