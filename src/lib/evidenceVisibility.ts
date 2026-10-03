// ============================================================
// src/lib/evidenceVisibility.ts
// قاعدة واحدة لـ"وجود" الدليل بالنسبة للاعب — يستخدمها البحث المؤسَّس
// (src/lib/inquiry/search.ts) وعقد المعرفة للذكاء الاصطناعي
// (src/lib/ai/knowledge.ts) معاً، حتى لا يختلفا أبداً.
//
// المدخل الوحيد المقبول: صفوف evidence_index التي رجعت بجلسة اللاعب
// نفسه. evidence_index لا يرجع إلا أدلة مفتوحة بالجلسة؛ ولغير حامل
// التخصص يرجع: الكود، العنوان، النوع، التخصص، الوقت — بلا نص.
//
// ثلاث فئات منفصلة عمداً (لا تُدمج):
//   readable   — أملك تخصصه: المحتوى كاملاً.
//   restricted — قاعدة منتج مقصودة: الدليل المفتوح خارج تخصصي "محجوب"
//                — أعرف أنه موجود (عنوانه)، وصاحب التخصص يقرأه لي.
//                مسموح فقط إن سمح عقد القضية بذلك (restrictedEvidence = 'title').
//   hidden     — كل ما عدا ذلك: غير مفتوح، قناة خاصة لزميل، صف مشوّه،
//                أو قضية سياستها 'hidden'. غير موجود إطلاقاً: لا كود ولا
//                عنوان ولا عدد ولا أي إشارة.
// ============================================================
import type { EvidenceRow } from './inquiry/search';

/** سياسة القضية للدليل غير المقروء: يظهر بعنوانه (غرفة 714) أو لا يظهر (قنوات خاصة). */
export type RestrictedEvidencePolicy = 'title' | 'hidden';

export type EvidenceVisibility = 'readable' | 'restricted';

/** null = مخفي: يجب ألا يوجد لهذا اللاعب بأي سطح. */
export function evidenceVisibility(row: EvidenceRow, policy: RestrictedEvidencePolicy): EvidenceVisibility | null {
  if (row.readable === true && typeof row.body === 'string') return 'readable';
  if (row.readable === false || row.readable === true) return policy === 'title' ? 'restricted' : null;
  return null; // صف مشوّه (readable غير منطقي) → مخفي
}

/**
 * مصدر واحد لكل سطح عميل (لوحة الأدلة، ملف القضية، المشهد، بطاقة الفريق):
 * صفوف evidence_index بعد سياسة القضية. المخفي يُحذف من المصدر — لا
 * عنوان ولا كود ولا عدد ولا مكان فارغ. القابلية للقراءة يقرّرها توزيع
 * القضية بالسيرفر (readable)؛ هنا لا استنتاج من تخصص ولا من قناة.
 */
export function visibleEvidenceRows<T extends EvidenceRow>(rows: readonly T[], policy: RestrictedEvidencePolicy): T[] {
  return rows.filter((r) => evidenceVisibility(r, policy) !== null);
}
