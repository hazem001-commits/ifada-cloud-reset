// ============================================================
// src/app/case/[code]/evidence/authoredContext.ts
// "تفاصيل الدليل": الوسائط هي العرض الأساسي للدليل، لكن ربطها لا
// يجوز أن يُخفي نص الدليل المكتوب الذي يراه اللاعب أصلاً.
//
// المصدر الوحيد: item.body — نفس الحقل اللي يعرضه عارض الوثائق
// النصي للدليل بلا وسائط، كما رجع من evidence_index (null لغير
// صاحب التخصص). لا حقل آخر يدخل هنا: لا مسار وسائط، لا حل، لا
// ملاحظات داخلية. النص يُعاد حرفياً — بلا تلخيص ولا إعادة صياغة.
// ============================================================

import type { EvidenceItem } from '@/types/case';

/**
 * النص المكتوب للدليل حين تكون له وسائط — أو null.
 * بلا وسائط: null عمداً، لأن العارض النصي يعرض النص نفسه (لا تكرار).
 */
export function authoredContextFor(item: Pick<EvidenceItem, 'has_media' | 'readable' | 'body'>): string | null {
  if (!item.has_media) return null;
  if (item.readable !== true) return null;
  if (typeof item.body !== 'string' || item.body.trim() === '') return null;
  return item.body;
}

/**
 * رسالة التفريغ الزمني الفارغ بمحطة الصوت. نص الدليل ليس تفريغاً
 * زمنياً — ما بنحوّله لمقاطع ولا بنختلق توقيتات؛ بس ما بنقول إنه
 * "ما في أي نص" وهو موجود بتفاصيل الدليل.
 */
export function transcriptEmptyMessage(hasAuthoredContext: boolean): string {
  return hasAuthoredContext
    ? 'لا يوجد تفريغ زمني لهذا التسجيل. تفاصيل الدليل متاحة من «تفاصيل الدليل».'
    : 'لا يوجد تفريغ نصي مرفق بهذا التسجيل.';
}
