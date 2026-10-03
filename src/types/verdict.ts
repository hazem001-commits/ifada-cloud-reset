// ============================================================
// src/types/verdict.ts
// ============================================================

export interface VerdictOption {
  id: string;
  label: string;
}

export interface VerdictQuestion {
  code: string;
  prompt: string;
  options: VerdictOption[];
}

export type Tier = 'proven' | 'true_but_unproven' | 'wrong';
export type OverallTier = 'proven' | 'true_but_unproven' | 'wrong_reconstruction';

export interface QuestionResult {
  question_code: string;
  chosen: string;
  correct: boolean;
  tier: Tier;
}

export interface VerdictResult {
  overall: OverallTier;
  results: QuestionResult[];
}

export interface NarrativeBeat {
  sort_order: number;
  time_label: string | null;
  body: string;
}

export const TIER_LABEL: Record<Tier, string> = {
  proven: 'مُثبَتة بالكامل',
  true_but_unproven: 'صحيحة، بس غير مُثبَتة',
  wrong: 'غير صحيحة',
};

export const OVERALL_LABEL: Record<OverallTier, { title: string; note: string }> = {
  proven: {
    title: 'القضية مُثبَتة',
    note: 'وصل الفريق للحقيقة، ووثّقها بالأدلة الكافية. القضية تُغلق بثقة كاملة.',
  },
  true_but_unproven: {
    title: 'حقيقية، لكن غير مُثبَتة',
    note: 'الفريق عرف الحقيقة فعلاً — بس بعض القطع بقيت بلا إثبات كافٍ. بمحكمة حقيقية، هذا يعني القضية ممكن تنهار.',
  },
  wrong_reconstruction: {
    title: 'إعادة بناء غير صحيحة',
    note: 'نظرية الفريق ما كانت متطابقة مع ما حصل فعلياً. جرّبوا تشوفوا وين انحرفت.',
  },
};
