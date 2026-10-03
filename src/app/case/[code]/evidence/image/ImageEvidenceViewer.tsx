// ============================================================
// src/app/case/[code]/evidence/image/ImageEvidenceViewer.tsx
// محطة فحص الصور المشتركة لكل القضايا. وضعان:
//   surveillance — شاشة مراقبة: إطار جهاز، خطوط مسح، حبيبات خفيفة.
//   photo        — طاولة ضوء فحص نظيفة بعلامات قصّ.
// التأثيرات طبقة فوق الصورة فقط — الصورة الأصلية ما بتتعدّل أبداً،
// واللاعب يقدر يطفي تأثيرات الشاشة ويشوف الإطار الخام.
// التكبير/التحريك: عجلة الفأرة، سحب، قرصة إصبعين، نقر مزدوج، وكيبورد.
// ============================================================
'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { EvidenceItem } from '@/types/case';
import { useStageSize } from '../document/useStageSize';
import ImageMetadata, { type ImageMode } from './ImageMetadata';
import ImageToolbar from './ImageToolbar';
import InspectionLens, { type LensHandle } from './InspectionLens';
import { useImageZoomPan, type Point, type Size } from './useImageZoomPan';
import styles from './ImageExamination.module.css';

export type ImageMediaState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; url: string };

const STEP = 1.5;
const PAN_STEP = 48;

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export default function ImageEvidenceViewer({
  item,
  mode,
  media,
  onRetry,
  onMediaError,
}: {
  item: EvidenceItem;
  mode: ImageMode;
  media: ImageMediaState;
  onRetry: () => void;
  onMediaError: () => void;
}) {
  const metaId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const lensRef = useRef<LensHandle>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  const viewport = useStageSize(viewportRef);
  const [natural, setNatural] = useState<Size | null>(null);
  const [dragging, setDragging] = useState(false);
  const [lensOn, setLensOn] = useState(false);
  const [screenFx, setScreenFx] = useState(true);
  const [lensAvailable] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches,
  );

  const zp = useImageZoomPan(viewport, natural);
  const { zoomTo, panBy, fitToScreen } = zp;
  const surveillance = mode === 'surveillance';
  const zoomPercent = zp.ready ? Math.round(zp.scale * 100) : null;

  const relToCenter = useCallback((clientX: number, clientY: number): Point => {
    const r = viewportRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) };
  }, []);

  // عجلة الفأرة/قرصة لوحة اللمس (ctrl+wheel) — مستمع غير passive حتى
  // المتصفح ما يكبّر الصفحة كلها بدل الصورة.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      zoomTo((z) => z * factor, relToCenter(e.clientX, e.clientY));
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo, relToCenter]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
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
  }, [zoomTo, panBy, fitToScreen, zp.nativeZoom]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values()) as [Point, Point];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: zp.zoom };
    }
    setDragging(true);
    lensRef.current?.hide();
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      if (lensOn && e.pointerType === 'mouse') lensRef.current?.move(e.clientX, e.clientY);
      return;
    }
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = Array.from(pointers.current.values()) as [Point, Point];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const start = pinch.current;
      zoomTo(start.zoom * (dist / start.dist), relToCenter((a.x + b.x) / 2, (a.y + b.y) / 2));
    } else if (pointers.current.size === 1) {
      panBy(cur.x - prev.x, cur.y - prev.y);
    }
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
  }

  const ready = media.status === 'ready' && natural !== null && zp.ready;
  const imgWidth = natural ? natural.width * zp.scale : 0;
  const imgHeight = natural ? natural.height * zp.scale : 0;

  return (
    <div className={styles.workstation} data-mode={mode}>
      <ImageMetadata id={metaId} item={item} mode={mode} resolution={natural} />

      <div className={styles.stageWrap}>
        <div className={styles.stage}>
          <div className={surveillance ? styles.monitor : styles.lightTable}>
            <div
              ref={viewportRef}
              className={styles.viewport}
              data-zoomed={zp.zoom > 1.001 || undefined}
              data-dragging={dragging || undefined}
              data-lens={(lensOn && lensAvailable) || undefined}
              role="region"
              aria-label={`سطح فحص ${item.code}`}
              aria-describedby={metaId}
              // قابل للتركيز: الضغط على الصورة ما بيرمي التركيز برّا الحوار.
              tabIndex={0}
              style={{ '--media-aspect': natural ? `${natural.width} / ${natural.height}` : '16 / 9' } as React.CSSProperties}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              onPointerLeave={() => lensRef.current?.hide()}
              onDoubleClick={(e) => zoomTo((z) => (z > 1.01 ? 1 : 2.5), relToCenter(e.clientX, e.clientY))}
            >
              {media.status === 'ready' && (
                <div
                  className={styles.plate}
                  data-visible={ready || undefined}
                  style={{
                    width: `${imgWidth}px`,
                    height: `${imgHeight}px`,
                    transform: `translate(calc(-50% + ${zp.offset.x}px), calc(-50% + ${zp.offset.y}px))`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imgRef}
                    src={media.url}
                    alt={`${item.code} — ${item.title}`}
                    className={styles.image}
                    draggable={false}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onLoad={(e) => {
                      const el = e.currentTarget;
                      setNatural({ width: el.naturalWidth, height: el.naturalHeight });
                    }}
                    onError={onMediaError}
                  />
                  {!surveillance && <span className={styles.cropMarks} aria-hidden="true" />}
                </div>
              )}

              {media.status === 'error' ? (
                <div className={styles.screenState} role="alert">
                  <p>تعذّر استرجاع اللقطة من الأرشيف.</p>
                  <button type="button" className={styles.stateRetry} onClick={onRetry}>
                    طلب الملف مرة ثانية
                  </button>
                </div>
              ) : (
                !ready && (
                  <div className={styles.screenState} role="status" aria-live="polite">
                    <span className={styles.stateScan} aria-hidden="true" />
                    <p>جاري استرجاع اللقطة من الأرشيف…</p>
                  </div>
                )
              )}

              {surveillance && screenFx && ready && <div className={styles.screenFx} aria-hidden="true" />}

              {lensAvailable && lensOn && ready && <InspectionLens ref={lensRef} image={imgRef} />}
            </div>
            {/* بيانات الشاشة على إطار الجهاز، مش فوق البكسلات — ما بتغطي أي جزء من الدليل. */}
            {surveillance && (
              <div className={styles.bezelStrip} aria-hidden="true">
                <span className={styles.bezelLed} />
                <span className={styles.bezelLabel}>EVIDENCE MONITOR</span>
                <span className={styles.bezelCode}>{item.code}</span>
                <span className={styles.bezelSpacer} />
                {item.clock_label && <span className={styles.bezelClock}>{item.clock_label}</span>}
                <span className={styles.hudStill}>STILL</span>
              </div>
            )}
          </div>
        </div>

        {ready && (
          <ImageToolbar
            zoomPercent={zoomPercent ?? 100}
            canZoomIn={zp.zoom < zp.maxZoom - 0.001}
            canZoomOut={zp.zoom > 1.001}
            isFitted={zp.zoom <= 1.001 && zp.offset.x === 0 && zp.offset.y === 0}
            canShowNative={zp.nativeZoom > 1.01}
            isNative={Math.abs(zp.zoom - zp.nativeZoom) < 0.01}
            lensAvailable={lensAvailable}
            lensOn={lensOn}
            screenFxAvailable={surveillance}
            screenFxOn={screenFx}
            onZoomIn={() => zoomTo((z) => z * STEP)}
            onZoomOut={() => zoomTo((z) => z / STEP)}
            onFit={fitToScreen}
            onNative={() => zoomTo(zp.nativeZoom)}
            onToggleLens={() => setLensOn((v) => !v)}
            onToggleScreenFx={() => setScreenFx((v) => !v)}
          />
        )}
      </div>
    </div>
  );
}
