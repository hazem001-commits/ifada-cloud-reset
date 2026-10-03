// ============================================================
// src/lib/supabase/realtime.ts
// اشتراك Realtime مصادَق عليه كلاعب مسجّل.
//
// المشكلة اللي بيحلها: قنوات كانت تشترك فوراً عند تركيب المكوّن، قبل
// ما عميل Supabase يحمّل الجلسة من الكوكيز — فالـ join بيطلع بدون توكن
// المستخدم (anon). الاشتراك بينقبل، بس RLS (is_session_member) بيحجب كل
// الأحداث بصمت، ومفيش توكن بينبعت للقناة لاحقاً.
//
// الترتيب هون: تحميل الجلسة → تسليم التوكن لـ Realtime → الاشتراك.
// الأحداث = إشارة؛ بعد كل اشتراك ناجح (أول مرة أو بعد إعادة اتصال)
// بنستدعي onSubscribed لجلب الحالة الموثوقة من السيرفر.
// ============================================================
'use client';

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export function subscribeAuthenticated(
  supabase: SupabaseClient,
  name: string,
  configure: (channel: RealtimeChannel) => RealtimeChannel,
  onSubscribed?: () => void,
): () => void {
  let channel: RealtimeChannel | null = null;
  let disposed = false;

  void (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (disposed) return;
    if (session) await supabase.realtime.setAuth(session.access_token);
    if (disposed) return;

    channel = configure(supabase.channel(name)).subscribe((status) => {
      if (status === 'SUBSCRIBED' && !disposed) onSubscribed?.();
    });
  })();

  return () => {
    disposed = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
