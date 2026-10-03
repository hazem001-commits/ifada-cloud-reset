// ============================================================
// src/app/case/[code]/investigation/ChallengeConsole.tsx
// أداة تحقيق حقيقية (أرشيف كاميرات، سجل دخول، بحث سجلات) — مش اختبار.
// التقييم كله بالسيرفر (run_challenge) — هون ما في أي معرفة بالحل.
// أنواع الإدخال: text، choice، time_window (مع مصدر اختياري كالكاميرا).
// المادة المستخرجة تُفتح بالعارض الآمن نفسه.
// ============================================================
'use client';

import { useState, type ReactElement } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  OUTCOME_TEXT,
  parseChallengeResult,
  translateChallengeError,
  type InvestigationChallenge,
} from '@/types/challenges';
import { WORKSTATION_TITLE } from './labels';
import AttemptHistory, { type LogLine } from './AttemptHistory';
import { IconCamera, IconDoor, IconFile, IconSearch } from './icons';
import t from './tools.module.css';

const TOOL_RUN_LABEL: Record<string, string> = {
  cctv_archive: 'ابحث بالأرشيف',
  access_log: 'استعلم بالسجل',
  records_search: 'ابحث',
};

const TOOL_SCAN_LABEL: Record<string, string> = {
  cctv_archive: 'جارٍ البحث في أرشيف الكاميرات…',
  access_log: 'جارٍ الاستعلام في سجل الدخول…',
  records_search: 'جارٍ البحث في السجلات…',
};

const TOOL_ICON: Record<string, () => ReactElement> = {
  cctv_archive: () => <IconCamera size={17} />,
  access_log: () => <IconDoor size={17} />,
  records_search: () => <IconFile size={17} />,
};

const defaultToolIcon = () => <IconSearch size={17} />;

export default function ChallengeConsole({
  sessionId,
  challenge,
  onSolved,
  onOpenEvidence,
}: {
  sessionId: string;
  challenge: InvestigationChallenge;
  onSolved: () => void;
  onOpenEvidence?: (code: string) => void;
}) {
  const [value, setValue] = useState('');
  const [option, setOption] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);

  const cfg = challenge.input_config;
  const kind = challenge.input_kind;
  const options = cfg.options ?? [];
  const supported = kind === 'text' || kind === 'choice' || kind === 'time_window';
  const needsOption = kind === 'choice' || (kind === 'time_window' && options.length > 0);
  const tool = cfg.tool ?? '';
  const toolIcon = (TOOL_ICON[tool] ?? defaultToolIcon)();

  const ready =
    kind === 'text'
      ? value.trim() !== ''
      : kind === 'choice'
        ? option !== null
        : from.trim() !== '' && to.trim() !== '' && (!needsOption || option !== null);

  function describeQuery(): string {
    const opt = options.find((o) => o.id === option)?.label;
    if (kind === 'text') return value.trim();
    if (kind === 'choice') return opt ?? '—';
    return `${opt ? `${opt} · ` : ''}${from.trim()} – ${to.trim()}`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    const input =
      kind === 'text' ? { value } : kind === 'choice' ? { choice: option } : { option, from, to };
    const shown = describeQuery();

    setBusy(true);
    const supabase = createClient();
    const args = { p_session: sessionId, p_challenge: challenge.code, p_input: input };
    let { data, error } = await supabase.rpc('run_challenge', args);
    // قبل تطبيق 025 بس: run_challenge مش موجودة → نرجع للدالة الأقدم.
    if (error && (error.code === 'PGRST202' || error.code === '42883')) {
      ({ data, error } = await supabase.rpc('attempt_challenge', args));
    }
    setBusy(false);

    const line: LogLine = error
      ? { id: Date.now(), query: shown, outcome: 'error', text: translateChallengeError(error.message), evidence: [] }
      : (() => {
          const r = parseChallengeResult(data);
          return { id: Date.now(), query: shown, outcome: r.outcome, text: OUTCOME_TEXT[r.outcome], evidence: r.evidence };
        })();

    setLog((prev) => [line, ...prev].slice(0, 30));
    if (line.outcome === 'complete') onSolved();
  }

  return (
    <section className={t.tool} data-tool={tool} data-spec={challenge.spec} aria-label={cfg.label ?? challenge.prompt}>
      <header className={t.toolHead}>
        <span className={t.toolIcon}>
          {toolIcon}
        </span>
        <div>
          <p className={t.toolKicker}>{WORKSTATION_TITLE[challenge.spec]}</p>
          <h4 className={t.toolTitle}>{cfg.label ?? 'أداة تحقيق'}</h4>
        </div>
      </header>

      <div className={t.toolBody}>
        <p className={t.toolPrompt}>{challenge.prompt}</p>

        {!supported ? (
          <p className={t.toolPrompt}>هذه الأداة غير متاحة بعد بهذه النسخة.</p>
        ) : (
          <form className={t.query} onSubmit={(e) => void submit(e)}>
            {needsOption && (
              <div className={t.sources} role="radiogroup" aria-label={tool === 'cctv_archive' ? 'الكاميرا' : 'الاختيار'}>
                {options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={option === o.id}
                    className={t.source}
                    onClick={() => setOption(o.id)}
                  >
                    {tool === 'cctv_archive' && <IconCamera size={15} />}
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            <div className={t.queryRow}>
              {kind === 'text' && (
                <input
                  className={t.input}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={cfg.placeholder}
                  aria-label={cfg.label ?? challenge.prompt}
                  maxLength={200}
                  autoComplete="off"
                  spellCheck={false}
                />
              )}

              {kind === 'time_window' && (
                <div className={t.range}>
                  <label className={t.rangeField}>
                    <span>من</span>
                    <input
                      className={`${t.input} ${t.inputTime}`}
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      placeholder="--:--"
                      inputMode="numeric"
                      maxLength={5}
                      dir="ltr"
                      aria-label="بداية النطاق الزمني"
                    />
                  </label>
                  <span className={t.rangeArrow} aria-hidden="true">
                    ←
                  </span>
                  <label className={t.rangeField}>
                    <span>إلى</span>
                    <input
                      className={`${t.input} ${t.inputTime}`}
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="--:--"
                      inputMode="numeric"
                      maxLength={5}
                      dir="ltr"
                      aria-label="نهاية النطاق الزمني"
                    />
                  </label>
                </div>
              )}

              {kind === 'choice' && <span />}

              <button type="submit" className={t.run} disabled={busy || !ready}>
                <IconSearch size={15} />
                {busy ? 'جارٍ البحث…' : TOOL_RUN_LABEL[tool] ?? 'نفّذ'}
              </button>
            </div>
          </form>
        )}

        {busy && (
          <div className={t.scanning} role="status">
            <span>{TOOL_SCAN_LABEL[tool] ?? 'جارٍ البحث…'}</span>
            <span className={t.scanLine} aria-hidden="true" />
          </div>
        )}

        {!busy && <AttemptHistory log={log} onOpenEvidence={onOpenEvidence} />}
      </div>
    </section>
  );
}
