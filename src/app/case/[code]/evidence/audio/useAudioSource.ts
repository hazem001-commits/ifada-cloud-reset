// ============================================================
// src/app/case/[code]/evidence/audio/useAudioSource.ts
// يجلب بايتات التسجيل مرة واحدة من الرابط الموقّت، ويجهّز منها:
//   1) رابط blob: محلي للتشغيل — الرابط الموقّت ما بيدخل الـ DOM،
//      والتقديم/الرجوع ما بيحتاج طلبات جديدة بعد انتهاء صلاحيته.
//   2) الموجة من العيّنات الحقيقية المفكوكة.
// فشل رسم الموجة ما بيمنع الاستماع (يضل التشغيل متاح).
// التشخيص بالكونسول بدون الرابط.
// ============================================================
'use client';

import { useEffect, useState } from 'react';
import { decodeAudio, type DecodedAudioInfo } from './audioAnalysis';

/** فوق هالحجم ما منرسم الموجة (فك ترميز PCM كامل بالذاكرة). */
const MAX_WAVEFORM_BYTES = 50 * 1024 * 1024;

export type AudioSourceState =
  | { status: 'loading'; phase: 'fetching' | 'decoding' }
  | { status: 'error' }
  | { status: 'ready'; src: string; wave: DecodedAudioInfo | null };

/** المكوّن اللي بيستخدمه لازم ينعمل له key={url}. */
export function useAudioSource(url: string, contentType: string): AudioSourceState {
  const [state, setState] = useState<AudioSourceState>({ status: 'loading', phase: 'fetching' });

  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;

    void (async () => {
      try {
        const res = await fetch(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!res.ok) throw new Error(`AUDIO_FETCH_STATUS_${res.status}`);
        const bytes = await res.arrayBuffer();
        if (cancelled) return;

        blobUrl = URL.createObjectURL(new Blob([bytes], { type: contentType }));
        setState({ status: 'loading', phase: 'decoding' });

        let wave: DecodedAudioInfo | null = null;
        try {
          // تسجيل ضخم جداً: فك ترميزه كامل بالذاكرة مكلف (خصوصاً موبايل) —
          // نتخطى الموجة ونخلي الاستماع متاح.
          if (bytes.byteLength > MAX_WAVEFORM_BYTES) throw new Error('WAVEFORM_SKIPPED_LARGE_FILE');
          wave = await decodeAudio(bytes);
        } catch (err: unknown) {
          console.error(
            '[IFADA evidence] waveform decode failed:',
            err instanceof Error ? err.message : 'unknown error',
          );
        }
        if (cancelled) return;
        setState({ status: 'ready', src: blobUrl, wave });
      } catch (err: unknown) {
        if (cancelled) return;
        console.error(
          '[IFADA evidence] audio load failed:',
          err instanceof Error ? err.message : 'unknown error',
        );
        setState({ status: 'error' });
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url, contentType]);

  return state;
}
