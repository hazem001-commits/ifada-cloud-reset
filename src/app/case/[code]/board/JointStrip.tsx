// ============================================================
// src/app/case/[code]/board/JointStrip.tsx
// «ربط مشترك قيد البناء» — شريط هادئ تحت سجل الروابط، لا نافذة ولا قائمة
// متطلبات. كل مساهمة: عنوان المادة فقط إن كان مسموحاً لهذا اللاعب رؤيته،
// وإلا «مساهمة من زميل»؛ ومن ساهم باسمه البشري. لا تقدّم، لا عدّ لما
// ينقص، لا تخصصات. الاختبار زر صريح فقط.
// ============================================================
'use client';

import { forwardRef } from 'react';
import { toolClass } from '../ui/Surface';
import type { ViewerCatalog } from './boardModel';
import { canTestJoint, contributionLabel, isParticipant, type JointProposal, type JointRef } from './jointModel';
import s from './board.module.css';

interface Props {
  proposals: readonly JointProposal[];
  catalog: ViewerCatalog;
  myId: string;
  nameOf: (userId: string) => string | null;
  busy: boolean;
  onWithdraw: (proposal: JointProposal, ref: JointRef) => void;
  onClose: (proposal: JointProposal) => void;
  onTest: (proposal: JointProposal) => void;
}

const JointStrip = forwardRef<HTMLElement, Props>(function JointStrip({ proposals, catalog, myId, nameOf, busy, onWithdraw, onClose, onTest }, ref) {
  const open = proposals.filter((p) => p.status === 'open');
  if (open.length === 0) return null;
  return (
    <section ref={ref} className={s.joint} aria-label="ربط مشترك قيد البناء" tabIndex={-1} data-joint-strip="">
      <span className={s.ledgerLabel}>ربط مشترك قيد البناء</span>
      {open.map((p) => (
        <div key={p.id} className={s.jointRow}>
          <ul className={s.jointList} aria-label="مساهمات الفريق">
            {p.contributions.map((c, i) => {
              const label = contributionLabel(c, catalog, nameOf);
              return (
                <li key={`${c.contributor}:${c.ref ? `${c.ref.kind}:${c.ref.id}` : i}`} className={s.jointChip} data-mine={label.mine}>
                  <span className={s.jointTitle}>{label.primary}</span>
                  <span className={s.jointBy}>{label.by}</span>
                  {c.mine && c.ref && (
                    <button type="button" className={toolClass} disabled={busy} onClick={() => onWithdraw(p, c.ref!)}>
                      اسحب مساهمتي
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {isParticipant(p, myId) && (
            <div className={s.jointActions}>
              {canTestJoint(p, myId) && (
                <button type="button" className={toolClass} data-primary="true" disabled={busy} onClick={() => onTest(p)}>
                  اختبر الربط المشترك
                </button>
              )}
              <button type="button" className={toolClass} disabled={busy} onClick={() => onClose(p)}>
                أغلق الربط
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
});

export default JointStrip;
