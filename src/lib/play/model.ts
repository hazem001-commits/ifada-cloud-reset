// ============================================================
// src/lib/play/model.ts
// نموذج تجربة اللعب الجماعية (RESET-2) — دوال نقية، بلا React ولا شبكة.
// كل مدخل هنا رجع أصلاً من قراءة مصرّح بها (runtime_state المنقّى،
// أعضاء الجلسة، التخصصات الفعلية، investigation_object_index). لا شيء
// هنا يستنتج محتوى لم يصل للاعب، ولا يقرأ حمولة realtime.
//
//   presence — من في الفريق، بماذا يقدر، وما آخر "نبضة" منه (فئة فقط)
//   handoff  — من في الفريق يكمل هذا الاكتشاف (قدرة، من خريطة العرض)
//   threads  — الخيوط: أسئلة مفتوحة ← متابَعة ← مغلقة (لا قائمة مهام)
// ============================================================
import type { LobbyMember, Specialization } from '@/types/database';
import type { Lead, Pulse, PulseCategory } from '@/lib/runtime/types';
import type { OpeningPresentation } from '@/cases/presentation';

export const SPEC_ORDER: readonly Specialization[] = ['field', 'digital', 'forensics', 'records'];

/** نبضة "حيّة" على بطاقة الزميل لهذه المدة، ثم تهدأ إلى السجل. */
export const PULSE_FRESH_MS = 3 * 60_000;

export type SpecHolders = Partial<Record<Specialization, readonly string[]>>;

export interface PresenceMember {
  userId: string;
  name: string;
  isMe: boolean;
  specs: Specialization[];
  /** آخر نبضة حديثة منه (فئة + وقت فقط) — null = هادئ. */
  live: { id: string; category: PulseCategory; at: string } | null;
}

/** تخصصات عضو من التوزيع الفعلي (لا الأساسي وحده)، بترتيب ثابت. */
export function specsOf(userId: string, holders: SpecHolders | null, fallback: Specialization): Specialization[] {
  if (!holders) return [fallback];
  const mine = SPEC_ORDER.filter((s) => holders[s]?.includes(userId));
  return mine.length > 0 ? mine : [fallback];
}

export function presence(
  members: readonly LobbyMember[],
  holders: SpecHolders | null,
  pulses: readonly Pulse[],
  myId: string | null,
  now: number,
): PresenceMember[] {
  const out = members.map((m): PresenceMember => {
    // نبضتي أنا لا تُعرض كحدث على بطاقتي (أعرف ما وجدته) — للزملاء فقط.
    const latest = pulses
      .filter((p) => m.userId !== myId && p.actorId === m.userId && now - Date.parse(p.at) < PULSE_FRESH_MS)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    return {
      userId: m.userId,
      name: m.displayName || 'محقق',
      isMe: m.userId === myId,
      specs: specsOf(m.userId, holders, m.specialization),
      live: latest ? { id: latest.id, category: latest.category, at: latest.at } : null,
    };
  });
  // أنا أولاً، ثم الزملاء بترتيب ثابت (لا قفز بالترتيب مع كل نبضة).
  return [...out.filter((p) => p.isMe), ...out.filter((p) => !p.isMe)];
}

/** نتائج وصلت للفريق بلا فاعل (معالجة اكتملت) — حديثة فقط. */
export const freshSystemPulses = (pulses: readonly Pulse[], now: number) =>
  pulses.filter((p) => p.actorId === null && now - Date.parse(p.at) < PULSE_FRESH_MS);

/** "منذ لحظات / منذ ٣ د" — وقت حقيقي منقضٍ، لا وقت القضية. */
export function sinceLabel(at: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  if (s < 45) return 'الآن';
  const m = Math.round(s / 60);
  if (m < 60) return `قبل ${m.toLocaleString('ar')} د`;
  return `قبل ${Math.round(m / 60).toLocaleString('ar')} س`;
}

/** نبضات جديدة منذ آخر عرض (لاكتشاف لحظة الوصول، بالمعرّف لا بالمحتوى). */
export function newPulseIds(previous: ReadonlySet<string>, pulses: readonly Pulse[]): string[] {
  return pulses.filter((p) => !previous.has(p.id)).map((p) => p.id);
}

// ------------------------------------------------------------
// handoff: من يكمل هذا الاكتشاف؟
// ------------------------------------------------------------
export interface Handoff {
  spec: Specialization;
  /** أنا أملك هذه القدرة: لا تسليم، الأداة عندي. */
  mine: boolean;
  /** زملاء يملكونها (أسماء فقط). فارغ = لا أحد بالفريق (حالة نادرة). */
  teammates: { userId: string; name: string }[];
}

export function handoffFor(
  opening: OpeningPresentation | undefined,
  objectCode: string,
  state: string,
  mySpecs: readonly Specialization[],
  holders: SpecHolders | null,
  members: readonly LobbyMember[],
  myId: string | null,
): Handoff | null {
  const spec = opening?.handoffs[objectCode]?.[state];
  if (!spec) return null;
  const ids = holders?.[spec] ?? members.filter((m) => m.specialization === spec).map((m) => m.userId);
  return {
    spec,
    mine: mySpecs.includes(spec),
    teammates: members.filter((m) => m.userId !== myId && ids.includes(m.userId)).map((m) => ({ userId: m.userId, name: m.displayName || 'زميل' })),
  };
}

/** المادة التي ينتجها هذا العنصر في حالته الحالية (عرض فقط). */
export const producedBy = (opening: OpeningPresentation | undefined, objectCode: string, state: string): string | null =>
  opening?.produces[objectCode]?.[state] ?? null;

// ------------------------------------------------------------
// threads: الخيوط
// ------------------------------------------------------------
export interface ThreadGroups {
  /** أسئلة مفتوحة الآن — الخاص بي أولاً (لأني وحدي أعرفه). */
  live: Lead[];
  /** أُغلقت: صار لها جواب في يد الفريق — أثر، لا إنجاز. */
  settled: Lead[];
}

export function threadGroups(leads: readonly Lead[]): ThreadGroups {
  const time = (l: Lead) => (l.openedAt ? Date.parse(l.openedAt) : 0);
  const live = leads
    .filter((l) => l.status !== 'closed')
    .sort((a, b) => (a.shared === b.shared ? time(b) - time(a) : a.shared ? 1 : -1));
  return { live, settled: leads.filter((l) => l.status === 'closed') };
}

/** خيوط لم أرها بعد (بالكود) — لحظة "وصل خيط جديد". */
export const unseenLeads = (seen: ReadonlySet<string>, leads: readonly Lead[]) =>
  leads.filter((l) => l.status !== 'closed' && !seen.has(`${l.code}:${l.shared ? 's' : 'p'}`)).map((l) => `${l.code}:${l.shared ? 's' : 'p'}`);
