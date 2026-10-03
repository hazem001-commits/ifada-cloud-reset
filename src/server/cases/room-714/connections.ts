// ============================================================
// src/server/cases/room-714/connections.ts
// سيرفر فقط. قواعد روابط غرفة 714 المرشّحة — مرآة حرفية لمسودة
// sql/032_room714_connection_rules_DRAFT.sql (المراجعة 2، غير مطبّقة).
// status: 'draft' — لا تُطبَّق حتى يعتمدها Hazem.
// كل معنى أُعيد اشتقاقه جملةً جملة من نص العقدتين الحي فقط: لا حقيقة من
// دليل آخر أو محجوز (HOLD) أو نتيجة لاحقة أو الحل. كل قاعدة ضمن تخصص واحد.
// ============================================================
import type { ConnectionRuleSet, NodeRef } from '@/lib/connections/types';

const ev = (id: string): NodeRef => ({ kind: 'evidence', id });

export const ROOM_714_CONNECTIONS: ConnectionRuleSet = {
  caseId: 'room-714',
  status: 'draft',
  rules: [
    {
      // F-01 + F-02 — بلا هوية/جنس/آلية جرح (F-03 محجوز) وبلا "إصابة" (F-04 محجوز).
      id: 'R714_NO_VICTIM_BLOOD',
      requires: [ev('F-01'), ev('F-02')],
      meaning: 'لا أثر لدم رامي داخل الغرفة: بقعة الدم الوحيدة المسجّلة فيها ليست دمه.',
      effects: [],
    },
    {
      // R-04 + R-05 — الجهة المسجّلة كما هي، لا "يملكها رامي"؛ بلا شيء من R-09 (محجوز).
      id: 'R714_N17_PAYMENTS',
      requires: [ev('R-04'), ev('R-05')],
      meaning: 'تحويلات حساب س. منصور تذهب إلى N17، و70% من حصص N17 مسجّلة باسم R. AL-KHATIB HOLDINGS، وحصة أخرى غير مباشرة فيها مرتبطة بحسابات RAK TECH.',
      effects: [],
    },
    {
      // D-08 + D-05 — توقيت فقط: لا فاعل للنسخ، لا "نفس الفيديو"، لا المستلم، لا محتوى D-06.
      id: 'R714_COPY_AFTER_MESSAGE',
      requires: [ev('D-08'), ev('D-05')],
      meaning: 'بعد ثماني عشرة دقيقة من رسالة «الفيديو عندي»، نُسخ الملف NOV_17_RAW.mp4 من جهاز رامي إلى ذاكرة خارجية.',
      effects: [],
    },
  ],
  conditions: [],
};
