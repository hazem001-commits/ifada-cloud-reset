// ============================================================
// src/app/case/[code]/evidence/video/useFrameStepper.ts
// تنقّل إطار-بإطار مبني على الإطار الظاهر فعلاً (presentedTime من
// requestVideoFrameCallback) بدل افتراض معدّل إطارات:
//   السابق → نقطة قبل بداية الإطار الظاهر مباشرة = الإطار السابق بالضبط.
//   التالي → نقدّم بخطوات صغيرة، وبعد كل تقديم ننتظر المتصفح يبلّغ
//            أي إطار انعرض (Chrome بيستدعي الـ callback بعد كل seek حتى
//            لو نفس الإطار — تم التحقق). أول إطار أحدث = الإطار التالي.
//            الانتظار حقيقي (مع شبكة أمان 3 ث) مش مهلة قصيرة — على جهاز
//            بطيء المهلة القصيرة كانت تسبّب قفز فوق إطارات.
// خطوة الفحص: نصف الفاصل المقاس، أو 1/120 ث قبل القياس (آمن حتى
// 120 إطار/ث). بعد 20 محاولة فاضية تكبر تدريجياً لفجوات حقيقية كبيرة.
// بدون دعم requestVideoFrameCallback: خطوة زمنية معلنة فقط.
// ============================================================
'use client';

import { useCallback, useRef, type RefObject } from 'react';

const MAX_PROBES = 60;
const WIDEN_AFTER = 20;
const SAFETY_TIMEOUT_MS = 3000;
const UNMEASURED_PROBE_SECONDS = 1 / 120;

function nextPresented(el: HTMLVideoElement): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), SAFETY_TIMEOUT_MS);
    el.requestVideoFrameCallback((_n, meta) => {
      window.clearTimeout(timer);
      resolve(meta.mediaTime);
    });
  });
}

export function useFrameStepper(
  video: RefObject<HTMLVideoElement | null>,
  presentedTime: RefObject<number | null>,
  step: number,
  measured: boolean,
  duration: number,
  seek: (seconds: number) => void,
) {
  const stepping = useRef(false);

  return useCallback(
    (direction: 1 | -1) => {
      const el = video.current;
      if (!el || stepping.current) return;
      el.pause();
      const presented = presentedTime.current;

      if (presented === null || !('requestVideoFrameCallback' in el)) {
        seek(el.currentTime + direction * step);
        return;
      }

      if (direction === -1) {
        seek(presented - 0.001);
        return;
      }

      stepping.current = true;
      void (async () => {
        try {
          let t = presented;
          let increment = measured ? step / 2 : UNMEASURED_PROBE_SECONDS;
          for (let i = 0; i < MAX_PROBES; i += 1) {
            if (i >= WIDEN_AFTER) increment *= 1.25;
            t += increment;
            if (duration > 0 && t >= duration) {
              seek(duration);
              break;
            }
            const shown = nextPresented(el);
            seek(t);
            const mediaTime = await shown;
            if (mediaTime !== null && mediaTime > presented + 1e-4) break;
          }
        } finally {
          stepping.current = false;
        }
      })();
    },
    [video, presentedTime, step, measured, duration, seek],
  );
}
