// ============================================================
// src/server/cases/scene-17/channels.ts
// سيرفر فقط. قنوات المعلومات الخاصة للمشهد 17 كما كتبها مستند القضية
// (04-Scene-17-Multiplayer-Distribution) — أسماء القنوات وأدلة كل قناة.
//
// الأكواد هنا أكواد مستند القضية (E01–E40)، لا صفوف evidence حية:
// القضية غير مزروعة، وربط كل كود بملف وسائط ينتظر الاعتماد
// (docs/cases/scene-17/ASSET_EVIDENCE_MANIFEST.md).
// القناة لا تمنح أي قدرة — التخصص العام يبقى هو القدرة.
// ============================================================
import type { AuthoredChannel } from '../types';

/** يراها كل اللاعبين. */
export const SCENE_17_SHARED_EVIDENCE = ['E01', 'E02', 'E04', 'E05'] as const;

export const SCENE_17_CHANNELS: readonly AuthoredChannel[] = [
  { id: 'A', title: 'النصوص والتعديلات', evidence: ['E06', 'E07', 'E15', 'E19', 'E40'] },
  { id: 'B', title: 'الصوت', evidence: ['E10', 'E17', 'E18', 'E30'] },
  { id: 'C', title: 'الإكسسوارات والسكين', evidence: ['E08', 'E09', 'E22', 'E24', 'E25', 'E26'] },
  { id: 'D', title: 'الحركة والكاميرات', evidence: ['E11', 'E23', 'E27', 'E28', 'E29'] },
  { id: 'E', title: 'الإفادات والمحادثات', evidence: ['E12', 'E20', 'E21'] },
  { id: 'F', title: 'الأنظمة الرقمية والهاتف', evidence: ['E13', 'E16', 'E31', 'E32', 'E33'] },
  { id: 'G', title: 'قضية ليلى القديمة', evidence: ['E14', 'E35', 'E36', 'E37', 'E39'] },
  { id: 'H', title: 'الطب والدافع', evidence: ['E03', 'E34', 'E38'] },
];

/**
 * أكواد الأدلة الخاصة التي تحملها مجموعة قنوات (قنوات لاعب واحد حسب
 * خطة العقد لعدد اللاعبين). قناة مجهولة لا تضيف شيئاً (مغلق عند الشك).
 */
export function evidenceForChannels(channelIds: readonly string[]): string[] {
  const set = new Set(channelIds);
  return SCENE_17_CHANNELS.filter((c) => set.has(c.id)).flatMap((c) => c.evidence);
}
