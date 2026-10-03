// ============================================================
// src/cases/scene-17/presentation.ts
// عرض المشهد 17 — توقيعه الخاص: ما كُتب ↔ ما طُلب ↔ ما حدث فعلاً.
// لا مشهد مصوّر ولا لقطات (لم تُعتمد أصول بعد). فقط ممرات لوحة التحقيق:
// أشرطة مكانية يرتّب فيها الفريق النص ↔ التعليمات ↔ الواقع، ويختبر
// التناقضات بينها عبر محرك الروابط نفسه. ليست قنوات A–H ولا تخصصات.
// ============================================================
import type { CasePresentation } from '../presentation';

export const SCENE_17_PRESENTATION: CasePresentation = {
  scenes: {},
  objectViews: {},
  objectProfiles: {},
  boardLanes: [
    { id: 'written', label: 'ما كُتب' },
    { id: 'instructed', label: 'ما طُلب' },
    { id: 'happened', label: 'ما حدث فعلاً' },
  ],
};
