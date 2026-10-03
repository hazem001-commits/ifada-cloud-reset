// ============================================================
// src/app/case/[code]/evidence/video/useFrameInterval.ts
// متابعة الإطارات المعروضة فعلياً عبر requestVideoFrameCallback:
//   • presentedTime: زمن (mediaTime) الإطار الظاهر على الشاشة الآن —
//     يتحدّث بعد التشغيل والتقديم، فالتنقّل إطار-بإطار ينطلق من
//     الإطار الحقيقي مش من الزمن المطلوب.
//   • measured: وسيط مدة الإطار (فرق mediaTime ÷ فرق presentedFrames)
//     أثناء التشغيل، بعد ≥8 عيّنات. بدون دعم/تشغيل = null والأب
//     يستخدم الخطوة الثابتة المعلنة — بدون ادعاء معدّل إطارات.
// ============================================================
'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { medianInterval } from './videoTime';

const MAX_SAMPLES = 90;

export function useFrameInterval(video: RefObject<HTMLVideoElement | null>, active: boolean) {
  const [measured, setMeasured] = useState<number | null>(null);
  const samples = useRef<number[]>([]);
  const presentedTime = useRef<number | null>(null);

  useEffect(() => {
    const el = video.current;
    if (!el || !active || !('requestVideoFrameCallback' in el)) return;

    let handle = 0;
    let last: { mediaTime: number; frames: number } | null = null;

    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      presentedTime.current = meta.mediaTime;
      // presentedFrames بيعدّ كل الإطارات المعروضة حتى لو فاتنا callback —
      // الفرق الزمني ÷ عدد الإطارات = متوسط مدة الإطار الحقيقية.
      const framesBetween = last ? meta.presentedFrames - last.frames : 0;
      if (!el.paused && last && framesBetween >= 1 && framesBetween <= 4) {
        samples.current.push((meta.mediaTime - last.mediaTime) / framesBetween);
        if (samples.current.length > MAX_SAMPLES) samples.current.shift();
        const m = medianInterval(samples.current);
        if (m !== null) setMeasured((prev) => (prev !== null && Math.abs(prev - m) < 1e-4 ? prev : m));
      }
      last = { mediaTime: meta.mediaTime, frames: meta.presentedFrames };
      handle = el.requestVideoFrameCallback(onFrame);
    };

    handle = el.requestVideoFrameCallback(onFrame);
    return () => el.cancelVideoFrameCallback(handle);
  }, [video, active]);

  return { measured, presentedTime };
}
