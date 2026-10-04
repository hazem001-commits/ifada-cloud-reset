// ============================================================
// src/app/case/[code]/CaseWorkspace.tsx
// المساحة الرئيسية للتحقيق: الأدلة + اللوحة المشتركة.
// ============================================================
"use client";

import { useCallback, useEffect, useState } from "react";
import CaseAutomation from "./CaseAutomation";
import VoiceRoom from "./VoiceRoom";
import { createClient } from "@/lib/supabase/client";
import { subscribeAuthenticated } from "@/lib/supabase/realtime";
import type { LobbyMember, Specialization } from "@/types/database";
import type { EvidenceItem, UnlockableItem } from "@/types/case";
import { translateCaseError } from "@/types/case";
import EvidencePanel from "./EvidencePanel";
import InvestigationBoard from "./board/InvestigationBoard";
import Reconstruction from "./Reconstruction";
import Interrogation from "./Interrogation";
import Hearing from "./Hearing";
import TeamCard from "./TeamCard";
import InvestigationEngine from "./investigation/InvestigationEngine";
import CaseFile from "./casefile/CaseFile";
import CaseNav, { type CaseTab } from "./CaseNav";
import { useMySpecializations } from "./useMySpecializations";
import { CaseProvider } from "@/cases/CaseContext";
import { getCaseContract } from "@/cases/registry";
import { visibleEvidenceRows } from "@/lib/evidenceVisibility";
import RuntimeInspector from "./runtime/RuntimeInspector";
import { PlayProvider } from "./play/PlayContext";
import TeamPresence from "./play/TeamPresence";
import LeadThreads from "./play/LeadThreads";
import type { LeadPointer } from "@/cases/presentation";
import CaseBriefing, { briefingSeen, markBriefingSeen } from "./play/CaseBriefing";
import { getCasePresentation } from "@/cases/registry";
import { runtimeInspectorEnabled } from "@/lib/runtime/devGate";

type Tab = CaseTab;
export default function CaseWorkspace({
  sessionId,
  caseId,
  caseTitle,
  code,
  mySpec,
  myId,
  members,
}: {
  sessionId: string;
  /** cases.id — كل عرض خاص بالقضية يُقرأ ضمن نطاقها (CaseProvider). */
  caseId: string;
  caseTitle: string;
  code: string;
  mySpec: Specialization;
  myId: string;
  members: LobbyMember[];
}) {
  const myName = members.find((m) => m.userId === myId)?.displayName ?? "";
  // التخصصات الفعلية من السيرفر؛ الأساسي وحده فقط ريثما تصل القراءة.
  const mySpecs = useMySpecializations(sessionId, mySpec) ?? [mySpec];
  const [sessionStatus, setSessionStatus] = useState<"active" | "closed">(
    "active",
  );

  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("investigation");
  // "ارجع لمصدره" من اللوحة: يفتح مكان التحقيق مركّزاً على العنصر (إعادة تركيب = مرة واحدة).
  const [sourceFocus, setSourceFocus] = useState<{ code: string; nonce: number } | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  /** أدلة أقرؤها وهي خاصة بقناتي (توزيع القنوات): لا تُعرض كقابلة للتثبيت. */
  const [privateEvidence, setPrivateEvidence] = useState<string[]>([]);
  const [unlockable, setUnlockable] = useState<UnlockableItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  // بلاغ الوصول: مرة لكل لاعب بكل جلسة (يُقرأ بعد التركيب — تخزين المتصفح).
  const hasOpening = !!getCasePresentation(caseId).opening;
  const [briefing, setBriefing] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();

    const channelCase = getCaseContract(caseId)?.distribution.kind === "channels";
    // اكتشاف بالعالم فقط: قائمة الفتح القديمة لا تُطلب أصلاً (عناوين مواد لم تُكتشف لا تصل للمتصفح).
    const worldOnly = getCaseContract(caseId)?.worldDiscoveryOnly === true;
    const [idx, unlockables, lanes] = await Promise.all([
      supabase.rpc("evidence_index", { p_session: sessionId }),
      worldOnly ? Promise.resolve({ data: [], error: null }) : supabase.rpc("unlockable_evidence", { p_session: sessionId }),
      // إرشاد عرض من السيرفر (أكواد أقرؤها أصلاً فقط)؛ الفشل = لا إرشاد، والسيرفر يقرر عند التثبيت.
      channelCase
        ? fetch("/api/private-evidence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          })
            .then((r) => (r.ok ? (r.json() as Promise<{ codes?: unknown }>) : null))
            .catch(() => null)
        : null,
    ]);
    // فشل عابر لا يمسح آخر إرشاد صحيح (وإلا عادت أزرار التثبيت للأدلة الخاصة).
    const laneCodes = lanes?.codes;
    if (Array.isArray(laneCodes)) {
      setPrivateEvidence(laneCodes.filter((c): c is string => typeof c === "string"));
    }

    if (idx.error) {
      setError(translateCaseError(idx.error.message));
    } else {
      // سياسة القضية من المصدر: المخفي (قنوات المشهد 17) لا يصل لأي سطح عميل.
      setEvidence(visibleEvidenceRows((idx.data ?? []) as EvidenceItem[], getCaseContract(caseId)?.restrictedEvidence ?? "hidden"));
    }

    if (!unlockables.error) {
      setUnlockable((unlockables.data ?? []) as UnlockableItem[]);
    }

    setLoading(false);
  }, [sessionId, caseId]);

  // فتح الأدلة الابتدائية مرة واحدة، ثم التحميل
  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      await supabase.rpc("open_case", { p_session: sessionId });
      await load();
      if (hasOpening && !briefingSeen(sessionId, myId)) setBriefing(true);
      const supabase2 = createClient();

      const { data: s } = await supabase2
        .from("sessions")
        .select("status,started_at")
        .eq("id", sessionId)
        .single();

      if (s) {
        setSessionStatus(s.status === "closed" ? "closed" : "active");
        setStartedAt(s.started_at);
      }
    })();
  }, [sessionId, load, hasOpening, myId]);

  // مزامنة حية: أي دليل يفتحه أي عضو يوصل للكل فوراً.
  // الحدث إشارة فقط — الحالة الموثوقة من evidence_index (مع إعادة جلب
  // بعد كل اشتراك/إعادة اتصال حتى ما يفوتنا فتح صار بالأثناء).
  useEffect(() => {
    return subscribeAuthenticated(
      createClient(),
      `case:${sessionId}`,
      (channel) =>
        channel.on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "session_evidence",
            filter: `session_id=eq.${sessionId}`,
          },
          () => void load(),
        ),
      () => void load(),
    );
  }, [sessionId, load]);

  async function unlock(evidenceCode: string) {
    const supabase = createClient();

    const { error: rpcError } = await supabase.rpc("unlock_evidence", {
      p_session: sessionId,
      p_code: evidenceCode,
    });

    if (rpcError) {
      setFlash(translateCaseError(rpcError.message));
      window.setTimeout(() => setFlash(null), 3500);
      return;
    }

    await load();

    await supabase.rpc("check_milestones", {
      p_session: sessionId,
    });
  }

  const contract = getCaseContract(caseId);

  // خيط → اتجاهه: تبويب يفتحه اللاعب، أو عنصر/مكان في المشهد (نفس مسار
  // "ارجع لمصدره": يُركَّز فقط إن كان في فهرسي أنا — لا كشف لشيء مخفي).
  const followLead = (pointer: LeadPointer) => {
    if (pointer.kind === "tab") return setTab(pointer.tab);
    setSourceFocus((prev) => ({ code: pointer.code, nonce: (prev?.nonce ?? 0) + 1 }));
    setTab("investigation");
  };

  return (
    <CaseProvider caseId={caseId}>
      <PlayProvider
        sessionId={sessionId}
        myId={myId}
        members={members}
        mySpecs={mySpecs}
        enabled={!!contract?.runtime.engine}
      >
      <div
        style={
          tab === "investigation"
            ? // المشهد يملأ ما تحت شريط القضية بالضبط — بلا تمرير للصفحة.
              {
                height: "100dvh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }
            : {
                minHeight: "100dvh",
                display: "grid",
                gridTemplateRows: "auto auto 1fr",
              }
        }
      >
        <CaseAutomation sessionId={sessionId} />

        {/* DEV ONLY: مفتش المحرك (RESET-1) — لا يظهر بالإنتاج. */}
        {runtimeInspectorEnabled(getCaseContract(caseId)) && (
          <RuntimeInspector sessionId={sessionId} myId={myId} members={members} />
        )}

        <CaseNav
          tab={tab}
          onTab={setTab}
          caseTitle={caseTitle}
          roomCode={code}
          specs={mySpecs}
          sessionClosed={sessionStatus === "closed"}
          aside={
            <>
              {contract?.runtime.engine && <TeamPresence />}
              {contract?.runtime.engine && (
                <LeadThreads variant="header" onFollow={followLead} onBriefing={hasOpening ? () => setBriefing(true) : undefined} />
              )}
              <span className="case-voice">
                <VoiceRoom sessionId={sessionId} myName={myName} />
              </span>
            </>
          }
        />

        {flash && (
          <p
            className="notice"
            style={{ margin: "0.75rem clamp(1rem, 4vw, 2rem)" }}
          >
            {flash}
          </p>
        )}

        {error ? (
          <main className="shell">
            <p className="notice">{error}</p>
          </main>
        ) : loading ? (
          <main className="shell">
            <p className="muted">عم نفتح الملف…</p>
          </main>
        ) : tab === "investigation" ? (
          <InvestigationEngine
            key={sourceFocus?.nonce ?? 0}
            sessionId={sessionId}
            evidence={evidence}
            onNavigate={setTab}
            initialFocus={sourceFocus?.code ?? null}
          />
        ) : tab === "casefile" ? (
          <CaseFile sessionId={sessionId} caseTitle={caseTitle} evidence={evidence} privateEvidence={privateEvidence} />
        ) : tab === "evidence" ? (
          <EvidencePanel
            sessionId={sessionId}
            evidence={evidence}
            unlockable={unlockable}
            mySpecs={mySpecs}
            myId={myId}
            members={members}
            onUnlock={unlock}
          />
        ) : tab === "board" ? (
          <InvestigationBoard
            sessionId={sessionId}
            myId={myId}
            evidence={evidence}
            privateEvidence={privateEvidence}
            specsKey={mySpecs.join(',')}
            members={members}
            onReturnToSource={(code) => {
              setSourceFocus((prev) => ({ code, nonce: (prev?.nonce ?? 0) + 1 }));
              setTab("investigation");
            }}
          />
        ) : tab === "reconstruction" ? (
          <Reconstruction sessionId={sessionId} />
        ) : tab === "interrogation" ? (
          <Interrogation
            sessionId={sessionId}
            mySpec={mySpec}
            evidence={evidence}
          />
        ) : (
          <div style={{ display: "grid", gap: "2rem" }}>
            <Hearing
              sessionId={sessionId}
              caseClosed={sessionStatus === "closed"}
            />

            {sessionStatus === "closed" && (
              <TeamCardSection
                sessionId={sessionId}
                caseTitle={caseTitle}
                members={members}
                startedAt={startedAt}
              />
            )}
          </div>
        )}

        {tab === "investigation" && contract?.runtime.engine && !loading && !error && (
          <LeadThreads variant="pill" onFollow={followLead} onBriefing={hasOpening ? () => setBriefing(true) : undefined} />
        )}

        {briefing && !loading && !error && (
          <CaseBriefing
            caseTitle={caseTitle}
            evidence={evidence}
            onEnter={() => {
              markBriefingSeen(sessionId, myId);
              setBriefing(false);
              setTab("investigation");
            }}
          />
        )}
      </div>
      </PlayProvider>
    </CaseProvider>
  );
}
function TeamCardSection({
  sessionId,
  caseTitle,
  members,
  startedAt,
}: {
  sessionId: string;
  caseTitle: string;
  members: LobbyMember[];
  startedAt: string | null;
}) {
  const [overall, setOverall] = useState<
    "proven" | "true_but_unproven" | "wrong_reconstruction" | null
  >(null);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();

      const { data } = await supabase
        .from("session_verdict")
        .select("overall")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (data) {
        setOverall(data.overall);
      }
    })();
  }, [sessionId]);

  if (!overall) return null;

  return (
    <TeamCard
      sessionId={sessionId}
      caseTitle={caseTitle}
      overall={overall}
      members={members}
      startedAt={startedAt}
    />
  );
}
