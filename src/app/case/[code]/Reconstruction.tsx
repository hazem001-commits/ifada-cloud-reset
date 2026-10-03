// ============================================================
// src/app/case/[code]/Reconstruction.tsx
// محرك الاتساق. اللاعبون يبنون نظرية، والمحرك يفحصها ضد
// الفيزياء (الزمن والمسافة) والأدلة المثبتة — مش ضد "جواب صح".
// ============================================================
"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeAuthenticated } from "@/lib/supabase/realtime";
import {
  clockToMinutes,
  minutesToClock,
  type LocationItem,
  type PersonItem,
  type TheoryEvaluation,
  type TheoryPlacement,
} from "@/types/investigation";

const ISSUE_LABEL: Record<string, string> = {
  impossible: "مستحيل فيزيائياً",
  contradiction: "تعارض مع دليل",
  gap: "فجوة غير مفسّرة",
};

export default function Reconstruction({ sessionId }: { sessionId: string }) {
  const [people, setPeople] = useState<PersonItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [placements, setPlacements] = useState<TheoryPlacement[]>([]);
  const [evaluation, setEvaluation] = useState<TheoryEvaluation | null>(null);
  const [checking, setChecking] = useState(false);

  // نموذج الإضافة
  const [person, setPerson] = useState("");
  const [location, setLocation] = useState("");
  const [startHH, setStartHH] = useState("23");
  const [startMM, setStartMM] = useState("00");
  const [endHH, setEndHH] = useState("23");
  const [endMM, setEndMM] = useState("15");
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();

    // الأماكن والأشخاص عامة (case_id معروف عبر الجلسة بالسيرفر مسبقاً،
    // هون بنجيبهم عبر أول دليل موجود لتفادي استدعاء إضافي — الأبسط
    // إنه نجيبهم مباشرة لأن سياستهم select true).
    const { data: sess } = await supabase
      .from("sessions")
      .select("case_id")
      .eq("id", sessionId)
      .single();

    if (sess) {
      const [loc, ppl, pl] = await Promise.all([
        supabase
          .from("locations")
          .select("code,name")
          .eq("case_id", sess.case_id),
        supabase
          .from("timeline_people")
          .select("code,name")
          .eq("case_id", sess.case_id),
        supabase
          .from("theory_placements")
          .select("*")
          .eq("session_id", sessionId)
          .order("start_ck"),
      ]);
      if (loc.data) setLocations(loc.data as LocationItem[]);
      if (ppl.data) {
        setPeople(ppl.data as PersonItem[]);
        if (ppl.data[0])
          setPerson((p) => p || (ppl.data[0] as PersonItem).code);
      }
      if (loc.data?.[0])
        setLocation((l) => l || (loc.data[0] as LocationItem).code);
      if (pl.data) setPlacements(pl.data as TheoryPlacement[]);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeAuthenticated(
      createClient(),
      `theory:${sessionId}`,
      (channel) =>
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "theory_placements",
            filter: `session_id=eq.${sessionId}`,
          },
          () => void load(),
        ),
      () => void load(),
    );
  }, [sessionId, load]);

  async function addPlacement() {
    setFormError(null);
    const startHour = Number(startHH);
    const endHour = Number(endHH);

    const start = clockToMinutes(startHour, Number(startMM), startHour < 6);

    const end = clockToMinutes(endHour, Number(endMM), endHour < 6);

    if (end <= start) {
      setFormError("وقت النهاية لازم يكون بعد وقت البداية.");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("theory_placements").insert({
      session_id: sessionId,
      person_code: person,
      location_code: location,
      start_ck: start,
      end_ck: end,
      author_id: (await supabase.auth.getUser()).data.user?.id,
    });

    if (error) {
      setFormError("ما قدرنا نضيف. جرّب مرة ثانية.");
      return;
    }
    setEvaluation(null);
  }

  async function removePlacement(id: string) {
    setFormError(null);

    // نشيلها من الشاشة فوراً
    const previous = placements;
    setPlacements((current) => current.filter((item) => item.id !== id));
    setEvaluation(null);

    const supabase = createClient();

    const { data, error } = await supabase
      .from("theory_placements")
      .delete()
      .eq("id", id)
      .eq("session_id", sessionId)
      .select("id");

    if (error) {
      setPlacements(previous);
      setFormError(`فشل حذف النظرية: ${error.message}`);
      return;
    }

    if (!data || data.length === 0) {
      setPlacements(previous);
      setFormError("ما تم حذف النظرية من قاعدة البيانات.");
      return;
    }

    // تأكيد الحالة من قاعدة البيانات
    await load();
  }

  async function evaluate() {
    setChecking(true);
    setEvaluation(null);
    setFormError(null);

    try {
      const supabase = createClient();

      const { data, error } = await supabase.rpc("evaluate_theory", {
        p_session: sessionId,
      });

      if (error) {
        setFormError(`فشل تدقيق النظرية: ${error.message}`);
        return;
      }

      if (data) {
        setEvaluation(data as TheoryEvaluation);
      }
    } catch {
      setFormError("صار خطأ أثناء تدقيق النظرية. جرّب مرة ثانية.");
    } finally {
      setChecking(false);
    }
  }

  function personName(code: string): string {
    return people.find((p) => p.code === code)?.name ?? code;
  }
  function locationName(code: string): string {
    return locations.find((l) => l.code === code)?.name ?? code;
  }

  const grouped = people
    .map((p) => ({
      person: p,
      items: placements.filter((pl) => pl.person_code === p.code),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <main className="shell" style={{ width: "100%" }}>
      <h2 style={{ fontSize: "var(--t-lg)" }}>إعادة البناء</h2>
      <p
        className="muted"
        style={{
          fontSize: "var(--t-sm)",
          marginTop: "0.4rem",
          maxWidth: "60ch",
        }}
      >
        حطّوا كل شخص بمكانه ووقته حسب نظريتكم. المحرك ما بيقولكم مين الفاعل —
        بيقولكم بس إذا نظريتكم ممكنة فيزيائياً وما بتتعارض مع دليل مثبّت.
      </p>

      {/* نموذج الإضافة */}
      <div
        style={{
          marginTop: "1.25rem",
          padding: "1rem",
          background: "var(--ink-raised)",
          display: "grid",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          <label
            style={{ display: "grid", gap: "0.3rem", fontSize: "var(--t-sm)" }}
          >
            الشخص
            <select
              className="field"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
            >
              {people.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label
            style={{ display: "grid", gap: "0.3rem", fontSize: "var(--t-sm)" }}
          >
            المكان
            <select
              className="field"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              {locations.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          <TimeField
            label="من الساعة"
            hh={startHH}
            mm={startMM}
            onHH={setStartHH}
            onMM={setStartMM}
          />
          <TimeField
            label="لغاية الساعة"
            hh={endHH}
            mm={endMM}
            onHH={setEndHH}
            onMM={setEndMM}
          />
        </div>

        {formError && <p className="notice">{formError}</p>}

        <button
          className="btn"
          onClick={addPlacement}
          style={{ justifySelf: "start" }}
        >
          أضف للنظرية
        </button>
      </div>

      {/* النظرية الحالية */}
      <div style={{ marginTop: "1.5rem" }}>
        {grouped.length === 0 && (
          <p className="muted">
            النظرية فاضية لهلأ. ابدأوا تحطّوا الأشخاص بمكانهم.
          </p>
        )}

        {grouped.map(({ person: p, items }) => (
          <div key={p.code} style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "var(--t-base)", fontWeight: 600 }}>
              {p.name}
            </h3>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                display: "grid",
                gap: "1px",
                marginTop: "0.4rem",
              }}
            >
              {items.map((pl) => (
                <li
                  key={pl.id}
                  style={{
                    background: "var(--ink-raised)",
                    padding: "0.6rem 0.85rem",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    fontSize: "var(--t-sm)",
                  }}
                >
                  <span>
                    <span className="mono">
                      {minutesToClock(pl.start_ck)}–{minutesToClock(pl.end_ck)}
                    </span>{" "}
                    — {locationName(pl.location_code)}
                  </span>
                  <button
                    onClick={() => void removePlacement(pl.id)}
                    style={{
                      background: "transparent",
                      border: 0,
                      color: "var(--paper-dim)",
                      cursor: "pointer",
                      fontSize: "var(--t-sm)",
                    }}
                  >
                    احذف
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <button
        className="btn"
        onClick={() => void evaluate()}
        disabled={checking || placements.length === 0}
      >
        {checking ? "جاري تدقيق النظرية…" : "دقّق النظرية"}
      </button>

      {checking && (
        <p className="notice" style={{ marginTop: "0.75rem" }}>
          جاري فحص الزمن والمسافات ومطابقة النظرية مع الأدلة…
        </p>
      )}

      {evaluation && (
        <div style={{ marginTop: "1.25rem" }}>
          <p
            style={{
              fontSize: "var(--t-sm)",
              color:
                evaluation.status === "consistent"
                  ? "var(--signal)"
                  : evaluation.status === "inconsistent"
                    ? "var(--seal)"
                    : "var(--paper)",
            }}
          >
            {evaluation.status === "consistent" &&
              "ما في تعارض واضح. هذا لا يعني إنها صحيحة — بس ما فيها استحالة أو تعارض مع دليل."}
            {evaluation.status === "consistent_with_gaps" &&
              "ما في استحالة أو تعارض، بس فيه فجوات وقت غير مفسّرة."}
            {evaluation.status === "inconsistent" &&
              "في مشاكل حقيقية بالنظرية. شوف التفاصيل تحت."}
          </p>

          {evaluation.issues.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                marginTop: "0.75rem",
                display: "grid",
                gap: "1px",
              }}
            >
              {evaluation.issues.map((issue, i) => (
                <li
                  key={i}
                  style={{
                    background: "var(--ink-raised)",
                    padding: "0.7rem 0.9rem",
                    borderInlineStart: `2px solid ${
                      issue.kind === "gap" ? "var(--signal)" : "var(--seal)"
                    }`,
                    fontSize: "var(--t-sm)",
                  }}
                >
                  <strong style={{ fontWeight: 600 }}>
                    {ISSUE_LABEL[issue.kind]}
                  </strong>{" "}
                  · {personName(issue.person)}
                  <br />
                  <span className="muted">{issue.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}

function TimeField({
  label,
  hh,
  mm,
  onHH,
  onMM,
}: {
  label: string;
  hh: string;
  mm: string;
  onHH: (v: string) => void;
  onMM: (v: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "0.3rem", fontSize: "var(--t-sm)" }}>
      <span>{label}</span>
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
        <input
          className="field mono"
          style={{ width: "3.5rem" }}
          value={hh}
          maxLength={2}
          onChange={(e) => onHH(e.target.value.replace(/\D/g, ""))}
        />
        <span>:</span>
        <input
          className="field mono"
          style={{ width: "3.5rem" }}
          value={mm}
          maxLength={2}
          onChange={(e) => onMM(e.target.value.replace(/\D/g, ""))}
        />
      </div>
    </div>
  );
}
