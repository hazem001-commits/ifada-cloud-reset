// ============================================================
// src/app/case/[code]/play/PlayContext.tsx
// سياق اللعب الجماعي (RESET-2): الفريق (أعضاء + توزيع التخصصات الفعلي)
// + حالة المحرك (runtime_state المنقّاة) — مصدر واحد للمشهد والحضور
// والخيوط، بلا اشتراكات مكررة.
//
// nudge(): تسوية + إعادة قراءة مدموجة (بوابة: قراءة واحدة بالتوازي).
// يستدعيها المشهد بعد كل جلب موثوق للعناصر — فمادة سلّمها العالم
// لقارئها (035) تصل حين يقرأ اللاعب، لا بعد تحديث يدوي.
// ============================================================
'use client';

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { LobbyMember, Specialization } from '@/types/database';
import { EMPTY_RUNTIME } from '@/lib/runtime/projection';
import type { RuntimeReadModel } from '@/lib/runtime/types';
import { createRefetchGate } from '@/lib/realtime/objectSync';
import { useRuntimeState } from '../runtime/useRuntimeState';
import { useSpecializationHolders, type SpecializationHolders } from '../useSpecializationHolders';

export interface PlayValue {
  sessionId: string;
  myId: string;
  members: LobbyMember[];
  mySpecs: Specialization[];
  holders: SpecializationHolders | null;
  /** المحرك مفعّل ومثبّت لهذه القضية (وإلا كل شيء يعمل بدونه). */
  live: boolean;
  runtime: RuntimeReadModel;
  nudge: () => void;
  shareLead: (lead: string) => Promise<boolean>;
}

const PlayContext = createContext<PlayValue | null>(null);

export function PlayProvider({
  sessionId,
  myId,
  members,
  mySpecs,
  enabled,
  children,
}: {
  sessionId: string;
  myId: string;
  members: LobbyMember[];
  mySpecs: Specialization[];
  /** عقد القضية: runtime.engine. */
  enabled: boolean;
  children: ReactNode;
}) {
  const view = useRuntimeState(sessionId, enabled);
  const holders = useSpecializationHolders(sessionId);
  // بوابة واحدة لكل الجلسة: دفعة إشارات = قراءة واحدة لاحقة.
  const gateRef = useRef<ReturnType<typeof createRefetchGate> | null>(null);
  useEffect(() => {
    const gate = createRefetchGate(view.reload);
    gateRef.current = gate;
    return () => {
      gate.dispose();
      if (gateRef.current === gate) gateRef.current = null;
    };
  }, [view.reload]);

  const value = useMemo<PlayValue>(
    () => ({
      sessionId,
      myId,
      members,
      mySpecs,
      holders,
      live: enabled && view.installed === true,
      runtime: view.model ?? EMPTY_RUNTIME,
      nudge: () => {
        if (enabled && view.installed !== false) void gateRef.current?.trigger();
      },
      shareLead: view.shareLead,
    }),
    [sessionId, myId, members, mySpecs, holders, enabled, view.installed, view.model, view.shareLead],
  );

  return <PlayContext.Provider value={value}>{children}</PlayContext.Provider>;
}

/** null خارج المزوّد (مثلاً اختبار مكوّن منفرد) — كل مستهلك يتصرف بهدوء. */
export const usePlay = (): PlayValue | null => useContext(PlayContext);
