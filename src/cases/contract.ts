// ============================================================
// src/cases/contract.ts
// عقد القضية (Case Contract) — ما يحتاجه المحرك المشترك ليعرف
// "ماذا تدعم هذه القضية وكيف". إعداد محرّك عام فقط: لا حقيقة
// مخفية، لا حل، لا أكواد أدلة بعينها. هذا الملف والملفات تحت
// src/cases/ آمنة للمتصفح.
//
// الحقيقة المكتوبة للقضية (خرائط قنوات الأدلة، قواعد الروابط،
// مسارات Storage) تعيش تحت src/server/cases/ فقط، ولا يستوردها
// أي مكوّن عميل (اختبار حدود يمنع ذلك).
// ============================================================
import type { RestrictedEvidencePolicy } from '@/lib/evidenceVisibility';

/** معرّف القضية الرسمي = cases.id بقاعدة البيانات. */
export type CaseId = string;

/**
 * حالة اللعب:
 *   playable    — متاحة للاعبين العاديين.
 *   development — قيد البناء: لا تحقيق عادي، الوصول للمطوّرين فقط.
 *   retired     — لا جلسات جديدة.
 */
export type CaseStatus = 'playable' | 'development' | 'retired';

/** قناة معلومات خاصة (مسار توزيع غير متماثل) — ليست تخصصاً. */
export interface CaseChannel {
  id: string;
  label: string;
}

/**
 * نموذج توزيع المعلومات الخاصة بين اللاعبين.
 *
 * التخصص (field/digital/forensics/records) عام لكل القضايا ويتحكم
 * بالقدرة (من يقدر يفحص/يحلل/يستعلم). توزيع المعلومات شيء آخر:
 *   specialization — القضية توزّع أدلتها الخاصة حسب التخصص نفسه
 *                    (غرفة 714: owner_spec).
 *   channels       — القضية تملك قنوات معلومات خاصة بها، تُسند
 *                    للاعبين حسب عددهم (المشهد 17: A–H). اللاعب يحمل
 *                    تخصصاً عاماً + قناة أو أكثر. القناة لا تمنح أي
 *                    قدرة ولا تغيّر تفويض التخصص.
 */
export type DistributionModel =
  | { kind: 'specialization' }
  | {
      kind: 'channels';
      channels: readonly CaseChannel[];
      /** عدد اللاعبين → لكل لاعب (بالترتيب) قائمة قنواته. مكتوب بالقضية. */
      plan: Readonly<Record<number, readonly (readonly string[])[]>>;
    };

/** الأنظمة التحقيقية المفعّلة لهذه القضية (المحرك يعرض/يخفي حسبها). */
export interface CaseSystems {
  /** عناصر تحقيق تفاعلية (investigation_objects). */
  objects: boolean;
  /** مشهد مصوّر قابل للمعاينة. */
  scene: boolean;
  evidence: boolean;
  evidenceMedia: boolean;
  challenges: boolean;
  interrogation: boolean;
  reconstruction: boolean;
  hearing: boolean;
  /** روابط يتحقق منها السيرفر ضد حقيقة القضية المكتوبة. */
  connections: boolean;
}

/** قدرات الذكاء الاصطناعي — كلها واجهات فوق حقيقة مكتوبة، لا مصدر حقيقة. */
export interface CaseAiCapabilities {
  groundedSearch: boolean;
  intentRouter: boolean;
  progressivePersons: boolean;
  unknownEntityLinking: boolean;
  hypothesisStressTest: boolean;
  boundedInterrogation: boolean;
  confrontation: boolean;
  reconstructionAssist: boolean;
  hearingChallenger: boolean;
}

export interface CaseContract {
  id: CaseId;
  identity: {
    title: string;
    /** الهوية الخاصة بالقضية (ليست نصاً للاعب بالضرورة). */
    signature: string;
  };
  status: CaseStatus;
  distribution: DistributionModel;
  /**
   * الدليل المفتوح الذي لا يملك اللاعب قراءته:
   *   title  — يظهر بعنوانه لكل الأعضاء (قاعدة منتج: "محجوب"، صاحب التخصص يقرأه).
   *   hidden — لا يظهر إطلاقاً (مثل قنوات المعلومات الخاصة) حتى يُشارَك.
   * تستخدمه نفس القاعدة بالبحث وبعقد الذكاء الاصطناعي (src/lib/evidenceVisibility.ts).
   */
  restrictedEvidence: RestrictedEvidencePolicy;
  systems: CaseSystems;
  ai: CaseAiCapabilities;
}

export const NO_SYSTEMS: CaseSystems = {
  objects: false,
  scene: false,
  evidence: false,
  evidenceMedia: false,
  challenges: false,
  interrogation: false,
  reconstruction: false,
  hearing: false,
  connections: false,
};

export const NO_AI: CaseAiCapabilities = {
  groundedSearch: false,
  intentRouter: false,
  progressivePersons: false,
  unknownEntityLinking: false,
  hypothesisStressTest: false,
  boundedInterrogation: false,
  confrontation: false,
  reconstructionAssist: false,
  hearingChallenger: false,
};

/**
 * خطة القنوات لعدد لاعبين معيّن — مع فحص سلامة: كل قناة تُسند مرة
 * واحدة بالضبط ولا قناة مجهولة. خطة ناقصة/فاسدة = null (مغلق عند الشك).
 */
export function channelPlanFor(model: DistributionModel, players: number): readonly (readonly string[])[] | null {
  if (model.kind !== 'channels') return null;
  const plan = model.plan[players];
  if (!plan || plan.length !== players) return null;
  const all = model.channels.map((c) => c.id);
  const assigned = plan.flat();
  if (assigned.length !== all.length) return null;
  if (new Set(assigned).size !== assigned.length) return null;
  if (!assigned.every((c) => all.includes(c))) return null;
  return plan;
}
