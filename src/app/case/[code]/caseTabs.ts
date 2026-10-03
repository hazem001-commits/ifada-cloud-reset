// ============================================================
// src/app/case/[code]/caseTabs.ts
// أي تبويب تفتحه القضية؟ من عقد القضية فقط (systems / ai) — المحرك لا
// يعرض نظاماً لم تُعدّه القضية (لا تجربة "كاملة" مزيّفة). غرفة 714 تفعّل
// كل شيء فلا يتغير عندها شيء؛ المشهد 17 (شريحة التطوير) يفتح ما جهز فقط.
// ============================================================
import type { CaseContract } from '@/cases/contract';
import type { CaseTab } from './CaseNav';

export function caseTabEnabled(tab: CaseTab, contract: CaseContract | null): boolean {
  if (!contract) return false;
  const { systems, ai } = contract;
  switch (tab) {
    case 'investigation':
      return systems.objects || systems.scene || ai.groundedSearch;
    case 'casefile':
    case 'board':
      return systems.evidence || systems.objects;
    case 'evidence':
      return systems.evidence;
    case 'interrogation':
      return systems.interrogation;
    case 'reconstruction':
      return systems.reconstruction;
    case 'hearing':
      return systems.hearing;
  }
}

/** موقع بلا مشهد ولا عناصر = صفحة بحث فقط؛ لا نسمّيها "المكان". */
export function investigationTabLabel(contract: CaseContract | null): string {
  return contract && (contract.systems.objects || contract.systems.scene) ? 'المكان' : 'اسأل التحقيق';
}

/** هل يُعرض المشهد/العناصر داخل تبويب التحقيق؟ (وإلا البحث وحده) */
export const showsScene = (contract: CaseContract | null) => !!contract && (contract.systems.objects || contract.systems.scene);
