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
import type { Specialization } from '@/types/database';

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
  /**
   * افتتاحية القضية (RESET-2) — عرض فقط، لا حقيقة ولا صلاحية. كل ما هنا
   * إمّا نص مكتوب للقضية أصلاً، أو مرآة لما ألّفته قاعدة البيانات
   * (تحقّق اختبار التطابق مع sql/038). غيابه = لا افتتاحية خاصة.
   */
  opening?: OpeningPresentation;
}

/** إلى أين قد يقود خيط — اتجاه، لا هدف ولا جواب. */
export type LeadPointer =
  | { kind: 'object'; code: string; label: string }
  | { kind: 'tab'; tab: 'interrogation' | 'casefile'; label: string };

export interface OpeningPresentation {
  /** البلاغ الافتتاحي: مادة ابتدائية موجودة أصلاً (كودها) + نصوص الإطار. */
  briefing: {
    evidence: string;
    kicker: string;
    /** سطر الإطار العام — يعرفه كل لاعب (من عنوان القضية/البلاغ نفسه). */
    premise: string;
    enter: string;
  };
  /**
   * ما يستطيع تخصصٌ فعله بما يجده (قدرة/تحويل). الكل يلاحظ العالم نفسه:
   * التخصص لا يحدد ما تراه ولا كمية ما تصل إليه، بل ما تستطيع فعله به.
   */
  capabilities: Readonly<Partial<Record<Specialization, string>>>;
  /** عنصر → حالة → التخصص الذي يكمل منها (مرآة تفاعلات/أدوات القضية). */
  handoffs: Readonly<Record<string, Readonly<Record<string, Specialization>>>>;
  /** عنصر → حالة → المادة التي يُنتجها لملف القضية عند تلك الحالة. */
  produces: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** خيط → اتجاه محتمل. */
  leadPointers: Readonly<Record<string, LeadPointer>>;
  /** مادة → كيف دخلت التحقيق (سلسلة العهدة بملف القضية) — لما ينتجه العالم. */
  custody: Readonly<Record<string, string>>;
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
