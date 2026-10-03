// ============================================================
// src/app/case/[code]/investigation/AttemptHistory.tsx
// عرض فقط: آخر نتيجة بارزة، والباقي مطوي ومجمّع. المحاولات
// المتطابقة المتتالية تُدمج (×n)، ورسائل التمهّل كلها سطر واحد —
// بدون حذف أي محاولة من السجل الفعلي (السجل نفسه ما تغيّر).
// ============================================================
'use client';

import type { ChallengeOutcome } from '@/types/challenges';
import { IconCheck } from './icons';
import t from './tools.module.css';

export interface LogLine {
  id: number;
  query: string;
  outcome: ChallengeOutcome | 'error';
  text: string;
  evidence: string[];
}

interface Group {
  key: string;
  line: LogLine;
  count: number;
  evidence: string[];
}

function groupOlder(lines: LogLine[]): Group[] {
  const groups: Group[] = [];
  for (const line of lines) {
    const key = line.outcome === 'throttled' ? 'throttled' : `${line.query}|${line.outcome}`;
    const existing =
      line.outcome === 'throttled'
        ? groups.find((g) => g.key === 'throttled')
        : groups.length > 0 && groups[groups.length - 1]?.key === key
          ? groups[groups.length - 1]
          : undefined;
    if (existing) {
      existing.count += 1;
      for (const code of line.evidence) if (!existing.evidence.includes(code)) existing.evidence.push(code);
    } else {
      groups.push({ key, line, count: 1, evidence: [...line.evidence] });
    }
  }
  return groups;
}

export default function AttemptHistory({
  log,
  onOpenEvidence,
}: {
  log: LogLine[];
  onOpenEvidence?: (code: string) => void;
}) {
  const [latest, ...older] = log;
  if (!latest) return null;

  // تكرار نفس النتيجة الأخيرة مباشرة (نفس الاستعلام/التمهّل) يُحسب ضمنها بدل صفّه بالسجل.
  let repeats = 0;
  for (const l of older) {
    const same = l.outcome === latest.outcome && (l.outcome === 'throttled' || l.query === latest.query);
    if (!same) break;
    repeats += 1;
  }
  const groups = groupOlder(older.slice(repeats));

  return (
    <div aria-live="polite">
      <div className={t.result} data-outcome={latest.outcome} key={latest.id}>
        <div className={t.resultHead}>
          <p className={t.resultText}>
            {latest.outcome === 'complete' && <IconCheck size={15} />} {latest.text}
            {repeats > 0 && <span className={t.historyCount}> ×{repeats + 1}</span>}
          </p>
        </div>
        {latest.outcome !== 'throttled' && <span className={t.resultQuery}>{latest.query}</span>}
        {onOpenEvidence &&
          latest.evidence.map((code) => (
            <button key={code} type="button" className={t.extract} onClick={() => onOpenEvidence(code)}>
              افحص المادة المستخرجة
            </button>
          ))}
        {/* run_challenge يرجّع فقط أكواد انفتحت فعلاً بهذه المحاولة → صارت بملف القضية. */}
        {latest.evidence.length > 0 && <p className={t.saved}>محفوظ في ملف القضية</p>}
      </div>

      {groups.length > 0 && (
        <details className={t.history} style={{ marginTop: 'var(--sp-3)' }}>
          <summary>المحاولات السابقة ({groups.reduce((n, g) => n + g.count, 0)})</summary>
          <ol className={t.historyList}>
            {groups.map((g) => (
              <li key={g.line.id} className={t.historyItem} data-outcome={g.line.outcome}>
                <span className={t.resultQuery}>{g.line.outcome === 'throttled' ? '—' : g.line.query}</span>
                <span>
                  {g.line.text}
                  {onOpenEvidence &&
                    g.evidence.map((code) => (
                      <button key={code} type="button" className={t.historyOpen} onClick={() => onOpenEvidence(code)}>
                        {' '}افحص
                      </button>
                    ))}
                </span>
                <span className={t.historyCount}>{g.count > 1 ? `×${g.count}` : ''}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
