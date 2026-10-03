// ============================================================
// src/app/case/[code]/evidence/image/useImageZoomPan.ts
// منطق التكبير والتحريك للصورة داخل شاشة الفحص. zoom مضاعف
// لـ "ملاءمة الشاشة" (1 = الصورة كاملة ظاهرة). الإزاحة تُقيَّد
// حتى الصورة ما تنسحب برّا الإطار. التكبير حول نقطة (مؤشر/قرصة)
// يثبّت نفس بكسل الصورة تحت الإصبع.
// ============================================================
'use client';

import { useCallback, useState } from 'react';

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

interface View {
  zoom: number;
  x: number;
  y: number;
}

/** أقصى تكبير = 8× الملاءمة، أو 4× الدقة الأصلية — أيهما أكبر. */
const MAX_FIT_MULTIPLE = 8;
const MAX_NATIVE_MULTIPLE = 4;
/** صورة صغيرة ما تنكبّر عند "الملاءمة" أكثر من هيك. */
const MAX_FIT_UPSCALE = 2;

export function useImageZoomPan(viewport: Size, natural: Size | null) {
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });

  const fit =
    natural && viewport.width > 0 && viewport.height > 0
      ? Math.min(viewport.width / natural.width, viewport.height / natural.height, MAX_FIT_UPSCALE)
      : 0;
  const maxZoom = fit > 0 ? Math.max(MAX_FIT_MULTIPLE, MAX_NATIVE_MULTIPLE / fit) : 1;
  const nativeZoom = fit > 0 ? 1 / fit : 1;

  const vw = viewport.width;
  const vh = viewport.height;
  const nw = natural?.width ?? 0;
  const nh = natural?.height ?? 0;

  const clampView = useCallback(
    (v: View): View => {
      const zoom = Math.min(maxZoom, Math.max(1, v.zoom));
      if (fit === 0) return { zoom, x: 0, y: 0 };
      const maxX = Math.max(0, (nw * fit * zoom - vw) / 2);
      const maxY = Math.max(0, (nh * fit * zoom - vh) / 2);
      return {
        zoom,
        x: Math.min(maxX, Math.max(-maxX, v.x)),
        y: Math.min(maxY, Math.max(-maxY, v.y)),
      };
    },
    [fit, maxZoom, nw, nh, vw, vh],
  );

  /** anchor: نقطة بإحداثيات الشاشة نسبةً لمركز الإطار. */
  const zoomTo = useCallback(
    (nextZoom: number | ((z: number) => number), anchor: Point = { x: 0, y: 0 }) => {
      setView((v) => {
        const target = typeof nextZoom === 'function' ? nextZoom(v.zoom) : nextZoom;
        const clamped = clampView({ ...v, zoom: target });
        const ratio = clamped.zoom / v.zoom;
        return clampView({
          zoom: clamped.zoom,
          x: anchor.x - (anchor.x - v.x) * ratio,
          y: anchor.y - (anchor.y - v.y) * ratio,
        });
      });
    },
    [clampView],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy })),
    [clampView],
  );

  const fitToScreen = useCallback(() => setView({ zoom: 1, x: 0, y: 0 }), []);

  // تغيّر حجم الشاشة ممكن يخلّي الإزاحة المخزّنة برّا الحدود — نقيّدها وقت القراءة.
  const current = clampView(view);
  const scale = fit * current.zoom;

  return {
    ready: fit > 0,
    scale,
    zoom: current.zoom,
    offset: { x: current.x, y: current.y },
    maxZoom,
    nativeZoom,
    zoomTo,
    panBy,
    fitToScreen,
  };
}
