// ============================================================
// src/app/case/[code]/evidence/video/videoTime.ts
// أدوات زمن الفيديو. المتصفحات ما بتكشف معدّل الإطارات الحقيقي
// للملف، فما منخترع رقم: الخطوة إما فاصل إطار مقاس فعلياً أثناء
// التشغيل (requestVideoFrameCallback)، أو خطوة زمنية ثابتة معلنة
// (1/30 ث) لحد ما يتوفّر قياس. ما في أرقام إطارات معروضة.
// ============================================================

/** خطوة احتياطية معلنة — مش ادعاء إن الملف 30 إطار/ث. */
export const FALLBACK_STEP_SECONDS = 1 / 30;

export function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const totalMs = Math.round(seconds * 1000);
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** وسيط فواصل mediaTime المتتالية (يتجاهل القفزات والتكرار). */
export function medianInterval(samples: number[]): number | null {
  const clean = samples.filter((d) => d > 0.004 && d < 0.25).sort((a, b) => a - b);
  if (clean.length < 8) return null;
  return clean[Math.floor(clean.length / 2)] ?? null;
}
