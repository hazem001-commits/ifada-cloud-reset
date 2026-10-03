// ============================================================
// src/app/case/[code]/board/HypothesisSheet.tsx
// ورقة الفرضية — هامش تحليل ملتصق بالفرضية نفسها، لا محادثة.
// اللاعب وحده يقرر متى يُختبر، وأي فرضية، وما المادة المُسندة لها.
// النتيجة أداة تحقيق: ما يدعم · ما يناقض · افتراضات بلا سند · أسئلة
// مفتوحة · مشاكل زمنية — كل نقطة تشير لمصدر يملكه اللاعب. لا حكم.
// ============================================================
'use client';

import { useState } from 'react';
import type { StressTestResponse } from '@/lib/ai/stressTest';
import { toolClass } from '../ui/Surface';
import s from './board.module.css';

type Phase = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; response: StressTestResponse } | { kind: 'throttled' };

const GROUPS = [
  { key: 'supporting', title: 'ما يدعم الفرضية', tone: 'for', cited: true },
  { key: 'contradicting', title: 'ما يناقضها', tone: 'against', cited: true },
  { key: 'unsupportedAssumptions', title: 'افتراضات بلا سند', tone: 'neutral', cited: false },
  { key: 'missingEvidenceQuestions', title: 'أسئلة ما زالت مفتوحة', tone: 'neutral', cited: false },
  { key: 'timelineIssues', title: 'مشاكل زمنية', tone: 'against', cited: true },
] as const;

export default function HypothesisSheet({
  sessionId,
  hypothesis,
  attached,
  attachedCount,
  onClose,
  onCite,
}: {
  sessionId: string;
  hypothesis: string;
  /** معرّفات استشهاد المواد المُسندة (evidence:CODE / object:CODE). */
  attached: string[];
  attachedCount: number;
  onClose: () => void;
  onCite: (factId: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  async function run() {
    setPhase({ kind: 'running' });
    try {
      const res = await fetch('/api/hypothesis-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, hypothesis, attached }),
      });
      if (res.status === 429) return setPhase({ kind: 'throttled' });
      const body = (await res.json()) as StressTestResponse;
      setPhase({ kind: 'done', response: body });
    } catch {
      setPhase({ kind: 'done', response: { status: 'unavailable' } });
    }
  }

  const response = phase.kind === 'done' ? phase.response : null;

  return (
    <aside className={s.sheet} aria-label="ورقة تحليل الفرضية">
      <div className={s.sheetHead}>
        <span className={s.ledgerLabel}>فرضية الفريق</span>
        <p className={s.sheetHypothesis}>{hypothesis}</p>
        <p className={s.sheetNote}>
          {attachedCount > 0 ? `مواد أسندها الفريق: ${attachedCount}. ` : 'لم يُسند الفريق مواد لهذه الفرضية بعد. '}
          الاختبار يعتمد فقط على ما تعرفه أنت — ولا يحكم على صحة الفرضية.
        </p>
        <div className={s.segment}>
          <button type="button" className={toolClass} data-primary="true" onClick={() => void run()} disabled={phase.kind === 'running'}>
            {phase.kind === 'running' ? 'جارٍ الاختبار…' : response ? 'اختبرها مجدداً' : 'اختبر الفرضية'}
          </button>
          <button type="button" className={toolClass} onClick={onClose}>
            أغلق
          </button>
        </div>
      </div>

      <div className={s.analysis} aria-live="polite">
        {phase.kind === 'running' && <p className={s.sheetNote}>يُقابَل نص الفرضية بما تملكه من مواد…</p>}
        {phase.kind === 'throttled' && <p className={s.sheetNote}>اختبارات كثيرة متتالية — انتظر قليلاً ثم أعد المحاولة.</p>}
        {response?.status === 'insufficient' && <p className={s.sheetNote}>ما في معلومات كافية لاختبار هالفرضية بشكل مفيد.</p>}
        {(response?.status === 'unavailable' || response?.status === 'error') && (
          <p className={s.sheetNote}>تعذّر الاختبار الآن. لم يُعرض أي تحليل غير مؤكد.</p>
        )}
        {response?.status === 'ok' &&
          GROUPS.map((g) => {
            const list = response.result[g.key];
            if (list.length === 0) return null;
            return (
              <section key={g.key} className={s.analysisGroup} data-tone={g.tone}>
                <h3 className={s.analysisTitle}>{g.title}</h3>
                {list.map((entry, i) =>
                  typeof entry === 'string' ? (
                    <p key={i} className={s.analysisItem}>
                      {entry}
                    </p>
                  ) : (
                    <p key={i} className={s.analysisItem}>
                      {entry.note}
                      {g.cited && response.sources[entry.factId] && (
                        <button type="button" className={s.cite} onClick={() => onCite(entry.factId)}>
                          {response.sources[entry.factId]}
                        </button>
                      )}
                    </p>
                  ),
                )}
              </section>
            );
          })}
      </div>
    </aside>
  );
}
