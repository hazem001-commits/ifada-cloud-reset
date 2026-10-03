// ============================================================
// src/app/case/[code]/evidence/video/VideoTransport.tsx
// لوحة التحكم: توقيت بالميلي ثانية، من البداية، إطار سابق/تالي،
// تشغيل/إيقاف، كتم ومستوى صوت، سرعات بطيئة للفحص، وتكبير الإطار.
// مصدر خطوة الإطار معلن بصراحة: "مقاسة" أو "ثابتة".
// ============================================================
'use client';

import type { ReactNode } from 'react';
import { formatVideoTime } from './videoTime';
import styles from './VideoExamination.module.css';

export const VIDEO_RATES = [0.25, 0.5, 1, 1.5] as const;

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

export default function VideoTransport({
  playing,
  current,
  duration,
  step,
  stepMeasured,
  muted,
  volume,
  rate,
  zoomPercent,
  canZoomIn,
  canZoomOut,
  zoomed,
  onToggle,
  onRestart,
  onStep,
  onToggleMute,
  onVolume,
  onRate,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  playing: boolean;
  current: number;
  duration: number;
  step: number;
  stepMeasured: boolean;
  muted: boolean;
  volume: number;
  rate: number;
  zoomPercent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  zoomed: boolean;
  onToggle: () => void;
  onRestart: () => void;
  onStep: (direction: 1 | -1) => void;
  onToggleMute: () => void;
  onVolume: (v: number) => void;
  onRate: (r: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  const silent = muted || volume === 0;
  const stepMs = (step * 1000).toFixed(1);

  return (
    <div className={styles.transport}>
      <div className={styles.readout} dir="ltr">
        <div className={styles.timecode} aria-hidden="true">
          <span className={styles.timeNow}>{formatVideoTime(current)}</span>
          <span className={styles.timeTotal}>/ {formatVideoTime(duration)}</span>
        </div>
        <div className={styles.stepInfo}>
          {stepMeasured
            ? `STEP ${stepMs} ms · ≈ ${(1 / step).toFixed(2)} fps (measured)`
            : `STEP ${stepMs} ms (fixed)`}
        </div>
      </div>

      <div className={styles.deck} dir="ltr" role="group" aria-label="التحكم بالتشغيل">
        <button type="button" className={styles.deckBtn} onClick={onRestart} aria-label="من البداية" title="من البداية">
          <Icon>
            <path d="M6 5v14" />
            <path d="M18 6l-8 6 8 6z" />
          </Icon>
        </button>
        <button
          type="button"
          className={`${styles.deckBtn} ${styles.stepBtn}`}
          onClick={() => onStep(-1)}
          aria-label="الإطار السابق"
          title="الإطار السابق ( , )"
        >
          <Icon size={16}>
            <path d="M7 6v12" />
            <path d="M17 7l-6 5 6 5" />
          </Icon>
          <span className={styles.stepLabel} aria-hidden="true">
            −1F
          </span>
        </button>
        <button
          type="button"
          className={`${styles.deckBtn} ${styles.playBtn}`}
          onClick={onToggle}
          aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
          aria-pressed={playing}
        >
          {playing ? (
            <Icon size={22}>
              <path d="M9 6v12M15 6v12" />
            </Icon>
          ) : (
            <Icon size={22}>
              <path d="M8 5.5v13l10.5-6.5z" />
            </Icon>
          )}
        </button>
        <button
          type="button"
          className={`${styles.deckBtn} ${styles.stepBtn}`}
          onClick={() => onStep(1)}
          aria-label="الإطار التالي"
          title="الإطار التالي ( . )"
        >
          <Icon size={16}>
            <path d="M17 6v12" />
            <path d="M7 7l6 5-6 5" />
          </Icon>
          <span className={styles.stepLabel} aria-hidden="true">
            +1F
          </span>
        </button>
      </div>

      <div className={styles.side}>
        <div className={styles.toolRow} dir="ltr" role="group" aria-label="فحص الإطار">
          <button type="button" className={styles.deckBtn} onClick={onZoomOut} disabled={!canZoomOut} aria-label="تصغير الإطار">
            <Icon>
              <circle cx="11" cy="11" r="6" />
              <path d="M8.5 11h5M20 20l-4.2-4.2" />
            </Icon>
          </button>
          <span className={styles.zoomReadout} aria-live="polite">
            {zoomPercent}%
          </span>
          <button type="button" className={styles.deckBtn} onClick={onZoomIn} disabled={!canZoomIn} aria-label="تكبير الإطار">
            <Icon>
              <circle cx="11" cy="11" r="6" />
              <path d="M8.5 11h5M11 8.5v5M20 20l-4.2-4.2" />
            </Icon>
          </button>
          <button type="button" className={styles.deckBtn} onClick={onFit} disabled={!zoomed} aria-label="ملاءمة الإطار">
            <Icon>
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </Icon>
          </button>
        </div>

        <div className={styles.toolRow} dir="ltr">
          <button
            type="button"
            className={styles.deckBtn}
            onClick={onToggleMute}
            aria-label={silent ? 'إلغاء الكتم' : 'كتم الصوت'}
            aria-pressed={muted}
          >
            <Icon>
              <path d="M4 10v4h4l5 4V6l-5 4z" />
              {silent ? <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7" />}
            </Icon>
          </button>
          <input
            type="range"
            className={styles.volumeRange}
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            aria-label="مستوى الصوت"
            aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`}
            style={{ '--fill': `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
          />
          <div className={styles.rates} role="group" aria-label="سرعة التشغيل">
            {VIDEO_RATES.map((r) => (
              <button
                key={r}
                type="button"
                className={styles.rateBtn}
                aria-pressed={rate === r}
                aria-label={`سرعة ${r}×`}
                onClick={() => onRate(r)}
              >
                {r}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
