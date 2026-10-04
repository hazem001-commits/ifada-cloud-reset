// ============================================================
// src/lib/realtime/objectSync.ts
// مزامنة عناصر التحقيق بين اللاعبين: REALTIME → إشارة فقط → جلب موثوق.
//
// لماذا لا يكفي postgres_changes وحده: Realtime يسلّم حدث صف فقط لمن
// تسمح له سياسة SELECT (022/026: is_shared أو discovered_by = أنا).
// اكتشاف زميل الخاص صف لا يراه اللاعب الآخر — عن قصد (لا تسريب) —
// فلا يصله أي حدث، ويبقى العنصر "لم يُفحص بعد" حتى تحديث يدوي.
//
// الحل بلا SQL: من نفّذ فعلاً على عنصر يبثّ إشارة فارغة على قناة الجلسة
// نفسها (`investigation:<session>`). الإشارة لا تحمل كوداً ولا حالة ولا
// عنواناً — فقط "تغيّر شيء". كل مستقبِل يعيد الجلب عبر
// investigation_object_index (SECURITY DEFINER + إسقاط الخصوصية بالسيرفر)،
// فيرى الحالة المصرّح بها فقط ("لدى زميل" بلا محتوى ولا أزرار).
//
// قاعدة: محتوى أي حدث (صف أو بث) لا يصبح حالة واجهة أبداً. يُقرأ منه
// session_id فقط لرفض حدث جلسة أخرى، ثم يُهمل.
// ============================================================

export const OBJECT_SIGNAL_EVENT = 'objects_changed';

/** نفس اسم القناة لكل لاعبي الجلسة — شرط لوصول البث بينهم. */
export const objectSyncTopic = (sessionId: string) => `investigation:${sessionId}`;

/** الحد الأدنى من RealtimeChannel الذي نحتاجه (قابل للاختبار بقناة مزيفة). */
export interface SignalChannel {
  on(type: 'postgres_changes' | 'broadcast', filter: Record<string, string>, callback: (payload: unknown) => void): SignalChannel;
}

export interface SendableChannel {
  send(message: { type: 'broadcast'; event: string; payload: Record<string, unknown> }): unknown;
}

/** session_id المعلن في حدث (صف جديد/قديم أو بث) — ولا شيء غيره. */
function declaredSession(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  for (const key of ['new', 'old', 'payload'] as const) {
    const part = p[key];
    if (part && typeof part === 'object') {
      const v = (part as Record<string, unknown>).session_id ?? (part as Record<string, unknown>).session;
      if (typeof v === 'string') return v;
    }
  }
  return null;
}

/**
 * يسجّل مستمعَي الإشارة على قناة الجلسة:
 *   postgres_changes على session_object_state (INSERT/UPDATE/DELETE، مفلتر بالجلسة) —
 *     يصل لصفوفي ولما هو مشترك؛
 *   broadcast objects_changed — يصل حين يتغيّر شيء خاص بزميل.
 * onSignal لا يستلم أي محتوى.
 */
export function configureObjectSync<C extends SignalChannel>(channel: C, sessionId: string, onSignal: () => void): C {
  const handle = (payload: unknown) => {
    const s = declaredSession(payload);
    if (s !== null && s !== sessionId) return; // جلسة أخرى: تجاهل
    onSignal();
  };
  channel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'session_object_state', filter: `session_id=eq.${sessionId}` }, handle)
    .on('broadcast', { event: OBJECT_SIGNAL_EVENT }, handle);
  return channel;
}

/** رسالة الإشارة: الجلسة فقط — لا عنصر، لا حالة، لا فاعل. */
export const objectSignalMessage = (sessionId: string) =>
  ({ type: 'broadcast', event: OBJECT_SIGNAL_EVENT, payload: { session: sessionId } }) as const;

/** إشارة لبقية الفريق بعد فعل ناجح مني (لا شيء إن لم تكن القناة جاهزة). */
export function signalObjectsChanged(channel: SendableChannel | null, sessionId: string): void {
  if (!channel) return;
  try {
    void Promise.resolve(channel.send(objectSignalMessage(sessionId))).catch(() => undefined);
  } catch {
    // إشارة فقط: فشلها لا يمسّ فعل اللاعب (والزميل يلحق عند أول إشارة/جلب تالٍ)
  }
}

/**
 * بوابة جلب: جلب واحد بالتوازي كحد أقصى؛ إشارات أثناءه تُدمج في جلب
 * واحد لاحق (لا عاصفة جلب، ولا نتيجة قديمة تكتب فوق أحدث). بلا مؤقتات.
 */
export function createRefetchGate(refetch: () => Promise<void>) {
  let running = false;
  let pending = false;
  let disposed = false;

  async function drain() {
    running = true;
    try {
      do {
        pending = false;
        try {
          await refetch();
        } catch {
          // الجلب التالي يصحّح؛ لا نكسر الحلقة
        }
      } while (pending && !disposed);
    } finally {
      running = false;
    }
  }

  return {
    trigger(): Promise<void> | void {
      if (disposed) return;
      if (running) {
        pending = true;
        return;
      }
      return drain();
    },
    dispose() {
      disposed = true;
      pending = false;
    },
  };
}
