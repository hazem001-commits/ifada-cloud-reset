// ============================================================
// src/app/case/[code]/evidence/phone/DeviceCapture.tsx
// لقطة شاشة جهاز مستردّ داخل هيكل جهاز محايد (بدون علامة تجارية،
// بدون نوتش أو أيقونات حالة). الهيكل حول الشاشة فقط — ما بيغطي أي
// بكسل. الصورة الأصلية بدون فلتر وبدون قصّ: "ملاءمة" = كامل اللقطة
// ظاهرة. تكبير/تحريك/قرصة/عجلة/1:1 وعدسة بكسلات حقيقية — نفس أدوات
// محطة الصور المعتمدة (مستوردة بدون تعديل).
// ============================================================
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ImageToolbar from '../image/ImageToolbar';
import InspectionLens, { type LensHandle } from '../image/InspectionLens';
import { useImageZoomPan, type Point, type Size } from '../image/useImageZoomPan';
import { useElementSize } from '../video/useElementSize';
import type { PhoneMediaState } from './phoneTypes';
import styles from './PhoneExamination.module.css';

const STEP = 1.5;
const PAN_STEP = 48;

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export default function DeviceCapture({
  code,
  title,
  media,
  describedBy,
  onRetry,
  onMediaError,
  onNaturalSize,
}: {
  code: string;
  title: string;
  media: PhoneMediaState;
  describedBy: string;
  onRetry: () => void;
  onMediaError: () => void;
  onNaturalSize: (s: Size) => void;
}) {
  const { ref: screenCallbackRef, nodeRef: screenNodeRef, size: screenSize } = useElementSize<HTMLDivElement>();
  const imgRef = useRef<HTMLImageElement>(null);
  const lensRef = useRef<LensHandle>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const [natural, setNatural] = useState<Size | null>(null);
  const [dragging, setDragging] = useState(false);
  const [lensOn, setLensOn] = useState(false);
  const [lensAvailable] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches,
  );

  const zp = useImageZoomPan(screenSize, natural);
  const { zoomTo, panBy, fitToScreen } = zp;
  const ready = media.status === 'ready' && natural !== null && zp.ready;
  const zoomPercent = zp.ready ? Math.round(zp.scale * 100) : 100;

  const rel = useCallback(
    (x: number, y: number): Point => {
      const r = screenNodeRef.current?.getBoundingClientRect();
      return r ? { x: x - (r.left + r.width / 2), y: y - (r.top + r.height / 2) } : { x: 0, y: 0 };
    },
    [screenNodeRef],
  );

  useEffect(() => {
    const el = screenNodeRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoomTo((z) => z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), rel(e.clientX, e.clientY));
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [screenNodeRef, zoomTo, rel, media.status]);

  useEffect(() => {
    if (!ready) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTextEntry(e.target)) return;
      const actions: Record<string, () => void> = {
        '+': () => zoomTo((z) => z * STEP),
        '=': () => zoomTo((z) => z * STEP),
        '-': () => zoomTo((z) => z / STEP),
        '0': fitToScreen,
        '1': () => zoomTo(zp.nativeZoom),
        ArrowLeft: () => panBy(PAN_STEP, 0),
        ArrowRight: () => panBy(-PAN_STEP, 0),
        ArrowUp: () => panBy(0, PAN_STEP),
        ArrowDown: () => panBy(0, -PAN_STEP),
      };
      const action = actions[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ready, zoomTo, panBy, fitToScreen, zp.nativeZoom]);

  const aspect = natural ? `${natural.width} / ${natural.height}` : '9 / 19.5';

  return (
    <div className={styles.captureBlock}>
      <div className={styles.device} style={{ '--capture-aspect': aspect } as React.CSSProperties}>
        <div
          ref={screenCallbackRef}
          className={styles.screen}
          role="region"
          aria-label={`لقطة شاشة الجهاز — ${code}`}
          aria-describedby={describedBy}
          tabIndex={0}
          data-zoomed={zp.zoom > 1.001 || undefined}
          data-dragging={dragging || undefined}
          data-lens={(lensOn && lensAvailable) || undefined}
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
            lensRef.current?.hide();
          }}
          onPointerMove={(e) => {
            const prev = pointers.current.get(e.pointerId);
            if (!prev) {
              if (lensOn && e.pointerType === 'mouse') lensRef.current?.move(e.clientX, e.clientY);
              return;
            }
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
          onPointerLeave={() => lensRef.current?.hide()}
          onDoubleClick={(e) => zoomTo((z) => (z > 1.01 ? 1 : 2.5), rel(e.clientX, e.clientY))}
        >
          {media.status === 'ready' && (
            <div
              className={styles.plate}
              data-visible={ready || undefined}
              style={{
                width: `${natural ? natural.width * zp.scale : 0}px`,
                height: `${natural ? natural.height * zp.scale : 0}px`,
                transform: `translate(calc(-50% + ${zp.offset.x}px), calc(-50% + ${zp.offset.y}px))`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={media.url}
                alt={`${code} — ${title}`}
                className={styles.capture}
                draggable={false}
                decoding="async"
                referrerPolicy="no-referrer"
                onLoad={(e) => {
                  const s = { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight };
                  setNatural(s);
                  onNaturalSize(s);
                }}
                onError={onMediaError}
              />
            </div>
          )}

          {media.status === 'error' ? (
            <div className={styles.screenState} role="alert">
              <p data-error>تعذّر استرجاع لقطة الجهاز من الأرشيف.</p>
              <button type="button" className={styles.stateRetry} onClick={onRetry}>
                طلب الملف مرة ثانية
              </button>
            </div>
          ) : (
            !ready && (
              <div className={styles.screenState} role="status" aria-live="polite">
                <span className={styles.stateScan} aria-hidden="true" />
                <p>جاري استرجاع لقطة الجهاز من الأرشيف…</p>
              </div>
            )
          )}

          {lensAvailable && lensOn && ready && <InspectionLens ref={lensRef} image={imgRef} />}
        </div>
      </div>

      {/* شرح فحص صادق: قيم مقاسة فقط — بدون أي استنتاج عن الجهاز أو التطبيق. */}
      {natural && (
        <p className={styles.captureNote}>
          <span>لقطة شاشة</span>
          <span className={styles.captureNoteSep} aria-hidden="true">·</span>
          <span dir="ltr" className={styles.captureNoteDims}>
            {natural.width} × {natural.height} px
          </span>
          <span className={styles.captureNoteSep} aria-hidden="true">·</span>
          <span>المصدر دون تعديل</span>
        </p>
      )}

      {ready && (
        <ImageToolbar
          zoomPercent={zoomPercent}
          canZoomIn={zp.zoom < zp.maxZoom - 0.001}
          canZoomOut={zp.zoom > 1.001}
          isFitted={zp.zoom <= 1.001 && zp.offset.x === 0 && zp.offset.y === 0}
          canShowNative={zp.nativeZoom > 1.01}
          isNative={Math.abs(zp.zoom - zp.nativeZoom) < 0.01}
          lensAvailable={lensAvailable}
          lensOn={lensOn}
          screenFxAvailable={false}
          screenFxOn={false}
          onZoomIn={() => zoomTo((z) => z * STEP)}
          onZoomOut={() => zoomTo((z) => z / STEP)}
          onFit={fitToScreen}
          onNative={() => zoomTo(zp.nativeZoom)}
          onToggleLens={() => setLensOn((v) => !v)}
          onToggleScreenFx={() => undefined}
        />
      )}
    </div>
  );
}
