// ============================================================
// src/app/case/[code]/evidence/video/useVideoSource.ts
// مصدر التشغيل، حسب حجم الملف (200MB ديسكتوب / 80MB أجهزة لمس):
//   ضمن الحد → جلب مرة وحدة + blob: محلي (الرابط الموقّت ما بيدخل
//              الـ DOM، والتقديم ما بيحتاج شبكة بعد انتهاء صلاحيته).
//   فوقه أو حجم مجهول → بث مباشر من الرابط الموقّت (تحميل ملف ضخم كامل
//              للذاكرة غير معقول). لو انقطع بعد انتهاء الصلاحية،
//              الأب يطلب رابط جديد ويكمّل من نفس الموضع.
// Content-Length من الـ headers الآمنة (CORS-safelisted). التشخيص
// بالكونسول بدون الرابط.
// ============================================================
'use client';

import { useEffect, useState } from 'react';

const MAX_BLOB_BYTES_DESKTOP = 200 * 1024 * 1024;
/** أجهزة اللمس (موبايل غالباً) ذاكرتها أقل — حد أصغر للتحميل الكامل. */
const MAX_BLOB_BYTES_TOUCH = 80 * 1024 * 1024;

function maxBlobBytes(): number {
  return window.matchMedia('(pointer: coarse)').matches ? MAX_BLOB_BYTES_TOUCH : MAX_BLOB_BYTES_DESKTOP;
}

export type VideoSourceState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; src: string; mode: 'blob' | 'stream' };

/** المكوّن اللي بيستخدمه لازم ينعمل له key={url}. */
export function useVideoSource(url: string, contentType: string): VideoSourceState {
  const [state, setState] = useState<VideoSourceState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;
    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch(url, {
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`VIDEO_FETCH_STATUS_${res.status}`);

        // حجم مجهول = بث (ما منحمّل ملف مجهول الحجم كامل للذاكرة).
        const length = Number(res.headers.get('content-length') ?? '0');
        if (!(length > 0) || length > maxBlobBytes()) {
          controller.abort();
          if (!cancelled) setState({ status: 'ready', src: url, mode: 'stream' });
          return;
        }

        const bytes = await res.arrayBuffer();
        if (cancelled) return;
        blobUrl = URL.createObjectURL(new Blob([bytes], { type: contentType }));
        setState({ status: 'ready', src: blobUrl, mode: 'blob' });
      } catch (err: unknown) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        console.error('[IFADA evidence] video load failed:', err instanceof Error ? err.message : 'unknown error');
        setState({ status: 'error' });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url, contentType]);

  return state;
}
