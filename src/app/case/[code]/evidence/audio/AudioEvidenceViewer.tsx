// ============================================================
// src/app/case/[code]/evidence/audio/AudioEvidenceViewer.tsx
// محطة الاستماع الجنائي المشتركة لكل القضايا: بطاقة بيانات الدليل
// + لوحة الاستماع (AudioStation). الاختيار لهون حسب kind='audio'
// فقط (classifyEvidence) — ولا كود قضية أو دليل. التفريغ النصي
// والعلامات تجي فقط عبر annotations من مصدر حقيقي (فاضية حالياً).
// ============================================================
'use client';

import { useCallback, useId, useState } from 'react';
import type { EvidenceItem } from '@/types/case';
import type { AudioAnnotations } from '../types';
import AudioMetadata from './AudioMetadata';
import AudioStation, { type AudioMeasurements } from './AudioStation';
import StationMessage from './StationMessage';
import styles from './AudioExamination.module.css';

export type AudioMediaState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; url: string; contentType: string };

export default function AudioEvidenceViewer({
  item,
  media,
  annotations,
  onRetry,
}: {
  item: EvidenceItem;
  media: AudioMediaState;
  annotations?: AudioAnnotations;
  onRetry: () => void;
}) {
  const metaId = useId();
  const [measured, setMeasured] = useState<AudioMeasurements>({ duration: 0, wave: null });
  const onMeasured = useCallback((m: AudioMeasurements) => {
    setMeasured((prev) => (prev.duration === m.duration && prev.wave === m.wave ? prev : m));
  }, []);

  return (
    <div className={styles.workstation}>
      <AudioMetadata id={metaId} item={item} duration={measured.duration} wave={measured.wave} />
      <div className={styles.stage}>
        <div className={styles.station}>
          {media.status === 'ready' ? (
            <AudioStation
              key={media.url}
              item={item}
              url={media.url}
              contentType={media.contentType}
              annotations={annotations}
              metaId={metaId}
              onRetry={onRetry}
              onMeasured={onMeasured}
            />
          ) : media.status === 'error' ? (
            <StationMessage error onRetry={onRetry}>
              تعذّر استرجاع التسجيل من الأرشيف.
            </StationMessage>
          ) : (
            <StationMessage>جاري استرجاع التسجيل من الأرشيف…</StationMessage>
          )}
        </div>
      </div>
    </div>
  );
}
