// ============================================================
// src/app/case/[code]/evidence/audio/TranscriptPanel.tsx
// التفريغ النصي: يُعرض فقط لو بيانات حقيقية مرفقة بالدليل. ما في
// تحويل صوت لنص ولا تعرّف على متحدّثين. بدون بيانات = ملاحظة صادقة.
// نص الدليل المكتوب ليس تفريغاً زمنياً — لا يُحوَّل لمقاطع هنا؛ فقط
// الملاحظة الفارغة تدلّ عليه حين يوجد (تفاصيل الدليل).
// ============================================================
'use client';

import { useId } from 'react';
import type { TranscriptSegment } from '../types';
import { formatTimecode } from './audioAnalysis';
import { transcriptEmptyMessage } from '../authoredContext';
import styles from './AudioExamination.module.css';

export default function TranscriptPanel({
  segments,
  current,
  onSeek,
  hasAuthoredContext = false,
}: {
  segments: TranscriptSegment[];
  current: number;
  onSeek: (seconds: number) => void;
  /** للدليل نص مكتوب متاح بـ"تفاصيل الدليل". */
  hasAuthoredContext?: boolean;
}) {
  const titleId = useId();
  const active = segments.findIndex((s) => current >= s.startSeconds && current < s.endSeconds);

  return (
    <section className={styles.transcript} aria-labelledby={titleId}>
      <h4 id={titleId} className={styles.transcriptTitle}>
        التفريغ النصي
      </h4>
      {segments.length > 0 ? (
        <ol className={styles.transcriptList}>
          {segments.map((seg, i) => (
            <li key={i}>
              <button
                type="button"
                className={styles.segment}
                data-active={i === active || undefined}
                aria-current={i === active || undefined}
                onClick={() => onSeek(seg.startSeconds)}
              >
                <span className={styles.segmentTime} dir="ltr">
                  {formatTimecode(seg.startSeconds, false)}
                </span>
                <span>{seg.text}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.transcriptEmpty}>{transcriptEmptyMessage(hasAuthoredContext)}</p>
      )}
    </section>
  );
}
