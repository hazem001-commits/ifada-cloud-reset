// ============================================================
// src/app/case/[code]/useMySpecializations.ts
// تخصصاتي الفعلية بالجلسة — من my_specializations نفسها (نفس المصدر
// اللي تعتمد عليه كل فحوص الصلاحية بالسيرفر). بجلسة 2–3 لاعبين
// اللاعب ممكن يحمل أكثر من تخصص؛ التخصص الأساسي (اختيار اللوبي)
// يُعرض أولاً والباقي بعده. عرض فقط — لا يغيّر أي صلاحية.
// null = لسا ما وصلت القراءة (الواجهة تعرض الأساسي مؤقتاً).
// ============================================================
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Specialization } from '@/types/database';

export function useMySpecializations(sessionId: string, primary: Specialization): Specialization[] | null {
  const [specs, setSpecs] = useState<Specialization[] | null>(null);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const { data, error } = await createClient().rpc('my_specializations', { p_session: sessionId });
      if (disposed || error || !Array.isArray(data)) return;
      const list = data as Specialization[];
      setSpecs([...list.filter((s) => s === primary), ...list.filter((s) => s !== primary)]);
    })();
    return () => {
      disposed = true;
    };
  }, [sessionId, primary]);

  return specs;
}
