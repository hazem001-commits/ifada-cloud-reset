// ============================================================
// src/server/cases/scene-17/connections.ts
// سيرفر فقط. قواعد الروابط المكتوبة للمشهد 17 — منقولة حرفياً من
// 03-Scene-17-Evidence-Map، فقط حيث حدد المستند العقد صراحةً:
//   • E15 "مشتق من E06 + E07".
//   • شرط الفصل الثالث: ربطان صحيحان —
//       E17 + E18 + E28  (صوت كمال عمل وهو خارج غرفة الإخراج)
//       E22 + E25 + E26  (السكين جاءت من الأرشيف عبر مفتاح كمال)
//
// غير مكتوب هنا عمداً (ينتظر تأليفاً صريحاً، لا استنتاجاً):
//   • شرط الفصل الثاني ("3 من 4 تناقضات"): المستند يسمّي التناقضات
//     لكنه لا يحدد عقد كل واحد منها (ما عدا صفحتي المشهد).
//
// status: 'draft' — لا تُطبَّق حتى تُعتمد خريطة الأكواد ↔ الملفات
// وتُزرع القضية. المدقق يرد "غير مثبت" على أي مسودة.
// ============================================================
import type { ConnectionRuleSet, NodeRef } from '@/lib/connections/types';

const ev = (id: string): NodeRef => ({ kind: 'evidence', id });

export const SCENE_17_CONNECTIONS: ConnectionRuleSet = {
  caseId: 'scene-17',
  status: 'draft',
  rules: [
    {
      id: 'S17_SCRIPT_PAGES',
      requires: [ev('E06'), ev('E07')],
      relation: 'contradicts',
      meaning: 'صفحتا المشهد مختلفتان.',
      effects: [
        { kind: 'mark_contradiction', id: 'S17_PAGES_DIFFER' },
        { kind: 'unlock_evidence', evidence: 'E15' },
      ],
    },
    {
      id: 'S17_RECORDED_VOICE',
      requires: [ev('E17'), ev('E18'), ev('E28')],
      meaning: 'صوت كمال عمل وهو خارج غرفة الإخراج.',
      effects: [],
    },
    {
      id: 'S17_KNIFE_FROM_ARCHIVE',
      requires: [ev('E22'), ev('E25'), ev('E26')],
      meaning: 'السكين جاءت من الأرشيف عبر مفتاح كمال.',
      effects: [],
    },
  ],
  conditions: [
    {
      id: 'S17_CHAPTER_3',
      all: ['S17_RECORDED_VOICE', 'S17_KNIFE_FROM_ARCHIVE'],
      effects: [{ kind: 'unlock_chapter', chapter: '3' }],
    },
  ],
};
