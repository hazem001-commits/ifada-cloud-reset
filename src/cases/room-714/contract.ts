// ============================================================
// src/cases/room-714/contract.ts
// عقد غرفة 714 — يصف ما هو مفعّل فعلاً اليوم، لا أكثر.
// ============================================================
import { NO_AI, type CaseContract } from '../contract';

export const ROOM_714_CONTRACT: CaseContract = {
  id: 'room-714',
  identity: {
    title: 'غرفة 714',
    signature: 'مكان مادي، حركة داخل الفندق، كاميرات، دخول، خطوط زمنية، إعادة بناء',
  },
  status: 'playable',
  // الأدلة الخاصة موزعة حسب التخصص (evidence.owner_spec).
  distribution: { kind: 'specialization' },
  // قاعدة المنتج الحالية: دليل مفتوح خارج تخصصك يظهر "محجوباً" بعنوانه.
  restrictedEvidence: 'title',
  systems: {
    objects: true,
    scene: true,
    evidence: true,
    evidenceMedia: true,
    challenges: true,
    interrogation: true,
    reconstruction: true,
    hearing: true,
    // أساس فقط (sql/027 غير مطبّق، ولا قواعد مكتوبة بعد).
    connections: false,
  },
  ai: {
    ...NO_AI,
    groundedSearch: true,
    intentRouter: true,
    boundedInterrogation: true,
  },
  // المحرك (sql/037) مطبّق. قواعد الافتتاحية في sql/038 (قيد المراجعة):
  // قبل تطبيقها يبقى المحرك خاملاً لهذه القضية والواجهة تعمل بدونه.
  runtime: { engine: true, pulse: true, gatedPlaces: true },
  // RESET-2: الأدلة تُكتشف بالعالم — لا قائمة "الأدلة القديمة" للشراء.
  worldDiscoveryOnly: true,
};
