// ============================================================
// src/app/case/[code]/evidence/document/documentVariant.ts
// تصنيف بصري للوثائق (طبقة عرض فقط): رسمي/مالي/أمني/طبي/أرشيفي.
// مبني حصراً على حقول موجودة (kind + owner_spec + العنوان) — لا
// يضيف أي معلومة للقصة، بس يختار "شكل الملف" المناسب.
// ============================================================

import type { EvidenceItem } from '@/types/case';

export type DocumentVariant =
  | 'standard'
  | 'official'
  | 'financial'
  | 'security'
  | 'medical'
  | 'archival';

const FINANCIAL = ['تحويل', 'تحويلات', 'مالي', 'مالية', 'مصرف', 'بنك', 'حساب', 'فاتورة', 'عقد'];
const SECURITY = ['مراقبة', 'كاميرا', 'كاميرات', 'أمن', 'الأمن', 'الدخول', 'بطاقات', 'الأبواب'];
const MEDICAL = ['طبي', 'طبية', 'تشريح', 'وفاة', 'عينة', 'الدم', 'مخبري', 'الطوارئ'];

function hasAny(title: string, words: string[]): boolean {
  return words.some((w) => title.includes(w));
}

export function documentVariantFor(
  item: Pick<EvidenceItem, 'kind' | 'title' | 'owner_spec'>,
): DocumentVariant {
  const title = item.title;
  if (hasAny(title, FINANCIAL)) return 'financial';
  if (item.owner_spec === 'forensics' && hasAny(title, MEDICAL)) return 'medical';
  if (item.owner_spec === 'digital' && hasAny(title, SECURITY)) return 'security';
  if (item.owner_spec === 'records') return 'archival';
  if (item.kind === 'record') return 'official';
  return 'standard';
}

export const VARIANT_LABEL: Record<DocumentVariant, { ar: string; en: string }> = {
  standard: { ar: 'وثيقة', en: 'DOCUMENT' },
  official: { ar: 'سجل رسمي', en: 'OFFICIAL RECORD' },
  financial: { ar: 'سجل مالي', en: 'FINANCIAL RECORD' },
  security: { ar: 'سجل أمني', en: 'SECURITY RECORD' },
  medical: { ar: 'تقرير طبي', en: 'MEDICAL REPORT' },
  archival: { ar: 'ملف أرشيف', en: 'ARCHIVE FILE' },
};

/** الوثائق غير العادية تحمل ختم "سري" إضافي — ختم تصنيف، لا معلومة قصصية. */
export function isClassified(variant: DocumentVariant): boolean {
  return variant !== 'standard';
}
