// ============================================================
// src/app/case/[code]/Hearing.tsx
// جلسة الاستماع. تقديم النظرية النهائية، بأربعة أسئلة —
// كل واحد يُقيَّم لحاله: مُثبَتة / صحيحة-غير-مُثبَتة / غلط.
// ============================================================
'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { subscribeAuthenticated } from '@/lib/supabase/realtime';
import {
  OVERALL_LABEL,
  TIER_LABEL,
  type NarrativeBeat,
  type VerdictQuestion,
  type VerdictResult,
} from '@/types/verdict';

export default function Hearing({
  sessionId,
  caseClosed,
}: {
  sessionId: string;
  caseClosed: boolean;
}) {
  const [questions, setQuestions] = useState<VerdictQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<VerdictResult | null>(null);
  const [narrative, setNarrative] = useState<NarrativeBeat[]>([]);
  const [narrativeStep, setNarrativeStep] = useState(0);
  const [showNarrative, setShowNarrative] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQuestions = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc('verdict_questions', { p_session: sessionId });
    if (data) setQuestions(data as VerdictQuestion[]);
  }, [sessionId]);

  const loadExistingVerdict = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('session_verdict')
      .select('overall, results')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (data) {
      setResult({ overall: data.overall, results: data.results } as VerdictResult);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadQuestions();
    if (caseClosed) void loadExistingVerdict();
  }, [loadQuestions, loadExistingVerdict, caseClosed]);

  // أي عضو بالفريق يشوف النتيجة فوراً لما حدا غيره يرسل
  useEffect(() => {
    return subscribeAuthenticated(
      createClient(),
      `verdict:${sessionId}`,
      (channel) =>
        channel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'session_verdict',
            filter: `session_id=eq.${sessionId}`,
          },
          () => void loadExistingVerdict(),
        ),
      () => void loadExistingVerdict(),
    );
  }, [sessionId, loadExistingVerdict]);

  async function submit() {
    if (Object.keys(answers).length !== questions.length) {
      setError('لازم تجاوبوا على كل الأسئلة قبل الإرسال.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const payload = Object.entries(answers).map(([question_code, option_id]) => ({
      question_code,
      option_id,
    }));

    const { data, error: rpcError } = await supabase.rpc('submit_verdict', {
      p_session: sessionId,
      p_answers: payload,
    });

    setSubmitting(false);

    if (rpcError) {
      setError(
        rpcError.message.includes('ALREADY_CLOSED')
          ? 'الفريق قدّم النظرية أصلاً. هاي القضية مقفولة.'
          : 'ما قدرنا نرسل. جرّب مرة ثانية.',
      );
      return;
    }
    setResult(data as VerdictResult);
  }

  async function loadNarrative() {
    const supabase = createClient();
    const { data } = await supabase.rpc('case_narrative', { p_session: sessionId });
    if (data) {
      setNarrative(data as NarrativeBeat[]);
      setShowNarrative(true);
      setNarrativeStep(0);
    }
  }

  // ---------- شاشة إعادة البناء السينمائية ----------
  if (showNarrative) {
    const beat = narrative[narrativeStep];
    return (
      <main
        className="shell"
        style={{ maxWidth: '40rem', minHeight: '70vh', display: 'grid', alignContent: 'center' }}
      >
        {beat && (
          <div key={beat.sort_order} style={{ animation: 'ifada-fade 0.6s ease' }}>
            {beat.time_label && (
              <p className="mono" style={{ color: 'var(--signal)', fontSize: 'var(--t-sm)' }}>
                {beat.time_label}
              </p>
            )}
            <p style={{ fontSize: 'var(--t-lg)', lineHeight: 1.9, marginTop: '0.75rem' }}>
              {beat.body}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2.5rem' }}>
          {narrativeStep < narrative.length - 1 ? (
            <button className="btn" onClick={() => setNarrativeStep((s) => s + 1)}>
              التالي
            </button>
          ) : (
            <button className="btn" onClick={() => setShowNarrative(false)}>
              رجوع للنتيجة
            </button>
          )}
          <span className="muted mono" style={{ alignSelf: 'center', fontSize: 'var(--t-xs)' }}>
            {narrativeStep + 1}/{narrative.length}
          </span>
        </div>

        <style>{`@keyframes ifada-fade { from{opacity:0; transform:translateY(6px)} to{opacity:1; transform:translateY(0)} }`}</style>
      </main>
    );
  }

  // ---------- شاشة النتيجة ----------
  if (result) {
    const label = OVERALL_LABEL[result.overall];
    return (
      <main className="shell" style={{ maxWidth: '40rem' }}>
        <span className="stamp">CASE {result.overall === 'proven' ? 'CLOSED' : 'REVIEWED'}</span>
        <h2 style={{ fontSize: 'var(--t-xl)', marginTop: '0.75rem' }}>{label.title}</h2>
        <p className="muted" style={{ marginTop: '0.5rem' }}>{label.note}</p>

        <hr className="rule" />

        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '1px' }}>
          {result.results.map((r) => {
            const q = questions.find((qq) => qq.code === r.question_code);
            return (
              <li
                key={r.question_code}
                style={{
                  background: 'var(--ink-raised)',
                  padding: '0.85rem 1rem',
                  borderInlineStart: `2px solid ${
                    r.tier === 'proven'
                      ? 'var(--signal)'
                      : r.tier === 'true_but_unproven'
                        ? 'var(--paper-dim)'
                        : 'var(--seal)'
                  }`,
                }}
              >
                <p style={{ margin: 0, fontSize: 'var(--t-sm)' }}>{q?.prompt}</p>
                <strong style={{ fontSize: 'var(--t-sm)' }}>{TIER_LABEL[r.tier]}</strong>
              </li>
            );
          })}
        </ul>

        <hr className="rule" />

        <button className="btn" onClick={loadNarrative}>
          شاهدوا إعادة البناء الكاملة
        </button>
      </main>
    );
  }

  // ---------- شاشة الأسئلة ----------
  return (
    <main className="shell" style={{ maxWidth: '40rem' }}>
      <span className="stamp">FINAL HEARING</span>
      <h2 style={{ fontSize: 'var(--t-xl)', marginTop: '0.75rem' }}>قدّموا نظريتكم</h2>
      <p className="muted" style={{ marginTop: '0.5rem' }}>
        هذا القرار نهائي ولا يمكن التراجع عنه. تأكدوا إنكم متفقين كفريق قبل الإرسال.
      </p>

      <div style={{ display: 'grid', gap: '1.5rem', marginTop: '1.5rem' }}>
        {questions.map((q) => (
          <fieldset key={q.code} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ padding: 0, fontSize: 'var(--t-base)', marginBottom: '0.6rem' }}>
              {q.prompt}
            </legend>
            <div style={{ display: 'grid', gap: '0.4rem' }}>
              {q.options.map((opt) => (
                <label
                  key={opt.id}
                  style={{
                    display: 'flex',
                    gap: '0.6rem',
                    alignItems: 'start',
                    background:
                      answers[q.code] === opt.id ? 'var(--ink-raised)' : 'transparent',
                    border: '1px solid var(--ink-line)',
                    padding: '0.6rem 0.8rem',
                    fontSize: 'var(--t-sm)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name={q.code}
                    checked={answers[q.code] === opt.id}
                    onChange={() => setAnswers((a) => ({ ...a, [q.code]: opt.id }))}
                    style={{ marginTop: '0.2rem' }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {error && (
        <p className="notice" style={{ marginTop: '1rem' }}>
          {error}
        </p>
      )}

      <button className="btn" style={{ marginTop: '1.5rem' }} onClick={submit} disabled={submitting}>
        {submitting ? 'عم نرسل…' : 'أرسلوا النظرية النهائية'}
      </button>
    </main>
  );
}
