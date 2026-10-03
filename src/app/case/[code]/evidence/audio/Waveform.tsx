// ============================================================
// src/app/case/[code]/evidence/audio/Waveform.tsx
// موجة التسجيل الحقيقية + شريط التقديم. رسم canvas مرتين (الجزء
// المسموع/غير المسموع) مرة وحدة لكل حجم، والتقدّم عبر clip-path بدون
// إعادة رسم كل إطار. محور الزمن من اليسار لليمين دائماً (مثل أي
// محطة صوت) — والتوقيتات تحته بنفس الاتجاه.
// يعمل كـ slider حقيقي لقارئات الشاشة. العلامات (markers) تظهر
// فقط لو بيانات حقيقية زوّدتها.
// ============================================================
'use client';

import { useEffect, useRef, useState } from 'react';
import type { AudioMarker } from '../types';
import { formatTimecode, resamplePeaks } from './audioAnalysis';
import styles from './AudioExamination.module.css';

const BAR = 2;
const GAP = 1;
const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

/** تدريج حقيقي من مدة الملف المقاسة — ~10 علامات كحد أقصى. */
function computeTicks(duration: number): { step: number; ticks: number[] } {
  if (duration <= 0) return { step: 1, ticks: [] };
  const step = TICK_STEPS.find((s) => duration / s <= 10) ?? 600;
  const ticks: number[] = [];
  for (let t = step; t < duration - step * 0.4; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return { step, ticks };
}

function shortLabel(t: number, step: number): string {
  if (t >= 60) return formatTimecode(t, false);
  return `${t.toFixed(step < 1 ? 1 : 0)}s`;
}

function drawBars(canvas: HTMLCanvasElement, bars: Float32Array, color: string) {
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  const mid = h / 2;
  const maxHalf = mid - 2;
  for (let i = 0; i < bars.length; i += 1) {
    // صمت حقيقي = خط رفيع، مش عمود مُختلق.
    const half = Math.max(0.5, (bars[i] ?? 0) * maxHalf);
    ctx.fillRect(i * (BAR + GAP), mid - half, BAR, half * 2);
  }
}

export default function Waveform({
  peaks,
  duration,
  current,
  markers,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: {
  peaks: Float32Array | null;
  duration: number;
  current: number;
  markers: AudioMarker[];
  onSeek: (seconds: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const playedRef = useRef<HTMLCanvasElement>(null);
  const scrubbing = useRef(false);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !peaks) return;

    function draw() {
      const base = baseRef.current;
      const played = playedRef.current;
      if (!base || !played || !host) return;
      const bars = resamplePeaks(peaks as Float32Array, Math.floor(host.clientWidth / (BAR + GAP)));
      drawBars(base, bars, 'rgba(217, 212, 199, 0.3)');
      drawBars(played, bars, 'rgba(236, 231, 218, 0.92)');
    }

    const observer = new ResizeObserver(draw);
    observer.observe(host);
    draw();
    return () => observer.disconnect();
  }, [peaks]);

  const progress = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0;
  const { step, ticks } = computeTicks(duration);

  function timeAt(clientX: number): number {
    const r = hostRef.current?.getBoundingClientRect();
    if (!r || duration <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration;
  }

  return (
    <div className={styles.waveBlock} dir="ltr">
      <div
        ref={hostRef}
        className={styles.wave}
        role="slider"
        tabIndex={0}
        aria-label="موضع التشغيل على موجة التسجيل"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration * 10) / 10}
        aria-valuenow={Math.round(current * 10) / 10}
        aria-valuetext={`${formatTimecode(current)} من ${formatTimecode(duration)}`}
        aria-orientation="horizontal"
        data-empty={!peaks || undefined}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // بعض البيئات ترفض الالتقاط — التقديم نفسه ما لازم يتعطّل.
          }
          scrubbing.current = true;
          onScrubStart();
          onSeek(timeAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') setHover(timeAt(e.clientX));
          if (scrubbing.current) onSeek(timeAt(e.clientX));
        }}
        onPointerUp={() => {
          if (!scrubbing.current) return;
          scrubbing.current = false;
          onScrubEnd();
        }}
        onPointerCancel={() => {
          scrubbing.current = false;
          onScrubEnd();
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <span key={t} className={styles.tick} style={{ left: `${(t / duration) * 100}%` }} aria-hidden="true" />
        ))}

        {peaks ? (
          <div className={styles.waveLayer} aria-hidden="true">
            <canvas ref={baseRef} className={styles.waveCanvas} />
            <canvas
              ref={playedRef}
              className={styles.waveCanvas}
              style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}
            />
          </div>
        ) : (
          <div className={styles.waveFallback} aria-hidden="true">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        )}

        {duration > 0 &&
          markers.map((m, i) => (
            <span
              key={i}
              className={styles.marker}
              title={m.label}
              style={{
                left: `${(m.startSeconds / duration) * 100}%`,
                width: `max(2px, ${((m.endSeconds - m.startSeconds) / duration) * 100}%)`,
              }}
            />
          ))}

        <span className={styles.playhead} style={{ left: `${progress * 100}%` }} aria-hidden="true" />

        {hover !== null && duration > 0 && (
          <span className={styles.hoverLine} style={{ left: `${(hover / duration) * 100}%` }} aria-hidden="true">
            <span className={styles.hoverTime}>{formatTimecode(hover)}</span>
          </span>
        )}
      </div>

      <div className={styles.timeAxis} aria-hidden="true">
        <span className={styles.axisLabel} style={{ left: 0 }}>
          00:00.0
        </span>
        {ticks
          // لا تسميات قريبة من طرفي المحور حتى ما تتراكب مع البداية/النهاية.
          .filter((t) => t / duration > 0.1 && t / duration < 0.9)
          .map((t) => (
            <span key={t} className={`${styles.axisLabel} ${styles.axisMinor}`} style={{ left: `${(t / duration) * 100}%` }}>
              {shortLabel(t, step)}
            </span>
          ))}
        <span className={styles.axisLabel} style={{ left: '100%' }}>
          {formatTimecode(duration)}
        </span>
      </div>

      {!peaks && <p className={styles.waveNote}>تعذّر رسم الموجة من هذا التسجيل — الاستماع متاح.</p>}
    </div>
  );
}
