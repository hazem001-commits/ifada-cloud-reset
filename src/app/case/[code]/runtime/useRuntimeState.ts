// ============================================================
// src/app/case/[code]/runtime/useRuntimeState.ts
// حالة Investigation Runtime للاعب (sql/037): runtime_settle ثم
// runtime_state — بعميل اللاعب نفسه (RPCs تفحص العضوية وتُسقط ما ليس له).
// Realtime على جداول الإشارة فقط → إعادة جلب (لا محتوى من الحدث).
//
// قبل تطبيق 037: installed = false ولا اشتراك ولا خطأ — كل شيء يبقى
// على سلوكه الحالي.
// ============================================================
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { subscribeAuthenticated } from '@/lib/supabase/realtime';
import { isRuntimeNotInstalled, parseRuntimeState } from '@/lib/runtime/projection';
import type { RuntimeReadModel } from '@/lib/runtime/types';
import { RUNTIME_RPC, RUNTIME_SIGNAL_TABLES } from '@/types/runtime';

export interface RuntimeView {
  /** null = لم نعرف بعد؛ false = 037 غير مطبّق. */
  installed: boolean | null;
  model: RuntimeReadModel | null;
  error: string | null;
  reload: () => Promise<void>;
  shareLead: (lead: string) => Promise<boolean>;
}

export function useRuntimeState(sessionId: string, enabled: boolean): RuntimeView {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [model, setModel] = useState<RuntimeReadModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  // آخر طلب فقط يكتب الحالة: رد قديم وصل متأخراً لا يطغى على أحدث.
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    const supabase = createClient();
    const settled = await supabase.rpc(RUNTIME_RPC.settle, { p_session: sessionId });
    if (mine !== seq.current) return;
    if (isRuntimeNotInstalled(settled.error)) {
      setInstalled(false);
      setModel(null);
      return;
    }
    const { data, error: readError } = await supabase.rpc(RUNTIME_RPC.state, { p_session: sessionId });
    if (mine !== seq.current) return;
    if (readError) {
      if (isRuntimeNotInstalled(readError)) {
        setInstalled(false);
        setModel(null);
      } else {
        setError('RUNTIME_READ_FAILED');
      }
      return;
    }
    setInstalled(true);
    setError(settled.error ? 'RUNTIME_SETTLE_FAILED' : null);
    setModel(parseRuntimeState(data));
  }, [sessionId]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    void (async () => {
      if (!disposed) await reload();
    })();
    return () => {
      disposed = true;
    };
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled || installed !== true) return;
    return subscribeAuthenticated(
      createClient(),
      `runtime:${sessionId}`,
      (channel) => {
        for (const table of RUNTIME_SIGNAL_TABLES) {
          channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `session_id=eq.${sessionId}` }, () => void reload());
        }
        return channel;
      },
      () => void reload(),
    );
  }, [enabled, installed, sessionId, reload]);

  const shareLead = useCallback(
    async (lead: string) => {
      const { error: shareError } = await createClient().rpc(RUNTIME_RPC.shareLead, { p_session: sessionId, p_lead: lead });
      await reload();
      return !shareError;
    },
    [sessionId, reload],
  );

  return { installed, model, error, reload, shareLead };
}
