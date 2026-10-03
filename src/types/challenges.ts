// ============================================================
// src/types/challenges.ts
// تحديات التحقيق — أنواع الواجهة. مرآة لـ challenge_index /
// attempt_challenge (sql/024). المتصفح ما بيعرف الحل أبداً: بيوصله
// نص المهمة وإعدادات إدخال آمنة، وبعد كل محاولة رمز نتيجة فقط.
// ============================================================

import type { Specialization } from './database';

export type ChallengeLevel = 'micro' | 'investigation' | 'signature';

export type ChallengeOutcome =
  | 'complete'
  | 'insufficient'
  | 'no_match'
  | 'no_result'
  | 'too_broad'
  | 'needs_more'
  | 'throttled';

export interface ChallengeOption {
  id: string;
  label: string;
}

export interface ChallengeInputConfig {
  tool?: string;
  label?: string;
  placeholder?: string;
  options?: ChallengeOption[];
}

export interface InvestigationChallenge {
  code: string;
  object_code: string;
  level: ChallengeLevel;
  input_kind: string;
  spec: Specialization;
  prompt: string;
  input_config: ChallengeInputConfig;
  my_attempts: number;
  last_outcome: ChallengeOutcome | null;
}

/** ردود بلغة أداة التحقيق — لا "خطأ"، ولا تلميح للجواب. */
export const OUTCOME_TEXT: Record<ChallengeOutcome, string> = {
  complete: 'تم العثور على نتيجة.',
  insufficient: 'المدخل غير كافٍ لإجراء البحث.',
  no_match: 'لا يوجد تطابق.',
  no_result: 'لا توجد نتيجة مفيدة بهذا المدخل.',
  too_broad: 'البحث واسع جداً — ضيّق المدخل.',
  needs_more: 'هذه البيانات لا تكفي لإكمال التحليل. تحتاج معلومة إضافية.',
  throttled: 'النظام يعالج طلبات كثيرة. راجع ما عندك قبل البحث مرة ثانية.',
};

const KNOWN: ReadonlySet<string> = new Set(Object.keys(OUTCOME_TEXT));

export function asOutcome(value: unknown): ChallengeOutcome {
  return typeof value === 'string' && KNOWN.has(value) ? (value as ChallengeOutcome) : 'no_result';
}

/** نتيجة run_challenge (sql/025): رمز نتيجة + أكواد أدلة انفتحت فعلاً بهذه المحاولة. */
export interface ChallengeResult {
  outcome: ChallengeOutcome;
  evidence: string[];
}

export function parseChallengeResult(raw: unknown): ChallengeResult {
  if (typeof raw === 'string') return { outcome: asOutcome(raw), evidence: [] };
  if (!raw || typeof raw !== 'object') return { outcome: 'no_result', evidence: [] };
  const r = raw as Record<string, unknown>;
  const evidence = Array.isArray(r.evidence) ? r.evidence.filter((c): c is string => typeof c === 'string') : [];
  return { outcome: asOutcome(r.outcome), evidence };
}

const CHALLENGE_ERRORS: Record<string, string> = {
  NOT_A_MEMBER: 'إنت مش من فريق هذا التحقيق.',
  // السيرفر يرجّع رمز عام واحد لكل "غير متاح لك" — ما بيكشف السبب ولا وجود التحدي.
  CHALLENGE_NOT_FOUND: 'هذا الإجراء غير متاح لك حالياً.',
  INPUT_TOO_LARGE: 'المدخل طويل جداً.',
  // أعطال محتوى/تشغيل حقيقية — لا تُعرض كـ"لا نتيجة".
  CHALLENGE_CONTENT_ERROR: 'تعذّر إكمال البحث بسبب خلل في إعداد الأداة. أبلغ فريق التطوير.',
  CHALLENGE_INTERNAL_ERROR: 'تعذّر إكمال البحث بسبب خلل في النظام. جرّب مرة ثانية.',
};

export function translateChallengeError(message: string): string {
  for (const key of Object.keys(CHALLENGE_ERRORS)) {
    if (message.includes(key)) return CHALLENGE_ERRORS[key] as string;
  }
  return 'صار خطأ غير متوقع.';
}
