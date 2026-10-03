// ============================================================
// src/app/case/[code]/investigation/scene/objectViews.ts
// لقطات قريبة لعناصر التحقيق (عرض فقط — ليست أدلة). المفاتيح
// والتسميات تأتي من عرض القضية الحالية (src/cases/<case>/presentation.ts
// → objectViews)؛ مسارات Storage بالسيرفر وحده. هذا الملف قاعدة
// الإتاحة المشتركة فقط — لا بيانات قضية.
// ============================================================

import type { InvestigationObject } from '@/types/investigationObjects';
import { own, type CasePresentation, type ObjectView } from '@/cases/presentation';
import { isMineOrShared } from '../labels';

export type { ObjectView };

/**
 * اللقطات المتاحة لهذا اللاعب: فقط لعنصر يعرفه (اكتشافه أو مشترك) —
 * نفس شرط السيرفر، ومن لقطات قضيته الحالية فقط. قبل الفحص، أو
 * لاكتشاف زميل خاص: لا لقطة.
 */
export function closeUpViewsFor(
  object: InvestigationObject | undefined,
  views: CasePresentation['objectViews'],
): readonly ObjectView[] {
  if (!object || !isMineOrShared(object)) return [];
  return own(views, object.code) ?? [];
}
