// ============================================================
// src/cases/registry.ts
// سجل القضايا: caseId → عقد القضية + عرضها. مدخل واحد لكل قضية،
// بلا switch ضخم. قضية غير مسجّلة = غير قابلة للعب (مغلق عند الشك).
// آمن للمتصفح.
// ============================================================
import type { CaseContract, CaseId } from './contract';
import { EMPTY_PRESENTATION, own, type CasePresentation } from './presentation';
import { ROOM_714_CONTRACT } from './room-714/contract';
import { ROOM_714_PRESENTATION } from './room-714/presentation';
import { SCENE_17_CONTRACT } from './scene-17/contract';
import { SCENE_17_PRESENTATION } from './scene-17/presentation';

interface CaseModule {
  contract: CaseContract;
  presentation: CasePresentation;
}

const CASES: Readonly<Record<CaseId, CaseModule>> = {
  'room-714': { contract: ROOM_714_CONTRACT, presentation: ROOM_714_PRESENTATION },
  // المشهد 17: لا مشهد مصوّر ولا لقطات بعد — فقط ممرات لوحته الخاصة (لا نسخ لغرفة 714).
  'scene-17': { contract: SCENE_17_CONTRACT, presentation: SCENE_17_PRESENTATION },
};

export function registeredCaseIds(): CaseId[] {
  return Object.keys(CASES);
}

export function getCaseContract(caseId: string | null | undefined): CaseContract | null {
  return own(CASES, caseId)?.contract ?? null;
}

/** عرض القضية؛ قضية مجهولة أو بلا عرض → عرض فارغ آمن (لا بيانات قضية أخرى أبداً). */
export function getCasePresentation(caseId: string | null | undefined): CasePresentation {
  return own(CASES, caseId)?.presentation ?? EMPTY_PRESENTATION;
}

/**
 * وصول المطوّرين لقضايا قيد التطوير. يُحسب بالسيرفر فقط
 * (src/server/cases/devAccess.ts) ويُمرَّر هنا — هذا الملف لا يقرأ البيئة.
 */
export interface DevCaseAccess {
  all: boolean;
  cases: ReadonlySet<string>;
}

export const NO_DEV_ACCESS: DevCaseAccess = { all: false, cases: new Set() };

/**
 * هل يُسمح بفتح/إنشاء تحقيق لهذه القضية؟
 *   playable    → نعم.
 *   development → للمطوّرين فقط (وصول صريح).
 *   retired / غير مسجّلة → لا.
 */
export function isCaseOpenForPlay(caseId: string | null | undefined, dev: DevCaseAccess = NO_DEV_ACCESS): boolean {
  const contract = getCaseContract(caseId);
  if (!contract) return false;
  if (contract.status === 'playable') return true;
  if (contract.status === 'development') return dev.all || dev.cases.has(contract.id);
  return false;
}
