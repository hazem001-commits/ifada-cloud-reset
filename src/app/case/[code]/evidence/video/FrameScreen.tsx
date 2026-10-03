// ============================================================
// src/app/case/[code]/evidence/video/FrameScreen.tsx
// شاشة الإطار: <video> بدون أدوات المتصفح، داخل إطار يسمح بتكبير
// وتحريك البكسلات الحقيقية فقط (بدون فلاتر ولا "تحسين"). الضغط
// على الإطار ما بيشغّل/يوقف عمداً — حتى ما يضيع الإطار المتوقَّف
// عليه بالغلط. عجلة الفأرة تكبّر حول المؤشر، النقر المزدوج يبدّل.
// ============================================================
'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Point } from '../image/useImageZoomPan';
import styles from './VideoExamination.module.css';

export interface ZoomPanControls {
  ready: boolean;
  scale: number;
  zoom: number;
  offset: Point;
  zoomTo: (next: number | ((z: number) => number), anchor?: Point) => void;
  panBy: (dx: number, dy: number) => void;
}

export default function FrameScreen({
  viewportRef,
  viewportCallbackRef,
  natural,
  zp,
  describedBy,
  children,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  /** callback ref لقياس الحجم (العنصر بيظهر متأخّر). */
  viewportCallbackRef: (el: HTMLDivElement | null) => void;
  natural: { width: number; height: number } | null;
  zp: ZoomPanControls;
  describedBy: string;
  /** عنصر <video> نفسه — يُمرَّر من الأب اللي بيملك أحداثه. */
  children: ReactNode;
}) {
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const { zoomTo, panBy } = zp;

  const rel = useCallback(
    (x: number, y: number): Point => {
      const r = viewportRef.current?.getBoundingClientRect();
      return r ? { x: x - (r.left + r.width / 2), y: y - (r.top + r.height / 2) } : { x: 0, y: 0 };
    },
    [viewportRef],
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoomTo((z) => z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), rel(e.clientX, e.clientY));
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewportRef, zoomTo, rel]);

  const width = natural ? natural.width * zp.scale : 0;
  const height = natural ? natural.height * zp.scale : 0;

  return (
    <div
      ref={viewportCallbackRef}
      className={styles.screen}
      role="region"
      aria-label="شاشة فحص الإطار"
      aria-describedby={describedBy}
      tabIndex={0}
      data-zoomed={zp.zoom > 1.001 || undefined}
      data-dragging={dragging || undefined}
      style={{ '--media-aspect': natural ? `${natural.width} / ${natural.height}` : '16 / 9' } as React.CSSProperties}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // غير ضروري للتحريك.
        }
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
          const [a, b] = Array.from(pointers.current.values()) as [Point, Point];
          pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: zp.zoom };
        }
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) return;
        const cur = { x: e.clientX, y: e.clientY };
        pointers.current.set(e.pointerId, cur);
        if (pointers.current.size === 2 && pinch.current) {
          const [a, b] = Array.from(pointers.current.values()) as [Point, Point];
          const start = pinch.current;
          zoomTo(start.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / start.dist), rel((a.x + b.x) / 2, (a.y + b.y) / 2));
        } else if (pointers.current.size === 1) {
          panBy(cur.x - prev.x, cur.y - prev.y);
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        if (pointers.current.size === 0) setDragging(false);
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        pinch.current = null;
        if (pointers.current.size === 0) setDragging(false);
      }}
      onDoubleClick={(e) => zoomTo((z) => (z > 1.01 ? 1 : 2.5), rel(e.clientX, e.clientY))}
    >
      <div
        className={styles.plate}
        data-visible={(zp.ready && natural !== null) || undefined}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(calc(-50% + ${zp.offset.x}px), calc(-50% + ${zp.offset.y}px))`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
