// ============================================================
// src/app/case/[code]/evidence/video/VideoEvidenceViewer.tsx
// محطة فحص الفيديو الجنائي المشتركة لكل القضايا: بطاقة بيانات +
// محطة التشغيل (VideoStation). الاختيار لهون حسب نوع الدليل/الوسائط
// (classifyEvidence) — بدون كود قضية أو دليل. يحتفظ بموضع الاستئناف
// لو احتاج البث رابط جديد بعد انتهاء صلاحية القديم.
// ============================================================
'use client';

import { useCallback, useId, useRef, useState } from 'react';
import type { EvidenceItem } from '@/types/case';
import VideoMetadata from './VideoMetadata';
import VideoStation, { type VideoMeasurements } from './VideoStation';
import styles from './VideoExamination.module.css';

const MAX_STREAM_RETRIES = 2;

export type VideoMediaState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; url: string; contentType: string };

export default function VideoEvidenceViewer({
  item,
  media,
  onRetry,
}: {
  item: EvidenceItem;
  media: VideoMediaState;
  onRetry: () => void;
}) {
  const metaId = useId();
  const [resumeAt, setResumeAt] = useState(0);
  const [measured, setMeasured] = useState<VideoMeasurements>({ duration: 0, frameSize: null });

  const onMeasured = useCallback((m: VideoMeasurements) => {
    setMeasured((prev) =>
      prev.duration === m.duration &&
      prev.frameSize?.width === m.frameSize?.width &&
      prev.frameSize?.height === m.frameSize?.height
        ? prev
        : m,
    );
  }, []);

  // حد أقصى لتجديد رابط البث تلقائياً — ما في حلقة طلبات لا نهائية.
  const streamRetries = useRef(0);
  const onStreamExpired = useCallback(
    (at: number) => {
      if (streamRetries.current >= MAX_STREAM_RETRIES) return false;
      streamRetries.current += 1;
      setResumeAt(at);
      onRetry();
      return true;
    },
    [onRetry],
  );
  const onPlaybackHealthy = useCallback(() => {
    streamRetries.current = 0;
  }, []);

  return (
    <div className={styles.workstation}>
      <VideoMetadata id={metaId} item={item} duration={measured.duration} frameSize={measured.frameSize} />
      <div className={styles.stage}>
        <div className={styles.station}>
          {media.status === 'ready' ? (
            <VideoStation
              key={media.url}
              item={item}
              url={media.url}
              contentType={media.contentType}
              resumeAt={resumeAt}
              metaId={metaId}
              onRetry={onRetry}
              onStreamExpired={onStreamExpired}
              onPlaybackHealthy={onPlaybackHealthy}
              onMeasured={onMeasured}
            />
          ) : media.status === 'error' ? (
            <div className={styles.stationMessage} role="alert">
              <p data-error>تعذّر استرجاع التسجيل المصوّر من الأرشيف.</p>
              <button type="button" className={styles.stateRetry} onClick={onRetry}>
                طلب الملف مرة ثانية
              </button>
            </div>
          ) : (
            <div className={styles.stationMessage} role="status" aria-live="polite">
              <span className={styles.stateScan} aria-hidden="true" />
              <p>جاري استرجاع التسجيل المصوّر من الأرشيف…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
