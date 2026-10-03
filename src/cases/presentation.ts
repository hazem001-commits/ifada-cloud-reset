// ============================================================
// src/cases/presentation.ts
// شكل "عرض القضية" الذي تستهلكه واجهة التحقيق المشتركة: مشاهد،
// لقطات عناصر، هوية مدخلات ملف القضية. كل خريطة هنا مفاتيحها أكواد
// ضمن قضية واحدة فقط — قضيتان تستطيعان استخدام نفس كود العنصر أو
// الموقع دون أي تداخل، لأن الوصول دائماً: caseId → عرض القضية → الكود.
// آمن للمتصفح (لا مسارات Storage ولا حقيقة مخفية).
// ============================================================
import type { ArtifactIdentity } from '@/app/case/[code]/casefile/caseFileModel';
import type { SceneDefinition } from '@/app/case/[code]/investigation/scene/sceneGeometry';

export interface ObjectView {
  key: string;
  label: string;
}

export interface ObjectProfile {
  identity: ArtifactIdentity;
  provenance: string;
}

export interface CasePresentation {
  /** كود الموقع → مشهد مصوّر. */
  scenes: Readonly<Record<string, SceneDefinition>>;
  /** كود العنصر → لقطات قريبة (مفاتيح + تسميات). */
  objectViews: Readonly<Record<string, readonly ObjectView[]>>;
  /** كود العنصر → حالة → هوية/مصدر بملف القضية. */
  objectProfiles: Readonly<Record<string, Readonly<Record<string, ObjectProfile>>>>;
  /**
   * ممرات تفكير خاصة بالقضية على لوحة التحقيق (أشرطة مكانية، لا فئات
   * مخزّنة). فارغة = لوحة حرة. ليست قنوات معلومات ولا تخصصات.
   */
  boardLanes: readonly { id: string; label: string }[];
}

/** قضية بلا عرض خاص: كل موقع على سطح محايد، لا لقطات، هوية افتراضية. */
export const EMPTY_PRESENTATION: CasePresentation = Object.freeze({
  scenes: Object.freeze({}),
  objectViews: Object.freeze({}),
  objectProfiles: Object.freeze({}),
  boardLanes: Object.freeze([]),
});

/** بحث آمن من التداخل: لا وراثة من prototype ولا مفاتيح مثل "constructor". */
export function own<T>(map: Readonly<Record<string, T>>, key: string | null | undefined): T | undefined {
  if (!key || !Object.prototype.hasOwnProperty.call(map, key)) return undefined;
  return map[key];
}
