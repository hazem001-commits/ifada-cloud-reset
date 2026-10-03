// ============================================================
// src/app/case/[code]/evidence/classify.ts
// تصنيف الدليل لطريقة عرضه. مبني فقط على حقول حقيقية موجودة
// بالفعل (kind + عنوان الدليل + contentType المُرجع من السيرفر)
// — لا اعتماد على مسار Storage ولا تخمين محتوى غير موجود.
//
// الترتيب:
//   1) نوع الملف الفعلي (contentType) يحدد عائلة العارض أولاً:
//      صوت ← محطة الصوت، فيديو ← محطة الفيديو، صورة ← عرض صوري حسب
//      معنى الدليل، PDF/غيره ← عارض الوثائق.
//   2) معنى الدليل (kind + العنوان) يحدد الشكل داخل العائلة.
//   3) نوع الملف غير معروف (ملف القضية، أو قبل وصول الوسائط):
//      تقدير من kind — مع قاعدة أمان: kind='video' وحده لا يعني
//      فيديو قابلاً للتشغيل أبداً (D-06 إطار مستعاد، ليس تسجيلاً).
// ============================================================

import type { EvidenceItem } from '@/types/case';
import type { EvidencePresentation } from './types';

const SURVEILLANCE_KEYWORDS = ['كاميرا', 'كاميرات', 'مراقبة', 'مصعد', 'cctv'];
const OFFICIAL_KEYWORDS = [
  'سجل',
  'تحويلات',
  'عقد',
  'مالي',
  'مالية',
  'مصرفي',
  'حكومي',
  'رسمي',
  'consulting',
];
const PHONE_KEYWORDS = ['محادثة', 'رسائل', 'شات', 'دردشة', 'واتساب'];

function titleMatches(title: string, keywords: string[]): boolean {
  const t = title.toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

type MediaFamily = 'audio' | 'video' | 'image' | 'document';

/** عائلة الملف الفعلي من contentType السيرفر. null = غير معروف بعد. */
function mediaFamily(contentType?: string | null): MediaFamily | null {
  if (!contentType) return null;
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('image/')) return 'image';
  return 'document';
}

/** وثيقة: سجل رسمي حسب العنوان، وإلا وثيقة عادية. */
function documentPresentation(item: Pick<EvidenceItem, 'title'>): EvidencePresentation {
  return titleMatches(item.title, OFFICIAL_KEYWORDS) ? 'official-record' : 'document';
}

/** صورة فعلية: الشكل حسب معنى الدليل، لا حسب كونها صورة فقط. */
function imagePresentation(item: Pick<EvidenceItem, 'kind' | 'title'>): EvidencePresentation {
  if (titleMatches(item.title, PHONE_KEYWORDS)) return 'phone';
  if (titleMatches(item.title, SURVEILLANCE_KEYWORDS)) return 'surveillance-image';
  // إطار ثابت من تسجيل (مثل D-06): لقطة، ولا يصل لمحطة الفيديو أبداً.
  if (item.kind === 'video') return 'surveillance-image';
  // سجل/وثيقة/إفادة مصوّرة = مسح لوثيقة، مش صورة اجتماعية.
  if (item.kind === 'record') return 'official-record';
  if (item.kind === 'document' || item.kind === 'testimony') return documentPresentation(item);
  return 'social-image';
}

export function classifyEvidence(
  item: Pick<EvidenceItem, 'kind' | 'title'>,
  contentType?: string | null,
): EvidencePresentation {
  switch (mediaFamily(contentType)) {
    case 'audio':
      return 'audio';
    case 'video':
      return 'video';
    case 'image':
      return imagePresentation(item);
    case 'document':
      return documentPresentation(item);
  }

  // نوع الملف غير معروف: تقدير من معنى الدليل فقط.
  if (item.kind === 'audio') return 'audio';
  // لا نفترض فيديو قابلاً للتشغيل من kind وحده — العارض الصوري آمن
  // حتى يثبت contentType أن الملف فيديو فعلاً.
  if (item.kind === 'video') return 'surveillance-image';
  if (titleMatches(item.title, PHONE_KEYWORDS)) return 'phone';
  if (item.kind === 'photo') {
    return titleMatches(item.title, SURVEILLANCE_KEYWORDS) ? 'surveillance-image' : 'social-image';
  }
  return documentPresentation(item);
}
