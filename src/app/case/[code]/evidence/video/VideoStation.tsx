// ============================================================
// src/app/case/[code]/evidence/video/VideoStation.tsx
// قلب محطة الفحص: <video> بدون أدوات المتصفح وبدون تشغيل تلقائي،
// شاشة إطار قابلة للتكبير، خط زمن، تنقّل إطار بإطار، وكيبورد.
// ملفات بدون مدة بالـ header (Infinity) تُحلّ بالقفز للنهاية ثم
// الرجوع — حيلة متصفح معروفة. في وضع البث، انقطاع بعد انتهاء صلاحية
// الرابط يطلب رابط جديد ويكمّل من نفس الموضع.
// ============================================================
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EvidenceItem } from '@/types/case';
import { useImageZoomPan } from '../image/useImageZoomPan';
import { useElementSize } from './useElementSize';
import FrameScreen from './FrameScreen';
import VideoTimeline from './VideoTimeline';
import VideoTransport from './VideoTransport';
import { useFilmstrip } from './useFilmstrip';
import { useFrameInterval } from './useFrameInterval';
import { useFrameStepper } from './useFrameStepper';
import { useVideoKeyboard } from './useVideoKeyboard';
import { useVideoSource } from './useVideoSource';
import { FALLBACK_STEP_SECONDS, formatVideoTime } from './videoTime';
import styles from './VideoExamination.module.css';

export interface VideoMeasurements {
  duration: number;
  frameSize: { width: number; height: number } | null;
}

const ZOOM_STEP = 1.5;
const FILMSTRIP_FRAMES = 10;

export default function VideoStation({
  item,
  url,
  contentType,
  resumeAt,
  metaId,
  onRetry,
  onStreamExpired,
  onPlaybackHealthy,
  onMeasured,
}: {
  item: EvidenceItem;
  url: string;
  contentType: string;
  resumeAt: number;
  metaId: string;
  onRetry: () => void;
  /** يرجع false لو استُنفدت محاولات تجديد الرابط. */
  onStreamExpired: (atSeconds: number) => boolean;
  onPlaybackHealthy: () => void;
  onMeasured: (m: VideoMeasurements) => void;
}) {
  const source = useVideoSource(url, contentType);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fixingDuration = useRef(false);
  const resumeAfterScrub = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [failed, setFailed] = useState(false);

  const viewport = useElementSize<HTMLDivElement>();
  const zp = useImageZoomPan(viewport.size, natural);
  const { measured: measuredStep, presentedTime } = useFrameInterval(videoRef, source.status === 'ready');
  const step = measuredStep ?? FALLBACK_STEP_SECONDS;
  const ready = source.status === 'ready';
  const frames = useFilmstrip(ready && source.mode === 'blob' ? source.src : null, duration, FILMSTRIP_FRAMES);

  useEffect(() => {
    onMeasured({ duration, frameSize: natural });
  }, [duration, natural, onMeasured]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const el = videoRef.current;
      if (el) setCurrent(el.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const seek = useCallback(
    (seconds: number) => {
      const el = videoRef.current;
      if (!el || !(duration > 0)) return;
      const t = Math.min(duration, Math.max(0, seconds));
      el.currentTime = t;
      setCurrent(t);
    },
    [duration],
  );

  const toggle = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      if (el.ended || (duration > 0 && el.currentTime >= duration - 0.01)) el.currentTime = 0;
      void el.play().catch(() => setFailed(true));
    } else {
      el.pause();
    }
  }, [duration]);

  const frameStep = useFrameStepper(videoRef, presentedTime, step, measuredStep !== null, duration, seek);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    const next = !(el?.muted ?? muted);
    if (el) el.muted = next;
    setMuted(next);
  }, [muted]);

  const { zoomTo, fitToScreen } = zp;
  const skip = useCallback((delta: number) => seek((videoRef.current?.currentTime ?? 0) + delta), [seek]);
  const toStart = useCallback(() => seek(0), [seek]);
  const toEnd = useCallback(() => seek(duration), [seek, duration]);
  const zoomIn = useCallback(() => zoomTo((z) => z * ZOOM_STEP), [zoomTo]);
  const zoomOut = useCallback(() => zoomTo((z) => z / ZOOM_STEP), [zoomTo]);

  useVideoKeyboard(ready, {
    toggle,
    skip,
    frameStep,
    toStart,
    toEnd,
    toggleMute,
    zoomIn,
    zoomOut,
    fit: fitToScreen,
  });

  if (source.status === 'error' || failed) {
    return (
      <div className={styles.stationMessage} role="alert">
        <p data-error>تعذّر استرجاع التسجيل المصوّر من الأرشيف.</p>
        <button type="button" className={styles.stateRetry} onClick={onRetry}>
          طلب الملف مرة ثانية
        </button>
      </div>
    );
  }

  if (source.status === 'loading') {
    return (
      <div className={styles.stationMessage} role="status" aria-live="polite">
        <span className={styles.stateScan} aria-hidden="true" />
        <p>جاري استرجاع التسجيل المصوّر من الأرشيف…</p>
      </div>
    );
  }

  return (
    <div className={styles.console}>
      <div className={styles.consoleHead} dir="ltr">
        <span className={styles.led} data-live={playing || undefined} aria-hidden="true" />
        <span className={styles.consoleState}>{playing ? 'PLAYBACK' : 'PAUSED'}</span>
        <span className={styles.consoleCode}>{item.code}</span>
        <span className={styles.srOnly} aria-live="polite">
          {playing ? 'قيد التشغيل' : `متوقف عند ${formatVideoTime(current)}`}
        </span>
      </div>

      <FrameScreen
        viewportRef={viewport.nodeRef}
        viewportCallbackRef={viewport.ref}
        natural={natural}
        zp={zp}
        describedBy={metaId}
      >
        <video
          ref={videoRef}
          className={styles.video}
          src={source.src}
          preload={source.mode === 'blob' ? 'auto' : 'metadata'}
          playsInline
          disablePictureInPicture
          controlsList="nodownload noremoteplayback"
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            setNatural({ width: el.videoWidth, height: el.videoHeight });
            if (Number.isFinite(el.duration)) {
              setDuration(el.duration);
              if (resumeAt > 0) el.currentTime = Math.min(resumeAt, el.duration);
            } else {
              fixingDuration.current = true;
              el.currentTime = 1e101;
            }
          }}
          onDurationChange={(e) => {
            const el = e.currentTarget;
            if (fixingDuration.current && Number.isFinite(el.duration)) {
              fixingDuration.current = false;
              setDuration(el.duration);
              el.currentTime = Math.min(resumeAt, el.duration);
            }
          }}
          onPlay={() => setPlaying(true)}
          onPause={(e) => {
            setPlaying(false);
            setCurrent(e.currentTarget.currentTime);
          }}
          onEnded={(e) => {
            setPlaying(false);
            setCurrent(e.currentTarget.duration);
          }}
          onSeeked={(e) => {
            if (!fixingDuration.current) setCurrent(e.currentTarget.currentTime);
          }}
          onTimeUpdate={(e) => {
            if (!fixingDuration.current) setCurrent(e.currentTarget.currentTime);
          }}
          onPlaying={onPlaybackHealthy}
          onError={(e) => {
            const el = e.currentTarget;
            const code = el.error?.code;
            // فقط انقطاع شبكة (أو فشل بعد تحميل ناجح) = رابط منتهي محتمل.
            // ملف غير قابل للتشغيل ما بيعيد الطلب — خطأ داخل عالم اللعبة.
            const likelyExpired =
              code === MediaError.MEDIA_ERR_NETWORK ||
              (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED && duration > 0);
            if (source.mode === 'stream' && likelyExpired && onStreamExpired(el.currentTime)) return;
            setFailed(true);
          }}
        />
      </FrameScreen>

      <VideoTimeline
        duration={duration}
        current={current}
        frames={frames}
        onSeek={seek}
        onScrubStart={() => {
          const el = videoRef.current;
          resumeAfterScrub.current = !!el && !el.paused;
          el?.pause();
        }}
        onScrubEnd={() => {
          if (resumeAfterScrub.current) void videoRef.current?.play();
          resumeAfterScrub.current = false;
        }}
      />

      <VideoTransport
        playing={playing}
        current={current}
        duration={duration}
        step={step}
        stepMeasured={measuredStep !== null}
        muted={muted}
        volume={volume}
        rate={rate}
        zoomPercent={zp.ready ? Math.round(zp.scale * 100) : 100}
        canZoomIn={zp.zoom < zp.maxZoom - 0.001}
        canZoomOut={zp.zoom > 1.001}
        zoomed={zp.zoom > 1.001 || zp.offset.x !== 0 || zp.offset.y !== 0}
        onToggle={toggle}
        onRestart={toStart}
        onStep={frameStep}
        onToggleMute={toggleMute}
        onVolume={(v) => {
          const el = videoRef.current;
          setVolume(v);
          setMuted(v === 0);
          if (el) {
            el.volume = v;
            el.muted = v === 0;
          }
        }}
        onRate={(r) => {
          setRate(r);
          if (videoRef.current) videoRef.current.playbackRate = r;
        }}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={fitToScreen}
      />
    </div>
  );
}
