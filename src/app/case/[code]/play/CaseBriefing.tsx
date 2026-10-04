// ============================================================
// src/app/case/[code]/play/CaseBriefing.tsx
// الوصول: بلاغ الاختفاء — أول لحظة اجتماعية في التحقيق.
//
// الجميع يعرف الإطار العام (من كتالوج القضية: من المفقود، وأين غرفته).
// نص البلاغ الرسمي نفسه مادة يقرؤها صاحب تخصصها وحده (توزيع القضية،
// evidence_index.readable): القارئ يراه كاملاً ويُقال له إن زملاءه لا
// يرونه؛ غيره يرى أنه موجود وبيد من — "اطلب منه أن يقرأه عليك".
// ثم: فريقك وما يقدر عليه كل واحد (قدرة، لا محتوى) → ادخل الغرفة.
//
// مرة لكل لاعب لكل جلسة (تخزين محلي، مع بديل آمن)، ويُعاد فتحه من الخيوط.
// ============================================================
'use client';

import { useRef } from 'react';
import { useModalFocus } from './useModalFocus';
import { specLabel } from '@/types/database';
import type { EvidenceItem } from '@/types/case';
import { useCasePresentation } from '@/cases/CaseContext';
import { specsOf } from '@/lib/play/model';
import { IconLock } from '../investigation/icons';
import { usePlay } from './PlayContext';
import s from './briefing.module.css';

export const briefingKey = (sessionId: string, userId: string) => `ifada:briefing:${sessionId}:${userId}`;

export function briefingSeen(sessionId: string, userId: string): boolean {
  try {
    return window.localStorage.getItem(briefingKey(sessionId, userId)) === '1';
  } catch {
    return false;
  }
}

export function markBriefingSeen(sessionId: string, userId: string): void {
  try {
    window.localStorage.setItem(briefingKey(sessionId, userId), '1');
  } catch {
    // لا تخزين: يظهر البلاغ مرة أخرى عند الدخول القادم — مقبول.
  }
}

export default function CaseBriefing({
  caseTitle,
  evidence,
  onEnter,
}: {
  caseTitle: string;
  evidence: EvidenceItem[];
  onEnter: () => void;
}) {
  const play = usePlay();
  const { opening } = useCasePresentation();
  const enterRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  // حوار حقيقي: التركيز يبقى داخله (لا Escape — الدخول قرار اللاعب).
  useModalFocus(panelRef, true, undefined, enterRef);

  if (!play || !opening) return null;
  const brief = opening.briefing;
  const report = evidence.find((e) => e.code === brief.evidence);
  const readable = !!report?.readable && !!report.body;
  // من يقرأ البلاغ؟ أعضاء يحملون تخصص مالكه (التوزيع الفعلي).
  const ownerSpec = report?.owner_spec;
  const readers = ownerSpec
    ? play.members.filter((m) => m.userId !== play.myId && specsOf(m.userId, play.holders, m.specialization).includes(ownerSpec))
    : [];

  return (
    <div className={s.layer} role="dialog" aria-modal="true" aria-labelledby="briefing-title">
      <div className={s.dim} aria-hidden="true" />
      <article ref={panelRef} className={s.dispatch}>
        <p className={s.kicker}>
          <span className={s.kickerDot} aria-hidden="true" />
          {brief.kicker}
          {readable && report?.clock_label && <span className={s.clock}>{report.clock_label}</span>}
        </p>
        <h1 id="briefing-title" className={s.title}>
          {caseTitle}
        </h1>
        <p className={s.premise}>{brief.premise}</p>

        {report &&
          (readable ? (
            <section className={s.report} aria-label={report.title}>
              <p className={s.reportHead}>
                <IconLock size={13} /> بحوزتك — زملاؤك لا يرون هذا البلاغ
              </p>
              <p className={s.reportBody}>{report.body}</p>
              <p className={s.reportCue}>اقرأه عليهم. ما تقوله لهم الآن هو أول ما يعرفونه.</p>
            </section>
          ) : (
            <section className={s.report} data-redacted="true" aria-label={report.title}>
              <p className={s.reportHead}>
                <IconLock size={13} /> {report.title}
              </p>
              <div className={s.bars} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <p className={s.reportCue}>
                {readers.length > 0
                  ? `البلاغ الرسمي بحوزة ${readers.map((r) => r.displayName).join(' و')}. اطلب أن يُقرأ عليك.`
                  : 'البلاغ الرسمي بيد صاحب تخصصه في فريقك.'}
              </p>
            </section>
          ))}

        <section className={s.team} aria-labelledby="briefing-team">
          <h2 id="briefing-team" className={s.teamTitle}>
            فريق التحقيق
          </h2>
          <ul className={s.teamList}>
            {play.members.map((m) => {
              const specs = specsOf(m.userId, play.holders, m.specialization);
              const me = m.userId === play.myId;
              return (
                <li key={m.userId} className={s.member} data-me={me ? 'true' : 'false'}>
                  <span className={s.memberName}>{me ? 'أنت' : m.displayName}</span>
                  <span className={s.memberSpecs}>{specs.map(specLabel).join(' · ')}</span>
                  <ul className={s.caps}>
                    {specs.map((sp) => {
                      const cap = opening.capabilities[sp];
                      return cap ? <li key={sp}>{cap}</li> : null;
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </section>

        <p className={s.rule}>
          كلكم ترون الغرفة نفسها؛ التخصص يحدد ما تستطيع فعله بما تجده. وما تكتشفه يبقى لك وحدك حتى تقرّر مشاركته.
        </p>

        <button ref={enterRef} type="button" className={s.enter} onClick={onEnter}>
          {brief.enter}
          <span aria-hidden="true">←</span>
        </button>
      </article>
    </div>
  );
}
