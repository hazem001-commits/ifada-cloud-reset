// ============================================================
// src/app/case/[code]/evidence/audio/audioAnalysis.ts
// حساب الموجة من عيّنات الصوت الحقيقية المفكوكة — لا بيانات
// عشوائية ولا تزيينية. كل عمود = أعلى قيمة مطلقة (peak) للعيّنات
// بمقطعه الزمني، عبر كل القنوات. التطبيع (normalize) للعرض فقط.
// ============================================================

export interface DecodedAudioInfo {
  /** قمم مطبّعة بين 0 و 1، بترتيب زمني. */
  peaks: Float32Array;
  duration: number;
  channels: number;
}

/** دقة ثابتة عالية — تُعاد عيّنتها لعرض الشاشة وقت الرسم. */
const PEAK_RESOLUTION = 2048;

export function computePeaks(buffer: AudioBuffer, resolution = PEAK_RESOLUTION): Float32Array {
  const length = buffer.length;
  const buckets = Math.max(1, Math.min(resolution, length));
  const peaks = new Float32Array(buckets);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const size = length / buckets;

  let max = 0;
  for (let b = 0; b < buckets; b += 1) {
    const start = Math.floor(b * size);
    const end = Math.min(length, Math.floor((b + 1) * size));
    let peak = 0;
    for (const data of channels) {
      for (let i = start; i < end; i += 1) {
        const v = Math.abs(data[i] ?? 0);
        if (v > peak) peak = v;
      }
    }
    peaks[b] = peak;
    if (peak > max) max = peak;
  }

  if (max > 0) {
    for (let b = 0; b < buckets; b += 1) peaks[b] = (peaks[b] ?? 0) / max;
  }
  return peaks;
}

/** يجمع القمم لعدد أعمدة معيّن (أعلى قيمة ضمن كل مجموعة). */
export function resamplePeaks(peaks: Float32Array, bars: number): Float32Array {
  const out = new Float32Array(Math.max(1, bars));
  const size = peaks.length / out.length;
  for (let i = 0; i < out.length; i += 1) {
    const start = Math.floor(i * size);
    const end = Math.max(start + 1, Math.floor((i + 1) * size));
    let m = 0;
    for (let j = start; j < end && j < peaks.length; j += 1) {
      const v = peaks[j] ?? 0;
      if (v > m) m = v;
    }
    out[i] = m;
  }
  return out;
}

/**
 * يفك ترميز الصوت بدون جهاز إخراج (OfflineAudioContext) — ما بيحتاج
 * تفاعل مستخدم ولا بيفتح قناة صوت. الإخراج الفعلي عبر <audio>.
 */
export async function decodeAudio(bytes: ArrayBuffer): Promise<DecodedAudioInfo> {
  const Offline =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) throw new Error('OFFLINE_AUDIO_UNSUPPORTED');

  const ctx = new Offline(1, 1, 44100);
  // decodeAudioData بيستهلك الـ buffer — نمرّر نسخة حتى الأصل يضل صالح للـ Blob.
  const buffer = await ctx.decodeAudioData(bytes.slice(0));
  return {
    peaks: computePeaks(buffer),
    duration: buffer.duration,
    channels: buffer.numberOfChannels,
  };
}

export function formatTimecode(seconds: number, withTenths = true): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (!withTenths) return base;
  return `${base}.${Math.floor((seconds * 10) % 10)}`;
}
