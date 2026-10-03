// ============================================================
// src/app/case/[code]/useSpecializationHolders.ts
// مين من الفريق فعلياً ماسك كل تخصص — من صلاحيات الوصول الفعلية
// (session_member_specializations)، مش من التخصص الأساسي بس.
// بجلسة 2–3 لاعبين لاعب واحد ممكن يمسك أكثر من تخصص.
//
// التوزيع نفسه بيصير بالسيرفر (assign_session_specializations) —
// هون بس منقرأ نتيجته. القراءة محمية بـ RLS (أعضاء نفس الجلسة فقط).
// ============================================================
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Specialization } from '@/types/database';

export type SpecializationHolders = Partial<Record<Specialization, string[]>>;

export function useSpecializationHolders(sessionId: string): SpecializationHolders | null {
  const [holders, setHolders] = useState<SpecializationHolders | null>(null);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      const { data, error } = await createClient()
        .from('session_member_specializations')
        .select('user_id,specialization')
        .eq('session_id', sessionId);
      if (disposed || error || !data) return;

      const next: SpecializationHolders = {};
      for (const row of data as { user_id: string; specialization: Specialization }[]) {
        (next[row.specialization] ??= []).push(row.user_id);
      }
      setHolders(next);
    })();

    return () => {
      disposed = true;
    };
  }, [sessionId]);

  return holders;
}
