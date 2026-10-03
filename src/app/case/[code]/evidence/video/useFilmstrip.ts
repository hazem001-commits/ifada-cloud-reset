// ============================================================
// src/app/case/[code]/evidence/video/useFilmstrip.ts
// شريط لقطات مصغّرة من إطارات الفيديو الحقيقية: عنصر <video> مخفي
// مكتوم على نفس مصدر blob المحلي، يقدّم لمواضع متساوية ويرسم كل
// إطار على canvas صغير. فقط لمصدر blob (بدون طلبات شبكة إضافية)؛
// البث المباشر = بدون شريط. أي فشل = بدون شريط، بدون كسر.
// ============================================================
'use client';

import { useEffect, useState } from 'react';

const THUMB_HEIGHT = 72;

function seekOnce(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
      resolve();
    };
    const fail = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
      reject(new Error('FILMSTRIP_SEEK_FAILED'));
    };
    video.addEventListener('seeked', done);
    video.addEventListener('error', fail);
    video.currentTime = time;
  });
}

export interface FilmFrame {
  time: number;
  src: string;
}

export function useFilmstrip(src: string | null, duration: number, count: number): FilmFrame[] {
  const [frames, setFrames] = useState<FilmFrame[]>([]);

  useEffect(() => {
    if (!src || !(duration > 0) || !Number.isFinite(duration) || count < 1) return;
    let cancelled = false;
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    video.src = src;

    void (async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener('loadeddata', () => resolve(), { once: true });
          video.addEventListener('error', () => reject(new Error('FILMSTRIP_LOAD_FAILED')), { once: true });
        });
        const width = Math.round((video.videoWidth / video.videoHeight) * THUMB_HEIGHT) || 128;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = THUMB_HEIGHT;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const out: FilmFrame[] = [];
        for (let i = 0; i < count; i += 1) {
          if (cancelled) return;
          const time = Math.min(duration - 0.001, ((i + 0.5) / count) * duration);
          await seekOnce(video, time);
          ctx.drawImage(video, 0, 0, width, THUMB_HEIGHT);
          out.push({ time, src: canvas.toDataURL('image/jpeg', 0.7) });
        }
        if (!cancelled) setFrames(out);
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('[IFADA evidence] filmstrip skipped:', err instanceof Error ? err.message : 'unknown error');
        }
      }
    })();

    return () => {
      cancelled = true;
      video.removeAttribute('src');
      video.load();
    };
  }, [src, duration, count]);

  return frames;
}
