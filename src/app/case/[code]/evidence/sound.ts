// ============================================================
// src/app/case/[code]/evidence/sound.ts
// أصوات تفاعل خفيفة، مولّدة عبر Web Audio API — لا ملفات صوتية
// خارجية مطلوبة. تحترم تفضيل الكتم المحفوظ محلياً، ولا تشغّل
// شيء تلقائياً بصوت عالٍ. لا علاقة لها بتشغيل وسائط الدليل نفسها.
// ============================================================

'use client';

const MUTE_KEY = 'ifada:sound-muted';

export function isSoundMuted(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // لا تخزين متاح — تجاهل، الكتم يرجع للافتراضي بالجلسة القادمة.
  }
}

type Blip = 'open' | 'close' | 'stamp' | 'click';

let sharedCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  return sharedCtx;
}

const BLIP_FREQ: Record<Blip, number> = {
  open: 320,
  close: 220,
  stamp: 140,
  click: 480,
};

/** نغمة قصيرة جداً (~80ms) بدون أي أصوات دليل حقيقية — فقط تغذية راجعة للواجهة. */
export function playBlip(kind: Blip): void {
  if (isSoundMuted()) return;
  const ctx = getContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = kind === 'stamp' ? 'square' : 'sine';
    osc.frequency.value = BLIP_FREQ[kind];

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  } catch {
    // بيئة بدون Web Audio فعّالة — لا كسر، فقط بدون صوت.
  }
}
