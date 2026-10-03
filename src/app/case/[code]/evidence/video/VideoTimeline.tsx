// ============================================================
// src/app/case/[code]/evidence/video/VideoTimeline.tsx
// خط زمن التحقيق: slider حقيقي (ضغط/سحب/لمس)، شريط لقطات من
// الإطارات الحقيقية خلفه لو متوفّر، مؤشر تشغيل، ووقت تحت المؤشر
// على الديسكتوب. محور الزمن من اليسار لليمين (مثل محطة الصوت).
// ============================================================
'use client';

import { useRef, useState } from 'react';
import type { FilmFrame } from './useFilmstrip';
import { formatVideoTime } from './videoTime';
import styles from './VideoExamination.module.css';

export default function VideoTimeline({
  duration,
  current,
  frames,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: {
  duration: number;
  current: number;
  frames: FilmFrame[];
  onSeek: (seconds: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const valid = duration > 0 && Number.isFinite(duration);
  const progress = valid ? Math.min(1, Math.max(0, current / duration)) : 0;

  function timeAt(clientX: number): number {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || !valid) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration;
  }

  function endScrub() {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    onScrubEnd();
  }

  return (
    <div className={styles.timelineBlock} dir="ltr">
      <div
        ref={trackRef}
        className={styles.timeline}
        role="slider"
        tabIndex={0}
        aria-label="خط زمن التسجيل المصوّر"
        aria-valuemin={0}
        aria-valuemax={valid ? Math.round(duration * 1000) / 1000 : 0}
        aria-valuenow={Math.round(current * 1000) / 1000}
        aria-valuetext={`${formatVideoTime(current)} من ${formatVideoTime(valid ? duration : 0)}`}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // الالتقاط مش ضروري للتقديم نفسه.
          }
          scrubbing.current = true;
          onScrubStart();
          onSeek(timeAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') setHover(timeAt(e.clientX));
          if (scrubbing.current) onSeek(timeAt(e.clientX));
        }}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onPointerLeave={() => setHover(null)}
      >
        <div className={styles.filmstrip} aria-hidden="true">
          {frames.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f.time} src={f.src} alt="" className={styles.filmFrame} draggable={false} />
          ))}
        </div>
        <div className={styles.played} style={{ width: `${progress * 100}%` }} aria-hidden="true" />
        <span className={styles.playhead} style={{ left: `${progress * 100}%` }} aria-hidden="true" />
        {hover !== null && valid && (
          <span className={styles.hoverLine} style={{ left: `${(hover / duration) * 100}%` }} aria-hidden="true">
            <span className={styles.hoverTime}>{formatVideoTime(hover)}</span>
          </span>
        )}
      </div>
      <div className={styles.timeAxis} aria-hidden="true">
        <span>00:00.000</span>
        <span>{formatVideoTime(valid ? duration : 0)}</span>
      </div>
    </div>
  );
}
