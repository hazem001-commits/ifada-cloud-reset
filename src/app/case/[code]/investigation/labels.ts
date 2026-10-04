// ============================================================
// src/app/case/[code]/investigation/labels.ts
// ترجمة حالة العنصر لعبارة عربية طبيعية — بدون كشف اسم الحالة
// التقني نفسه. 'HIDDEN' هون مش اسم حالة قضية، هو إشارة الحجب
// المتعمّدة من investigation_object_index نفسها (راجع sql/019) —
// عرضها آمن لأنها بالضبط الإشارة المطلوب إظهارها.
// ============================================================

import type { Specialization } from '@/types/database';
import type { InvestigationObject } from '@/types/investigationObjects';

export function isRedactedToMe(object: InvestigationObject): boolean {
  return object.discovered && object.state === 'HIDDEN';
}

export function isMineOrShared(object: InvestigationObject): boolean {
  return object.discovered && object.state !== 'HIDDEN';
}

/** اكتشافي الخاص غير المشارك (لا زميل، لا مشترك). */
export const isPrivateMine = (o: InvestigationObject) => o.discovered && !o.is_shared && o.state !== 'HIDDEN';

/**
 * أصول عنصر (عدا الموقع) هي اكتشافاتي الخاصة غير المشاركة — من الأعلى للأسفل.
 * مشاركة الابن وحده لا تكفي: الفريق لا يرى عنصراً أصله خاص بي (026).
 */
export function privateAncestors(objects: readonly InvestigationObject[], code: string): InvestigationObject[] {
  const byCode = new Map(objects.map((o) => [o.code, o]));
  const chain: InvestigationObject[] = [];
  let cur = byCode.get(code)?.parent_code ? byCode.get(byCode.get(code)!.parent_code!) : undefined;
  for (let depth = 0; cur && cur.category !== 'location' && depth < 8; depth += 1) {
    if (isPrivateMine(cur)) chain.unshift(cur);
    cur = cur.parent_code ? byCode.get(cur.parent_code) : undefined;
  }
  return chain;
}

// ------------------------------------------------------------
// لغة الحالة الموحّدة: نغمة + تسمية قصيرة + تلميح. كلها مشتقة من
// أعلام حقيقية رجعت من السيرفر (discovered / is_shared / processing /
// إشارة HIDDEN). "جاهز" = معالجة خلصت أثناء وجودك بالجلسة (عرض محلي فقط).
// ------------------------------------------------------------
export type StatusTone = 'idle' | 'private' | 'teammate' | 'shared' | 'processing' | 'ready';

export interface ObjectStatus {
  tone: StatusTone;
  label: string;
  hint: string;
}

export function objectStatus(object: InvestigationObject, ready = false): ObjectStatus {
  // لم يُكتشف بعد: "متاح للتحقيق" فقط إذا رجع لي السيرفر إجراءً عليه فعلاً.
  if (!object.discovered) {
    return object.actions.length > 0
      ? { tone: 'idle', label: 'متاح للتحقيق', hint: 'لم يفحصه أحد بعد، وتستطيع البدء' }
      : { tone: 'idle', label: 'خارج ملاحظتك', hint: 'لا شيء هنا تلتقطه عينك — قد يلاحظ زميلك ما يفوتك' };
  }
  if (isRedactedToMe(object)) {
    return { tone: 'teammate', label: 'لدى زميل', hint: 'زميل اكتشف شيئاً هنا ولم يشاركه بعد' };
  }
  if (object.processing) return { tone: 'processing', label: 'قيد التحليل', hint: 'يستمر في الخلفية' };
  if (ready) return { tone: 'ready', label: 'النتيجة جاهزة', hint: 'اكتملت المعالجة' };
  if (!object.is_shared) return { tone: 'private', label: 'اكتشاف خاص', hint: 'أنت فقط تعرف هذا' };
  return { tone: 'shared', label: 'مشترك مع الفريق', hint: 'الفريق يرى ما وجدته' };
}

/** ما يمكن فعله الآن — سطر واحد بتسمية المشهد عند التمرير/التركيز. */
export const AFFORDANCE: Record<StatusTone, string> = {
  idle: 'افحص',
  private: 'افتح اكتشافك',
  teammate: 'اسأل زميلك',
  shared: 'تابع الفحص',
  processing: 'تابع الحالة',
  ready: 'اطّلع على النتيجة',
};

export const CATEGORY_LABEL: Record<string, string> = {
  object: 'أثر',
  device: 'جهاز',
  access: 'نظام دخول',
  archive: 'أرشيف',
  location: 'موقع',
};

export const WORKSTATION_TITLE: Record<Specialization, string> = {
  field: 'محطة ميدانية',
  digital: 'محطة رقمية',
  forensics: 'محطة الطب الشرعي',
  records: 'محطة السجلات والأرشيف',
};
