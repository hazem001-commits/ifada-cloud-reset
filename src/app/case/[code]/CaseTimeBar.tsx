// ============================================================
// src/app/case/[code]/CaseTimeBar.tsx
// شريط وقت القضية: الساعة الحية + الفرص المؤقتة. عرض فقط.
//
// "فرصة مؤقتة" = بالضبط ما ترجعه expiring_evidence: مادة ضمن
// تخصصاتي، لها expires_ck، ولم تُفتح بعد بالجلسة. بعد وقت الإغلاق
// unlock_evidence يرفضها (EVIDENCE_EXPIRED) وتختفي من الخطوط المتاحة.
// المادة المفتوحة فعلاً لا تظهر هنا أبداً — ولا يُلمَّح أنها ستختفي.
// لا سبب سردي يُعرض: القضية لا تحدد بعد لماذا تُغلق هذه الفرصة.
// ============================================================
'use client';

import { minutesToClock } from '@/types/investigation';
import t from './caseTimeBar.module.css';

export interface ExpiringItem {
  code: string;
  title: string;
  expires_ck: number;
  minutes_left: number;
}

/** كم دقيقة بعد الإغلاق يبقى إشعار "انقضت الفرصة" ظاهراً. */
const CLOSED_NOTICE_MINUTES = 10;
const MAX_SHOWN = 2;

function urgency(minutesLeft: number): 'calm' | 'soon' | 'critical' | 'closed' {
  if (minutesLeft <= 0) return 'closed';
  if (minutesLeft <= 3) return 'critical';
  if (minutesLeft <= 10) return 'soon';
  return 'calm';
}

export default function CaseTimeBar({ nowCk, expiring }: { nowCk: number; expiring: ExpiringItem[] }) {
  // الفرص المفتوحة + إشعار قصير بعد الإغلاق مباشرة (الخادم يُبقيها بالقائمة).
  const visible = expiring.filter((e) => e.minutes_left > -CLOSED_NOTICE_MINUTES);
  const shown = visible.slice(0, MAX_SHOWN);
  const more = visible.length - shown.length;

  return (
    <div className={t.bar}>
      <p className={t.clock}>
        <ClockGlyph />
        وقت القضية
        <span className={t.time}>{minutesToClock(Math.floor(nowCk))}</span>
      </p>

      {shown.length > 0 && (
        <ul className={t.opportunities} aria-label="فرص مؤقتة">
          {shown.map((e) => {
            const level = urgency(e.minutes_left);
            const left = Math.max(1, Math.ceil(e.minutes_left));
            const closesAt = minutesToClock(e.expires_ck);
            return (
              <li
                key={e.code}
                className={t.opportunity}
                data-urgency={level}
                title={
                  level === 'closed'
                    ? 'لم تُفتح قبل وقت الإغلاق، ولم تعد متاحة للفتح.'
                    : 'لم تُفتح بعد. بعد وقت الإغلاق لن تعود متاحة للفتح.'
                }
              >
                <span className={t.kind}>{level === 'closed' ? 'انقضت الفرصة' : 'فرصة مؤقتة'}</span>
                <span className={t.title}>{e.title}</span>
                <span className={t.remaining}>
                  {level === 'closed' ? (
                    <>
                      أُغلقت <bdi className={t.num}>{closesAt}</bdi>
                    </>
                  ) : (
                    <>
                      يتبقّى <bdi className={t.num}>{left}</bdi> د · حتى <bdi className={t.num}>{closesAt}</bdi>
                    </>
                  )}
                </span>
              </li>
            );
          })}
          {more > 0 && <li className={t.more}>+{more}</li>}
        </ul>
      )}
    </div>
  );
}

function ClockGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" />
    </svg>
  );
}
