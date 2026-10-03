// ============================================================
// src/app/case/[code]/evidence/video/useVideoKeyboard.ts
// اختصارات محطة الفيديو (لما الحوار مفتوح):
//   Space / K  تشغيل/إيقاف (إلا على زر مركّز — المسافة تنقر الزر)
//   ← / →      رجوع/تقديم ثانية (محور الزمن من اليسار لليمين)
//   Shift+←/→ أو , / .   إطار سابق/تالي
//   Home / End  البداية/النهاية     M  كتم
//   + / - / 0   تكبير/تصغير/ملاءمة الإطار
// ما بيتدخل بحقول الإدخال (شريط الصوت مثلاً).
// ============================================================
'use client';

import { useEffect } from 'react';

export interface VideoKeyActions {
  toggle: () => void;
  skip: (seconds: number) => void;
  frameStep: (direction: 1 | -1) => void;
  toStart: () => void;
  toEnd: () => void;
  toggleMute: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

const SEEK_SECONDS = 1;

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function useVideoKeyboard(enabled: boolean, a: VideoKeyActions) {
  const { toggle, skip, frameStep, toStart, toEnd, toggleMute, zoomIn, zoomOut, fit } = a;

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTextEntry(e.target)) return;
      const actions: Record<string, () => void> = {
        ArrowRight: () => (e.shiftKey ? frameStep(1) : skip(SEEK_SECONDS)),
        ArrowLeft: () => (e.shiftKey ? frameStep(-1) : skip(-SEEK_SECONDS)),
        '.': () => frameStep(1),
        ',': () => frameStep(-1),
        Home: toStart,
        End: toEnd,
        m: toggleMute,
        M: toggleMute,
        '+': zoomIn,
        '=': zoomIn,
        '-': zoomOut,
        '0': fit,
      };
      if (!(e.target instanceof HTMLButtonElement)) {
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
  }, [enabled, toggle, skip, frameStep, toStart, toEnd, toggleMute, zoomIn, zoomOut, fit]);
}
