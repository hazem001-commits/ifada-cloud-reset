// ============================================================
// src/app/case/[code]/casefile/Spotlight.tsx
// "على طاولة الفحص" — المادة التالية اللي لسا ما فحصتها (أو آخر
// ما دخل الملف). لما يوصل اكتشاف جديد أثناء فتح الملف، بيحتل
// الطاولة بلحظة كشف هادئة: ضوء يمرّ على الأثر، وعنوان "اكتشاف جديد".
// ============================================================
'use client';

import type { CaseFileEntry } from './caseFileModel';
import { IDENTITY_LABEL } from './caseFileModel';
import ArtifactPlate from './ArtifactPlate';
import { EntryTags, PinAction } from './EntryMarks';
import s from './casefile.module.css';

export type SpotlightMode = 'live' | 'unopened' | 'latest';

const EYEBROW: Record<SpotlightMode, string> = {
  live: 'اكتشاف جديد',
  unopened: 'بانتظار فحصك',
  latest: 'آخر ما دخل الملف',
};

export default function Spotlight({
  sessionId,
  entry,
  mode,
  unopened,
  reviewed,
  pinned,
  busy,
  canShare,
  onOpen,
  onPin,
  onShare,
}: {
  sessionId: string;
  entry: CaseFileEntry;
  mode: SpotlightMode;
  unopened: boolean;
  reviewed: boolean;
  pinned: boolean;
  busy: boolean;
  canShare: boolean;
  onOpen: () => void;
  onPin: () => void;
  onShare: () => void;
}) {
  return (
    <section className={s.spotlight} data-mode={mode} aria-labelledby="cf-spotlight-title">
      <div className={s.spotPlate} data-identity={entry.identity}>
        <ArtifactPlate sessionId={sessionId} entry={entry} size="hero" />
      </div>

      <div className={s.spotInfo}>
        <p className={s.eyebrow}>{EYEBROW[mode]}</p>
        <h2 id="cf-spotlight-title" className={s.spotTitle}>
          {entry.title}
        </h2>
        <p className={s.spotKind}>
          {IDENTITY_LABEL[entry.identity]}
          {entry.clock && <span className="mono">{entry.clock}</span>}
        </p>

        {(entry.provenance ?? entry.origin) && (
          <p className={s.spotProv}>{entry.provenance ?? entry.origin}</p>
        )}

        <EntryTags entry={entry} unopened={unopened} reviewed={reviewed} pinned={pinned} />

        <div className={s.spotActions}>
          <button type="button" className={s.primary} onClick={onOpen}>
            فحص الدليل
            <span aria-hidden="true">←</span>
          </button>
          {!entry.channelPrivate && <PinAction pinned={pinned} busy={busy} onPin={onPin} />}
          {canShare && (
            <button type="button" className={s.secondary} disabled={busy} onClick={onShare}>
              شارك مع الفريق
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
