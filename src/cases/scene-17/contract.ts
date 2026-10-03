// ============================================================
// src/cases/scene-17/contract.ts
// عقد المشهد 17 — قيد التطوير. جداول القضية الحية فارغة، فلا
// تحقيق عادي حتى يوجد حد أدنى قابل للعب.
//
// توزيع المعلومات: ثماني قنوات خاصة A–H تُدمج حسب عدد اللاعبين
// (04-Scene-17-Multiplayer-Distribution). القناة ليست تخصصاً:
// التخصص العام يبقى هو القدرة. هنا المعرّفات وخطة الإسناد فقط —
// أسماء القنوات المكتوبة وأي دليل ينتمي لأي قناة بالسيرفر وحده
// (src/server/cases/scene-17/channels.ts).
// ============================================================
import { NO_AI, NO_RUNTIME, NO_SYSTEMS, type CaseContract } from '../contract';

const CHANNEL_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export const SCENE_17_CONTRACT: CaseContract = {
  id: 'scene-17',
  identity: {
    title: 'المشهد 17',
    signature: 'ما كُتب ↔ ما طُلب ↔ ما حدث فعلاً',
  },
  status: 'development',
  distribution: {
    kind: 'channels',
    channels: CHANNEL_IDS.map((id) => ({ id, label: `القناة ${id}` })),
    plan: {
      2: [['A', 'C', 'E', 'H'], ['B', 'D', 'F', 'G']],
      3: [['A', 'F', 'H'], ['B', 'E', 'G'], ['C', 'D']],
      4: [['A', 'F'], ['B', 'G'], ['C', 'H'], ['D', 'E']],
      5: [['A', 'F'], ['B', 'G'], ['C'], ['D'], ['E', 'H']],
      6: [['A'], ['C'], ['D'], ['F'], ['B', 'E'], ['G', 'H']],
      7: [['A'], ['B'], ['C'], ['D'], ['F'], ['E', 'H'], ['G']],
      8: CHANNEL_IDS.map((id) => [id]),
    },
  },
  // أدلة القناة الخاصة لا تظهر لغير حامليها ولو بعنوانها حتى تُشارَك.
  restrictedEvidence: 'hidden',
  // شريحة التطوير (sql/036، قيد المراجعة): أدلة + لوحة + روابط + بحث +
  // اختبار فرضية فقط. لا مشهد ولا عناصر ولا تحديات ولا استجواب ولا إعادة
  // بناء ولا جلسة استماع — محتواها غير جاهز، فلا تُعرض أصلاً (caseTabs.ts).
  // الحالة تبقى 'development': لا يُفتح إلا تحت next dev / IFADA_DEV_CASES.
  systems: { ...NO_SYSTEMS, evidence: true, evidenceMedia: true, connections: true },
  ai: { ...NO_AI, groundedSearch: true, hypothesisStressTest: true },
  // لا محرك للمشهد 17 بعد: لا محتوى runtime ولا تغيير على قنواته.
  runtime: NO_RUNTIME,
};
