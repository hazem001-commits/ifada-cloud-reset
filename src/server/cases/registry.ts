// ============================================================
// src/server/cases/registry.ts
// سيرفر فقط. caseId → الحقيقة المكتوبة التي يحتاجها المحرك بالسيرفر
// (مسارات وسائط، قنوات، قواعد روابط). قضية مجهولة → لا شيء.
// لا يُستورد من أي مكوّن عميل (tests/cases/boundaries.test.ts).
// ============================================================
import { own } from '@/cases/presentation';
import type { CaseServerModule } from './types';
import { ROOM_714_MEDIA } from './room-714/media';
import { ROOM_714_CONNECTIONS } from './room-714/connections';
import { SCENE_17_CHANNELS, SCENE_17_SHARED_EVIDENCE } from './scene-17/channels';
import { SCENE_17_CONNECTIONS } from './scene-17/connections';

const SERVER_CASES: Readonly<Record<string, CaseServerModule>> = {
  'room-714': {
    media: ROOM_714_MEDIA,
    // غرفة 714 توزّع أدلتها الخاصة بالتخصص (owner_spec).
    channels: null,
    sharedEvidence: [],
    // مرشّحة للاعتماد (sql/032 مسودة) — draft: لا تُطبَّق قبل موافقة Hazem.
    connectionRules: ROOM_714_CONNECTIONS,
  },
  'scene-17': {
    media: { scenes: {}, objectViews: {} },
    channels: SCENE_17_CHANNELS,
    sharedEvidence: SCENE_17_SHARED_EVIDENCE,
    connectionRules: SCENE_17_CONNECTIONS,
  },
};

export function getCaseServerModule(caseId: string | null | undefined): CaseServerModule | null {
  return own(SERVER_CASES, caseId) ?? null;
}

export function serverCaseIds(): string[] {
  return Object.keys(SERVER_CASES);
}

/**
 * أدلة يقرؤها هذا اللاعب وتحملها قناة خاصة (حسب التوزيع المكتوب للقضية):
 * مقروءة لي، تُساهَم بها في ربط مشترك، ولا تُثبَّت على اللوحة المشتركة
 * (035 يرفض تثبيتها دائماً). المدخل = صفوف evidence_index كاللاعب نفسه؛
 * المخرج جزء من أكواده المقروءة فقط — لا كود لا يقرؤه، فلا أثر لمسار زميل.
 * قضية بلا قنوات (غرفة 714) أو مجهولة → [] (لا تغيير). التثبيت يبقى قرار السيرفر.
 */
export function readablePrivateEvidence(
  caseId: string | null | undefined,
  rows: readonly { code: string; readable: boolean }[],
): string[] {
  const channels = getCaseServerModule(caseId)?.channels;
  if (!channels) return [];
  const laned = new Set(channels.flatMap((c) => c.evidence));
  return rows.filter((r) => r.readable && laned.has(r.code)).map((r) => r.code);
}
