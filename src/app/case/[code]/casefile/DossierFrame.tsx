// ============================================================
// src/app/case/[code]/casefile/DossierFrame.tsx
// فحص مركّز لمادة نتجت عن عنصر تحقيقي (نص فقط — ما في وسائط
// حقيقية وراها بعد؛ راجع sql/021_..._PROPOSAL.sql). نفس غلاف
// EvidenceOverlay (فتح/إغلاق/تركيز/سحب)، والأثر نفسه معروض بشكل
// نوعه: بطاقة عيّنة، تقرير مخبري، شاشة طرفية، أو ورقة رسمية.
// ============================================================
'use client';

import EvidenceOverlay from '../evidence/EvidenceOverlay';
import type { CaseFileEntry } from './caseFileModel';
import { excerptLines, IDENTITY_LABEL } from './caseFileModel';
import { EntryTags, PinAction } from './EntryMarks';
import d from './dossier.module.css';
import s from './casefile.module.css';

function Artifact({ entry }: { entry: CaseFileEntry }) {
  const lines = excerptLines(entry.body, 40);

  switch (entry.identity) {
    case 'physical':
      return (
        <div className={d.tray}>
          <div className={d.specimen}>
            <span className={d.specimenHole} aria-hidden="true" />
            <span className={d.specimenKind}>{IDENTITY_LABEL.physical}</span>
            <h3 className={d.specimenTitle}>{entry.title}</h3>
            <div className={d.specimenBody}>
              {lines.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          </div>
          <div className={d.scale} aria-hidden="true" />
        </div>
      );

    case 'lab':
      return (
        <div className={d.labReport}>
          <div className={d.labHead}>
            <span className={d.labRing} aria-hidden="true" />
            <span>تقرير نتيجة مخبرية</span>
            {entry.processing && <span className={d.labPending}>التحليل جارٍ</span>}
          </div>
          <h3 className={d.labTitle}>{entry.title}</h3>
          <div className={d.labResultBox}>
            <span className={d.labResultLabel}>{entry.processing ? 'الحالة' : 'النتيجة'}</span>
            {lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        </div>
      );

    case 'digital':
      return (
        <div className={d.terminal}>
          <div className={d.termBar}>
            <span className={d.termDot} aria-hidden="true" />
            <span>{IDENTITY_LABEL.digital}</span>
            <span className={d.termTitle}>{entry.title}</span>
          </div>
          <ol className={d.termLines}>
            {lines.map((l, i) => (
              <li key={i}>
                <span className={d.lineNo}>{String(i + 1).padStart(2, '0')}</span>
                <span>{l}</span>
              </li>
            ))}
          </ol>
        </div>
      );

    default:
      return (
        <div className={`doc-paper ${entry.identity === 'record' ? 'doc-official' : ''} ${d.paper}`}>
          {entry.identity === 'record' && <div className={d.recordBand}>{IDENTITY_LABEL.record}</div>}
          <h3 className={d.paperTitle}>{entry.title}</h3>
          <div className={d.paperBody}>
            {lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        </div>
      );
  }
}

export default function DossierFrame({
  sessionId,
  entry,
  pinned,
  reviewed,
  busy,
  canShare,
  onShare,
  onPin,
  onClose,
}: {
  sessionId: string;
  entry: CaseFileEntry;
  pinned: boolean;
  reviewed: boolean;
  busy: boolean;
  canShare: boolean;
  onShare: () => void;
  onPin: () => void;
  onClose: () => void;
}) {
  return (
    <EvidenceOverlay
      sessionId={sessionId}
      code={entry.code}
      title={entry.title}
      eyebrow={IDENTITY_LABEL[entry.identity]}
      layout="workstation"
      onClose={onClose}
    >
      <div className={d.room} data-identity={entry.identity}>
        <div className={d.stage}>
          <Artifact entry={entry} />
        </div>

        <aside className={d.rail} aria-label="سياق المادة">
          <div className={d.railBlock}>
            <span className={d.railLabel}>النوع</span>
            <p className={d.railValue}>{IDENTITY_LABEL[entry.identity]}</p>
          </div>

          {entry.provenance && (
            <div className={d.railBlock}>
              <span className={d.railLabel}>كيف دخلت التحقيق</span>
              <p className={d.railValue}>{entry.provenance}</p>
            </div>
          )}

          <div className={d.railBlock}>
            <span className={d.railLabel}>الحالة</span>
            <EntryTags entry={entry} unopened={false} reviewed={reviewed} pinned={pinned} />
          </div>

          <div className={d.railActions}>
            {!entry.channelPrivate && <PinAction pinned={pinned} busy={busy} onPin={onPin} />}
            {canShare && (
              <button type="button" className={s.secondary} disabled={busy} onClick={onShare}>
                شارك مع الفريق
              </button>
            )}
          </div>

          {entry.channelPrivate && (
            <p className={d.railHint}>هذه المادة لك وحدك. لا تُثبَّت على اللوحة المشتركة — ساهم بها في ربط مشترك من لوحة التحقيق: يرى زملاؤك أنك ساهمت، لا ماذا.</p>
          )}
          {canShare && (
            <p className={d.railHint}>زملاؤك بيعرفوا إنك لاحظت إشي هون، بس ما بيشوفوا التفاصيل لحد ما تشاركها.</p>
          )}
        </aside>
      </div>
    </EvidenceOverlay>
  );
}
