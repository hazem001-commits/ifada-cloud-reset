// ============================================================
// src/app/case/[code]/CaseAutomation.tsx
// الساعة الحية + الفرص المؤقتة (CaseTimeBar) + البث والانقطاع
// الجماعي. هاد المكوّن هو "روح" اللعبة الحية.
// ============================================================
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeAuthenticated } from "@/lib/supabase/realtime";
import CaseTimeBar, { type ExpiringItem } from "./CaseTimeBar";
import { useCaseId } from "@/cases/CaseContext";
import { getCaseContract } from "@/cases/registry";

interface ClockRow {
  start_ck: number;
  multiplier: number;
  started_at: string;
  now_ck: number;
}

interface SessionEvent {
  id: string;
  milestone_code: string;
  kind: "broadcast" | "blackout";
  headline: string;
  body: string;
  created_at: string;
}

export default function CaseAutomation({ sessionId }: { sessionId: string }) {
  const [clock, setClock] = useState<ClockRow | null>(null);
  const [expiring, setExpiring] = useState<ExpiringItem[]>([]);
  const worldOnly = getCaseContract(useCaseId())?.worldDiscoveryOnly === true;
  const [banner, setBanner] = useState<SessionEvent | null>(null);
  const [blackout, setBlackout] = useState<SessionEvent | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const loadClock = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("case_clock", { p_session: sessionId });
    const row = Array.isArray(data)
      ? (data[0] as ClockRow | undefined)
      : undefined;
    if (row) setClock(row);
  }, [sessionId]);

  const loadExpiring = useCallback(async () => {
    // اكتشاف بالعالم فقط: لا نطلب عناوين مواد لم يحصل عليها الفريق أصلاً.
    if (worldOnly) return;
    const supabase = createClient();
    const { data } = await supabase.rpc("expiring_evidence", {
      p_session: sessionId,
    });
    if (data) setExpiring(data as ExpiringItem[]);
  }, [sessionId, worldOnly]);

  // تحميل أولي + تحديث الساعة كل 20 ثانية (عرض بصري فقط،
  // كل فحص فعلي للانتهاء يصير بالسيرفر وقت الفتح)
  useEffect(() => {
    void loadClock();
    void loadExpiring();

    const interval = window.setInterval(() => {
      void loadClock();
      void loadExpiring();
    }, 20_000);

    return () => window.clearInterval(interval);
  }, [loadClock, loadExpiring]);

  // أي حدث جديد بالجلسة (بث أو انقطاع) يوصل فوراً بالوقت الحقيقي.
  // الـ payload إشارة فقط (id) — المحتوى المعروض بيُقرأ من الجدول نفسه
  // تحت RLS، ومرة وحدة لكل حدث.
  useEffect(() => {
    let disposed = false;

    async function present(eventId: string) {
      if (seen.current.has(eventId)) return;
      seen.current.add(eventId);

      const { data } = await createClient()
        .from("session_events")
        .select("id,milestone_code,kind,headline,body,created_at")
        .eq("id", eventId)
        .eq("session_id", sessionId)
        .maybeSingle();
      if (disposed || !data) {
        seen.current.delete(eventId);
        return;
      }

      const row = data as SessionEvent;
      if (row.kind === "blackout") {
        setBlackout(row);
        window.setTimeout(() => setBlackout(null), 6500);
      } else {
        setBanner(row);
        window.setTimeout(() => setBanner(null), 9000);
      }
      void loadExpiring();
    }

    const unsubscribe = subscribeAuthenticated(
      createClient(),
      `events:${sessionId}`,
      (channel) =>
        channel.on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "session_events",
            filter: `session_id=eq.${sessionId}`,
          },
          (payload) => {
            const id = (payload.new as { id?: string }).id;
            if (id) void present(id);
          },
        ),
      // بعد (إعادة) الاشتراك: نحدّث الحالة الحية بس — ما منعيد عرض بث قديم.
      () => void loadExpiring(),
    );

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [sessionId, loadExpiring]);

  return (
    <>
      {/* شريط الساعة الحية + الفرص المؤقتة */}
      {/* اكتشاف بالعالم فقط: لا تُسمّى مادة لم يحصل عليها الفريق ("فرصة مؤقتة" بعنوان دليل غير مكتشف). */}
      {clock && <CaseTimeBar nowCk={clock.now_ck} expiring={worldOnly ? [] : expiring} />}

      {/* بث حي — شريط إشعار */}
      {banner && (
        <div
          style={{
            position: "fixed",
            insetInlineStart: "1rem",
            insetInlineEnd: "1rem",
            bottom: "1rem",
            zIndex: 40,
            background: "var(--ink-raised)",
            borderInlineStart: "3px solid var(--signal)",
            padding: "0.9rem 1.1rem",
            maxWidth: "32rem",
            marginInlineStart: "auto",
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          }}
          role="status"
        >
          <div
            className="mono"
            style={{ fontSize: "var(--t-xs)", color: "var(--signal)" }}
          >
            بث حي
          </div>
          <strong style={{ display: "block", marginTop: "0.2rem" }}>
            {banner.headline}
          </strong>
          <p
            className="muted"
            style={{ fontSize: "var(--t-sm)", marginTop: "0.3rem" }}
          >
            {banner.body}
          </p>
        </div>
      )}

      {/* الانقطاع الجماعي — يغطي الشاشة كلها لحظياً لكل الفريق */}
      {blackout && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "#000",
            color: "var(--paper)",
            display: "grid",
            placeContent: "center",
            textAlign: "center",
            gap: "1rem",
            padding: "2rem",
            animation: "ifada-blackout-in 0.4s ease",
          }}
        >
          <span
            className="mono"
            style={{ fontSize: "var(--t-xs)", color: "var(--seal)" }}
          >
            CASE UPDATE
          </span>
          <h1
            className="mono"
            style={{
              fontSize: "clamp(1.25rem, 5vw, 2.25rem)",
              letterSpacing: "0.03em",
            }}
          >
            {blackout.headline}
          </h1>
          <p className="muted" style={{ maxWidth: "40ch", margin: "0 auto" }}>
            {blackout.body}
          </p>
        </div>
      )}

      <style>{`
        @keyframes ifada-blackout-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes ifada-blackout-in { from,to { opacity: 1; } }
        }
      `}</style>
    </>
  );
}
