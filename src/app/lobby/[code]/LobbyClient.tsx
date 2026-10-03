// ============================================================
// src/app/lobby/[code]/LobbyClient.tsx
// يتابع الأعضاء بالوقت الحقيقي. لما يكتمل العدد الأدنى،
// المضيف يقدر يبدأ التحقيق.
// ============================================================
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  buildLobbyView,
  specLabel,
  type LobbyRow,
  type LobbyView,
} from "@/types/database";

export default function LobbyClient({
  code,
  initial,
  me,
}: {
  code: string;
  initial: LobbyView;
  me: string;
}) {
  const [view, setView] = useState<LobbyView>(initial);
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigated = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // الانتقال للتحقيق مرة وحدة فقط، ومحكوم بحالة الجلسة الحقيقية من السيرفر.
  // رد متأخر بعد مغادرة اللوبي ما بينقل اللاعب لأي مكان.
  const goToCase = useCallback(() => {
    if (navigated.current || !mounted.current) return;
    navigated.current = true;
    router.push(`/case/${code}`);
  }, [router, code]);

  // المصدر الموثوق: session_lobby (RPC بصلاحيات السيرفر) — أحداث الـ Realtime
  // مجرد إشارة للتحديث، ما منعتمد على محتوى الـ payload.
  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("session_lobby", { p_code: code });
    if (error || !data) return;
    const next = buildLobbyView(data as LobbyRow[]);
    if (!next) return;
    setView(next);
    if (next.status === "active" || next.status === "hearing") goToCase();
  }, [code, goToCase]);

  useEffect(() => {
    if (initial.status === "active" || initial.status === "hearing") goToCase();
  }, [initial.status, goToCase]);

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let disposed = false;

    void (async () => {
      // لازم الـ Realtime يعرف هوية اللاعب قبل الاشتراك: بدون توكن المستخدم
      // الاشتراك بينقبل بس كـ anon، وRLS (is_session_member) بيحجب كل الأحداث
      // بصمت — هذا كان سبب عدم تحديث العدد وعدم الانتقال التلقائي.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (disposed) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (disposed) return;

      channel = supabase
        .channel(`lobby:${initial.sessionId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "session_members",
            filter: `session_id=eq.${initial.sessionId}`,
          },
          () => void refresh(),
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "sessions",
            filter: `id=eq.${initial.sessionId}`,
          },
          () => void refresh(),
        )
        .subscribe((status) => {
          // بعد كل اشتراك (أول مرة أو بعد إعادة اتصال): نجلب الحالة الحالية
          // حتى ما يفوتنا انضمام/بدء صار قبل ما يجهز الاشتراك.
          if (status === "SUBSCRIBED") void refresh();
        });
    })();

    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [initial.sessionId, refresh]);

  const amHost = view.members.some((m) => m.userId === me && m.isHost);
  const ready = view.members.length >= view.minPlayers;

  async function startInvestigation() {
    setBusy(true);

    const supabase = createClient();

    const { error } = await supabase.rpc("start_session", {
      p_session: view.sessionId,
    });

    if (error) {
      console.error("START SESSION ERROR:", error.message);
    }
    // سواء بدأنا هلأ أو كانت بادئة أصلاً: الحالة من السيرفر بتقرر الانتقال.
    await refresh();
    setBusy(false);
  }

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="shell" style={{ maxWidth: "44rem" }}>
      <span className="stamp">ASSEMBLING TEAM</span>

      <h1 style={{ fontSize: "var(--t-2xl)", marginTop: "1rem" }}>
        {view.caseTitle}
      </h1>

      <p className="muted">
        شارك هذا الكود مع فريقك. التحقيق ما بيبدأ قبل ما يوصلوا{" "}
        <span className="mono">{view.minPlayers}</span> محققين.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          margin: "1.25rem 0",
          flexWrap: "wrap",
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: "var(--t-2xl)",
            letterSpacing: "0.25em",
            background: "var(--ink-raised)",
            padding: "0.5rem 1rem",
            border: "1px solid var(--ink-line)",
          }}
        >
          {code}
        </span>
        <button className="btn btn-quiet" onClick={copyCode}>
          {copied ? "انتسخ" : "انسخ الكود"}
        </button>
      </div>

      <hr className="rule" />

      <h2 style={{ fontSize: "var(--t-lg)" }}>
        الفريق{" "}
        <span className="mono muted">
          {view.members.length}/{view.maxPlayers}
        </span>
      </h2>

      {view.status === "lobby" && (
        // مطابق لـ assign_session_specializations: عند البدء، أي تخصص من
        // الأربعة غير مختار يُسند لأحد أعضاء الفريق (بفريق أقل من أربعة).
        <p className="muted" style={{ fontSize: "var(--t-sm)", marginTop: "0.4rem" }}>
          التخصص الظاهر هو اختيار كل محقق الأساسي. عند بدء التحقيق، إذا كان
          الفريق أقل من أربعة، تتوزّع التخصصات غير المختارة على الفريق — فيحمل
          بعضكم أكثر من تخصص.
        </p>
      )}

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          marginTop: "0.75rem",
          display: "grid",
          gap: "1px",
        }}
      >
        {view.members.map((m) => (
          <li
            key={m.userId}
            style={{
              background: "var(--ink-raised)",
              padding: "0.85rem 1rem",
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <span>
              {m.displayName}
              {m.userId === me && <span className="muted"> (أنت)</span>}
              {m.isHost && <span className="muted"> · قائد الفريق</span>}
            </span>
            <span className="muted">{specLabel(m.specialization)}</span>
          </li>
        ))}
      </ul>

      {view.status === "active" ? (
        <>
          <hr className="rule" />
          <a className="btn" href={`/case/${code}`}>
            ادخل على التحقيق
          </a>
        </>
      ) : (
        <>
          <hr className="rule" />
          {amHost ? (
            <button
              className="btn"
              disabled={!ready || busy}
              onClick={startInvestigation}
            >
              {ready
                ? "ابدأ التحقيق"
                : `ناقص ${view.minPlayers - view.members.length} محقق`}
            </button>
          ) : (
            <p className="muted">
              {ready
                ? "الفريق جاهز. بانتظار قائد الفريق يبدأ."
                : "بانتظار باقي الفريق."}
            </p>
          )}
        </>
      )}
    </main>
  );
}
