// ============================================================
// src/app/case/[code]/evidence/audio/AudioTransport.tsx
// لوحة تحكّم التشغيل — كل زر حقيقي: تشغيل/إيقاف، رجوع/تقديم 5 ث،
// من البداية، كتم، مستوى الصوت، وسرعة الاستماع. التوقيت الدقيق
// (أعشار الثانية) من <audio> الفعلي. الأزرار بدون صوت واجهة إضافي
// حتى ما يختلط مع التسجيل نفسه.
// ============================================================
'use client';

import type { ReactNode } from 'react';
import { formatTimecode } from './audioAnalysis';
import styles from './AudioExamination.module.css';

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5] as const;
export const SKIP_SECONDS = 5;

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

export default function AudioTransport({
  playing,
  current,
  duration,
  muted,
  volume,
  rate,
  onToggle,
  onSkip,
  onRestart,
  onToggleMute,
  onVolume,
  onRate,
}: {
  playing: boolean;
  current: number;
  duration: number;
  muted: boolean;
  volume: number;
  rate: number;
  onToggle: () => void;
  onSkip: (delta: number) => void;
  onRestart: () => void;
  onToggleMute: () => void;
  onVolume: (v: number) => void;
  onRate: (r: number) => void;
}) {
  const silent = muted || volume === 0;

  return (
    <div className={styles.transport}>
      <div className={styles.timecode} dir="ltr" aria-hidden="true">
        <span className={styles.timeNow}>{formatTimecode(current)}</span>
        <span className={styles.timeSep}>/</span>
        <span className={styles.timeTotal}>{formatTimecode(duration)}</span>
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
          className={styles.deckBtn}
          onClick={() => onSkip(-SKIP_SECONDS)}
          aria-label={`رجوع ${SKIP_SECONDS} ثوانٍ`}
          title={`رجوع ${SKIP_SECONDS} ث`}
        >
          <Icon>
            <path d="M11 7l-5 5 5 5" />
            <path d="M18 7l-5 5 5 5" />
          </Icon>
        </button>
        <button
          type="button"
          className={`${styles.deckBtn} ${styles.playBtn}`}
          onClick={onToggle}
          aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
          aria-pressed={playing}
        >
          {playing ? (
            <Icon size={24}>
              <path d="M9 6v12M15 6v12" />
            </Icon>
          ) : (
            <Icon size={24}>
              <path d="M8 5.5v13l10.5-6.5z" />
            </Icon>
          )}
        </button>
        <button
          type="button"
          className={styles.deckBtn}
          onClick={() => onSkip(SKIP_SECONDS)}
          aria-label={`تقديم ${SKIP_SECONDS} ثوانٍ`}
          title={`تقديم ${SKIP_SECONDS} ث`}
        >
          <Icon>
            <path d="M6 7l5 5-5 5" />
            <path d="M13 7l5 5-5 5" />
          </Icon>
        </button>
      </div>

      <div className={styles.mixer}>
        <div className={styles.volume} dir="ltr">
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
        </div>

        <div className={styles.rates} dir="ltr" role="group" aria-label="سرعة الاستماع">
          {PLAYBACK_RATES.map((r) => (
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
  );
}
