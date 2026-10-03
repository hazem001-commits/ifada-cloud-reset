// ============================================================
// src/app/case/[code]/casefile/EvidenceFocus.tsx
// نقطة دخول واحدة لفحص أي مادة مكتشفة. دليل حقيقي → نفس
// EvidenceExaminationRoom (العارضات الخمسة بدون أي تعديل). مادة من
// عنصر تحقيقي → DossierFrame. التمييز بين النظامين محفوظ بالكود.
// ============================================================
'use client';

import EvidenceExaminationRoom from '../evidence/EvidenceExaminationRoom';
import DossierFrame from './DossierFrame';
import type { CaseFileEntry } from './caseFileModel';

export default function EvidenceFocus({
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
  if (entry.source.kind === 'evidence') {
    return <EvidenceExaminationRoom sessionId={sessionId} item={entry.source.item} onClose={onClose} />;
  }

  return (
    <DossierFrame
      sessionId={sessionId}
      entry={entry}
      pinned={pinned}
      reviewed={reviewed}
      busy={busy}
      canShare={canShare}
      onShare={onShare}
      onPin={onPin}
      onClose={onClose}
    />
  );
}
