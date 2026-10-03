// ============================================================
// src/server/cases/types.ts
// سيرفر فقط. شكل "الحقيقة المكتوبة" لكل قضية التي يحتاجها المحرك
// بالسيرفر: مسارات وسائط، توزيع القنوات، قواعد الروابط. لا شيء من
// هنا يُستورد في مكوّن عميل (tests/cases/boundaries.test.ts).
// ============================================================
import type { ConnectionRuleSet } from '@/lib/connections/types';

export interface CaseMedia {
  /** كود موقع → مسار صورة المشهد. */
  scenes: Readonly<Record<string, string>>;
  /** كود عنصر → مفتاح لقطة → مسار. */
  objectViews: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** قناة معلومات خاصة بأسمائها المكتوبة وأدلتها — حقيقة قضية، سيرفر فقط. */
export interface AuthoredChannel {
  id: string;
  /** الاسم المكتوب بمستند التوزيع. */
  title: string;
  /** أكواد الأدلة المقصودة بهذه القناة (أكواد مستند القضية — قبل البذر). */
  evidence: readonly string[];
}

export interface CaseServerModule {
  media: CaseMedia;
  /** null = القضية توزّع بالتخصص (لا قنوات). */
  channels: readonly AuthoredChannel[] | null;
  /** أكواد أدلة مشتركة يراها الجميع (بتوزيع القنوات). */
  sharedEvidence: readonly string[];
  connectionRules: ConnectionRuleSet;
}
