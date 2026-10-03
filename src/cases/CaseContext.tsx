// ============================================================
// src/cases/CaseContext.tsx
// سياق القضية بالواجهة: كل مكوّن تحقيق يقرأ عرض قضيته الحالية من
// هنا (caseId → عرض)، لا من خرائط عامة مفاتيحها أكواد عناصر فقط.
// ============================================================
'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { EMPTY_PRESENTATION, type CasePresentation } from './presentation';
import { getCasePresentation } from './registry';

interface CaseContextValue {
  caseId: string | null;
  presentation: CasePresentation;
}

const CaseContext = createContext<CaseContextValue>({ caseId: null, presentation: EMPTY_PRESENTATION });

export function CaseProvider({ caseId, children }: { caseId: string; children: ReactNode }) {
  const value = useMemo(() => ({ caseId, presentation: getCasePresentation(caseId) }), [caseId]);
  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}

/** معرّف القضية الحالية (null خارج أي مزوّد). */
export function useCaseId(): string | null {
  return useContext(CaseContext).caseId;
}

/** عرض القضية الحالية. خارج أي مزوّد: عرض فارغ (لا بيانات أي قضية). */
export function useCasePresentation(): CasePresentation {
  return useContext(CaseContext).presentation;
}
