// ============================================================
// src/app/case/[code]/casefile/ArtifactTile.tsx
// بطاقة أثر واحدة بالأرشيف. الزر الوحيد هو العنوان، ممدود ليغطي
// البطاقة كلها (نمط رابط ممدود) — دلالة صحيحة وقابلية وصول بالكيبورد.
// ============================================================
'use client';

import type { CaseFileEntry } from './caseFileModel';
import { IDENTITY_LABEL } from './caseFileModel';
import ArtifactPlate from './ArtifactPlate';
import { EntryTags } from './EntryMarks';
import s from './casefile.module.css';

export default function ArtifactTile({
  sessionId,
  entry,
  unopened,
  reviewed,
  pinned,
  onOpen,
}: {
  sessionId: string;
  entry: CaseFileEntry;
  unopened: boolean;
  reviewed: boolean;
  pinned: boolean;
  onOpen: () => void;
}) {
  return (
    <article className={s.tile} data-identity={entry.identity} data-unopened={unopened} data-artifact-host="">
      <ArtifactPlate sessionId={sessionId} entry={entry} size="tile" />
      <div className={s.caption}>
        <span className={s.kind}>
          {IDENTITY_LABEL[entry.identity]}
          {entry.clock && <span className={`${s.kindClock} mono`}>{entry.clock}</span>}
        </span>
        <h3 className={s.tileTitle}>
          <button type="button" className={s.tileOpen} onClick={onOpen}>
            {entry.title}
          </button>
        </h3>
        {(entry.provenance ?? entry.origin) && <p className={s.prov}>{entry.provenance ?? entry.origin}</p>}
        <EntryTags entry={entry} unopened={unopened} reviewed={reviewed} pinned={pinned} />
      </div>
    </article>
  );
}
