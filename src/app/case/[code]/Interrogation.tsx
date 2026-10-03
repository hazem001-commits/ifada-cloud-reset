// ============================================================
// src/app/case/[code]/Interrogation.tsx
// الاستجواب. بس المحقق الميداني يقدر يسأل — الباقي يشوف حياً.
// ============================================================
"use client";

import r from "./interrogation.module.css";
import { SurfaceState } from "./ui/Surface";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeAuthenticated } from "@/lib/supabase/realtime";
import type { Specialization } from "@/types/database";
import type { EvidenceItem } from "@/types/case";
import {
  translateInterrogateError,
  type InterrogationEntry,
  type InterrogationSubject,
} from "@/types/investigation";

export default function Interrogation({
  sessionId,
  mySpec,
  evidence,
}: {
  sessionId: string;
  mySpec: Specialization;
  evidence: EvidenceItem[];
}) {
  const [subjects, setSubjects] = useState<InterrogationSubject[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [log, setLog] = useState<InterrogationEntry[]>([]);
  const [question, setQuestion] = useState("");
  const [attachedEvidence, setAttachedEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [mySpecs, setMySpecs] = useState<Specialization[]>([mySpec]);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();

      const { data } = await supabase.rpc("my_specializations", {
        p_session: sessionId,
      });

      if (data && Array.isArray(data)) {
        setMySpecs(data as Specialization[]);
      }
    })();
  }, [sessionId]);

  const canInterrogate = mySpecs.includes("field");

  const loadSubjects = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("interrogation_subjects", {
      p_session: sessionId,
    });
    if (data) {
      const list = data as InterrogationSubject[];
      setSubjects(list);
      setActive((cur) => cur ?? list[0]?.code ?? null);
    }
  }, [sessionId]);

  // الشخصية المفتوحة حالياً — للقناة الحية بدون ما نعيد الاشتراك مع كل تبديل،
  // ولتجاهل رد متأخر لشخصية تانية.
  const activeRef = useRef<string | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const loadLog = useCallback(
    async (characterCode: string) => {
      const supabase = createClient();
      const { data } = await supabase
        .from("interrogation_log")
        .select("id,speaker,content,evidence_code,created_at")
        .eq("session_id", sessionId)
        .eq("character_code", characterCode)
        .order("created_at", { ascending: true });
      if (data && activeRef.current === characterCode) {
        setLog(data as InterrogationEntry[]);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  useEffect(() => {
    if (active) void loadLog(active);
  }, [active, loadLog]);

  // مزامنة حية — الفريق كله يشوف الاستجواب لحظة بلحظة
  // الحدث إشارة: سطر جديد للشخصية المفتوحة = إعادة جلب سجلها من الجدول.
  useEffect(() => {
    return subscribeAuthenticated(
      createClient(),
      `interrogation:${sessionId}`,
      (channel) =>
        channel
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "interrogation_log",
              filter: `session_id=eq.${sessionId}`,
            },
            (payload) => {
              const character = (payload.new as { character_code?: string })
                .character_code;
              if (character && character === activeRef.current) {
                void loadLog(character);
              }
            },
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "session_character_state",
              filter: `session_id=eq.${sessionId}`,
            },
            () => void loadSubjects(),
          ),
      () => {
        void loadSubjects();
        if (activeRef.current) void loadLog(activeRef.current);
      },
    );
  }, [sessionId, loadSubjects, loadLog]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [log]);

  async function send() {
    if (!active || !question.trim() || busy) return;
    setBusy(true);
    setError(null);

    const res = await fetch("/api/interrogate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        characterCode: active,
        question: question.trim(),
        evidenceCode: attachedEvidence || undefined,
      }),
    });

    setBusy(false);

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(translateInterrogateError(errBody.error ?? ""));
      return;
    }

    setQuestion("");
    setAttachedEvidence("");
    await loadLog(active);
  }

  const activeSubject = subjects.find((s) => s.code === active);

  // محضر لا محادثة: أسطر رسمية (المحقق / الشخص) ومعروضات — نفس البيانات
  // ونفس المنطق تماماً؛ تغيّر العرض فقط (أساس المرحلة 9: المواجهة).
  return (
    <div className={r.room}>
      <nav className={r.people} aria-label="المستجوَبون">
        <span className={r.peopleTitle}>المستجوَبون</span>
        {subjects.map((s) => (
          <button key={s.code} type="button" className={r.person} aria-pressed={active === s.code} onClick={() => setActive(s.code)}>
            <span className={r.personName}>{s.name}</span>
            <span className={r.personMeta}>
              {s.role} · طبقة {s.current_layer}
            </span>
          </button>
        ))}
      </nav>

      <section className={r.record} aria-label={`محضر استجواب ${activeSubject?.name ?? ""}`}>
        <div ref={scrollRef} className={r.log} aria-live="polite">
          {log.length === 0 && (
            <SurfaceState variant="empty">ما في استجواب لهلأ مع {activeSubject?.name ?? "هذا الشخص"}.</SurfaceState>
          )}
          {log.map((entry) => (
            <div key={entry.id} className={r.line} data-speaker={entry.speaker}>
              <span className={r.speaker}>{entry.speaker === "player" ? "المحقق" : (activeSubject?.name ?? "الشخص")}</span>
              <span className={r.statement}>
                {entry.evidence_code && <span className={r.exhibit}>معروض: {entry.evidence_code}</span>}
                {entry.evidence_code && <br />}
                {entry.content}
              </span>
            </div>
          ))}
        </div>

        <div className={r.desk}>
          {!canInterrogate ? (
            <p className={r.watch}>
              بس المحقق الميداني يقدر يسأل — إنت بتشوف الاستجواب حياً وبتقدر تقترح أسئلة بصوتك.
            </p>
          ) : (
            <>
              {error && <SurfaceState variant="error">{error}</SurfaceState>}
              <label className={r.deskLabel} htmlFor="interrogation-exhibit">
                اعرض مادة على الشخص (اختياري)
              </label>
              <select
                id="interrogation-exhibit"
                className="field"
                style={{ fontSize: "var(--t-sm)" }}
                value={attachedEvidence}
                onChange={(e) => setAttachedEvidence(e.target.value)}
              >
                <option value="">بلا معروض</option>
                {evidence.map((e) => (
                  <option key={e.code} value={e.code}>
                    {e.code} — {e.title}
                  </option>
                ))}
              </select>
              <label className={r.deskLabel} htmlFor="interrogation-question">
                سؤال المحقق
              </label>
              <div className={r.deskRow}>
                <input
                  id="interrogation-question"
                  className="field"
                  value={question}
                  maxLength={400}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void send();
                  }}
                />
                <button className="btn" onClick={send} disabled={busy || !question.trim()}>
                  {busy ? "يُسجَّل الرد…" : "اطرح السؤال"}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
