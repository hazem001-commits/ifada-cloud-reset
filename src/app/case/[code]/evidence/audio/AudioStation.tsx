// ============================================================
// src/app/case/[code]/evidence/audio/AudioStation.tsx
// قلب محطة الاستماع: <audio> مخفي (بدون أدوات المتصفح، بدون تشغيل
// تلقائي) مربوط بالموجة ولوحة التحكم والكيبورد. يبلّغ الأب بالمدة
// والخصائص المقاسة فعلياً لعرضها ببطاقة البيانات.
// ============================================================
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EvidenceItem } from '@/types/case';
import type { AudioAnnotations } from '../types';
import AudioTransport, { SKIP_SECONDS } from './AudioTransport';
import StationMessage from './StationMessage';
import TranscriptPanel from './TranscriptPanel';
import { authoredContextFor } from '../authoredContext';
import Waveform from './Waveform';
import { useAudioSource } from './useAudioSource';
import { formatTimecode, type DecodedAudioInfo } from './audioAnalysis';
import styles from './AudioExamination.module.css';

export interface AudioMeasurements {
  duration: number;
  wave: DecodedAudioInfo | null;
}

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export default function AudioStation({
  item,
  url,
  contentType,
  annotations,
  metaId,
  onRetry,
  onMeasured,
}: {
  item: EvidenceItem;
  url: string;
  contentType: string;
  annotations?: AudioAnnotations;
  metaId: string;
  onRetry: () => void;
  onMeasured: (m: AudioMeasurements) => void;
}) {
  const source = useAudioSource(url, contentType);
  const audioRef = useRef<HTMLAudioElement>(null);
  const resumeAfterScrub = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [playbackFailed, setPlaybackFailed] = useState(false);

  const wave = source.status === 'ready' ? source.wave : null;
  const duration = mediaDuration || wave?.duration || 0;
  const ready = source.status === 'ready';

  useEffect(() => {
    onMeasured({ duration, wave });
  }, [duration, wave, onMeasured]);

  // موضع سلس للمؤشر أثناء التشغيل (timeupdate لحاله ~4 مرات/ث).
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const el = audioRef.current;
      if (el) setCurrent(el.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const seek = useCallback(
    (seconds: number) => {
      const el = audioRef.current;
      if (!el || duration <= 0) return;
      const t = Math.min(duration, Math.max(0, seconds));
      el.currentTime = t;
      setCurrent(t);
    },
    [duration],
  );

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      if (el.ended || (duration > 0 && el.currentTime >= duration - 0.05)) el.currentTime = 0;
      void el.play().catch(() => setPlaybackFailed(true));
    } else {
      el.pause();
    }
  }, [duration]);

  const restart = useCallback(() => seek(0), [seek]);
  const skip = useCallback((delta: number) => seek((audioRef.current?.currentTime ?? 0) + delta), [seek]);

  const toggleMute = useCallback(() => {
    const el = audioRef.current;
    const next = !(el?.muted ?? muted);
    if (el) el.muted = next;
    setMuted(next);
  }, [muted]);

  function changeVolume(v: number) {
    const el = audioRef.current;
    setVolume(v);
    setMuted(v === 0);
    if (!el) return;
    el.volume = v;
    el.muted = v === 0;
  }

  function changeRate(r: number) {
    setRate(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
  }

  useEffect(() => {
    if (!ready) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTextEntry(e.target)) return;
      const onButton = e.target instanceof HTMLButtonElement;
      // محور الزمن من اليسار لليمين: السهم الأيمن = تقديم.
      const actions: Record<string, () => void> = {
        ArrowRight: () => skip(SKIP_SECONDS),
        ArrowLeft: () => skip(-SKIP_SECONDS),
        Home: restart,
        End: () => seek(duration),
        m: toggleMute,
        M: toggleMute,
      };
      // المسافة على زر مركّز = نقرة الزر نفسه؛ غير هيك = تشغيل/إيقاف.
      if (!onButton) {
        actions[' '] = toggle;
        actions.k = toggle;
        actions.K = toggle;
      }
      const action = actions[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ready, skip, restart, seek, toggle, toggleMute, duration]);

  if (source.status === 'error' || playbackFailed) {
    return (
      <StationMessage error onRetry={onRetry}>
        تعذّر استرجاع التسجيل من الأرشيف.
      </StationMessage>
    );
  }

  if (source.status === 'loading') {
    return (
      <StationMessage>
        {source.phase === 'fetching' ? 'جاري استرجاع التسجيل من الأرشيف…' : 'جاري رسم الموجة من التسجيل…'}
      </StationMessage>
    );
  }

  return (
    <>
      <audio
        ref={audioRef}
        src={source.src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={(e) => {
          setPlaying(false);
          setCurrent(e.currentTarget.currentTime);
        }}
        onEnded={(e) => {
          setPlaying(false);
          setCurrent(e.currentTarget.duration);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setMediaDuration(d);
        }}
        onSeeked={(e) => setCurrent(e.currentTarget.currentTime)}
        // احتياط: requestAnimationFrame بيتباطأ لما النافذة بالخلفية — timeupdate ما بيتوقف.
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onError={() => setPlaybackFailed(true)}
      />

      <div className={styles.console} aria-describedby={metaId}>
        <div className={styles.consoleHead} dir="ltr">
          <span className={styles.led} data-live={playing || undefined} aria-hidden="true" />
          <span className={styles.consoleState}>{playing ? 'PLAYBACK' : 'PAUSED'}</span>
          <span className={styles.consoleCode}>{item.code}</span>
          <span className={styles.srOnly} aria-live="polite">
            {playing ? 'قيد التشغيل' : `متوقف عند ${formatTimecode(current, false)}`}
          </span>
        </div>

        <Waveform
          peaks={wave?.peaks ?? null}
          duration={duration}
          current={current}
          markers={annotations?.markers ?? []}
          onSeek={seek}
          onScrubStart={() => {
            const el = audioRef.current;
            resumeAfterScrub.current = !!el && !el.paused;
            el?.pause();
          }}
          onScrubEnd={() => {
            if (resumeAfterScrub.current) void audioRef.current?.play();
            resumeAfterScrub.current = false;
          }}
        />

        <AudioTransport
          playing={playing}
          current={current}
          duration={duration}
          muted={muted}
          volume={volume}
          rate={rate}
          onToggle={toggle}
          onSkip={skip}
          onRestart={restart}
          onToggleMute={toggleMute}
          onVolume={changeVolume}
          onRate={changeRate}
        />
      </div>

      <TranscriptPanel
        segments={annotations?.transcript ?? []}
        current={current}
        onSeek={seek}
        hasAuthoredContext={authoredContextFor(item) !== null}
      />
    </>
  );
}
