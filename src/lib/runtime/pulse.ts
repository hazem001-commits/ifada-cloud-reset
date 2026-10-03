// ============================================================
// src/lib/runtime/pulse.ts
// Investigation Pulse — "زميلك اكتشف شيئاً" بدون "ماذا".
//
// المصدر الوحيد: session_pulses (أعمدة آمنة فقط) عبر runtime_state.
// هنا تنقية مغلقة عند الشك: قائمة سماح بالحقول (id، actor، category،
// at) وفئة من التصنيف الثابت فقط. أي حقل آخر يُسقط، أي فئة مجهولة =
// النبضة كلها تُسقط. النص المعروض ثابت بالكود — لا كود، لا عنوان، لا
// مكان، لا وقت قضية، لا قناة، لا تخصص، لا عدد.
//
// النبضات إشارات اجتماعية فقط: لا تدخل AuthorizedKnowledge ولا
// TeamKnowledge ولا البحث ولا الروابط ولا الكيانات ولا الذكاء الاصطناعي.
// ============================================================
import { isPulseCategory, type Pulse, type PulseCategory } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** الحقول الوحيدة المسموح أن تصل من السيرفر. */
export const PULSE_FIELDS = ['id', 'actor', 'category', 'at'] as const;

export function sanitizePulse(raw: unknown): Pulse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !UUID_RE.test(r.id)) return null;
  if (!isPulseCategory(r.category)) return null;
  if (typeof r.at !== 'string' || Number.isNaN(Date.parse(r.at))) return null;
  let actorId: string | null = null;
  if (r.actor !== null && r.actor !== undefined) {
    if (typeof r.actor !== 'string' || !UUID_RE.test(r.actor)) return null;
    actorId = r.actor;
  }
  return { id: r.id, actorId, category: r.category, at: r.at };
}

export function sanitizePulses(raw: unknown, limit = 50): Pulse[] {
  if (!Array.isArray(raw)) return [];
  const out: Pulse[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const p = sanitizePulse(item);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** تسميات عامة بصوت دفتر المحقق — لا تحمل أي تفصيل. */
export const PULSE_CATEGORY_LABEL: Readonly<Record<PulseCategory, string>> = {
  PERSON: 'شخص',
  PLACE: 'مكان',
  TIME: 'توقيت',
  DEVICE: 'جهاز',
  MOVEMENT: 'حركة',
  PHYSICAL_TRACE: 'أثر مادي',
  RECORD: 'سجل',
  CONTRADICTION: 'تناقض',
  NEW_ACTION: 'إجراء جديد',
};

/**
 * سطر النبضة للعرض. الاسم من قائمة أعضاء الجلسة الظاهرة أصلاً للاعب؛
 * فاعل غير معروف = "زميل"؛ null = نتيجة وصلت (النظام).
 */
export function pulseLine(p: Pulse, names: ReadonlyMap<string, string>, myId: string | null): string {
  const what = PULSE_CATEGORY_LABEL[p.category];
  if (p.actorId === null) return `وصلت نتيجة جديدة — ${what}`;
  if (myId && p.actorId === myId) return `ملاحظة خاصة جديدة لديك — ${what}`;
  const who = names.get(p.actorId) ?? 'أحد أعضاء الفريق';
  return `${who}: ملاحظة خاصة جديدة — ${what}`;
}
