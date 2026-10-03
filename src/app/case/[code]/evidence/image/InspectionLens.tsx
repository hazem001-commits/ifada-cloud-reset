// ============================================================
// src/app/case/[code]/evidence/image/InspectionLens.tsx
// عدسة فحص محلية (ديسكتوب فقط): تكبّر بكسلات الصورة الأصلية نفسها
// حول المؤشر — نسخ مباشر من <img> المحمّلة أصلاً إلى canvas، بدون
// طلب شبكة إضافي وبدون أي "تحسين" أو شحذ. لا تضيف تفاصيل مش
// موجودة بالمصدر. تُحرَّك بشكل أمري (move) حتى ما نعيد الرندر مع
// كل حركة فأرة.
// ============================================================
'use client';

import { useImperativeHandle, useRef, type Ref } from 'react';
import styles from './ImageExamination.module.css';

export const LENS_SIZE = 176;
export const LENS_MAGNIFICATION = 2.5;

export interface LensHandle {
  /** x/y بإحداثيات الـ viewport (clientX/clientY). */
  move: (clientX: number, clientY: number) => void;
  hide: () => void;
}

export default function InspectionLens({
  ref,
  image,
}: {
  ref: Ref<LensHandle>;
  image: React.RefObject<HTMLImageElement | null>;
}) {
  const lensRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    move(clientX, clientY) {
      const img = image.current;
      const lens = lensRef.current;
      const canvas = canvasRef.current;
      if (!img || !lens || !canvas || !img.naturalWidth) return;

      const rect = img.getBoundingClientRect();
      const inside =
        clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      if (!inside) {
        lens.style.opacity = '0';
        return;
      }

      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const px = Math.round(LENS_SIZE * ratio);
      if (canvas.width !== px) {
        canvas.width = px;
        canvas.height = px;
      }

      // بكسلات المصدر المقابلة لدائرة العدسة.
      const displayScale = rect.width / img.naturalWidth;
      const srcSize = LENS_SIZE / (displayScale * LENS_MAGNIFICATION);
      const srcX = ((clientX - rect.left) / rect.width) * img.naturalWidth - srcSize / 2;
      const srcY = ((clientY - rect.top) / rect.height) * img.naturalHeight - srcSize / 2;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#05070a';
      ctx.fillRect(0, 0, px, px);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, px, px);

      const host = lens.offsetParent?.getBoundingClientRect();
      const left = clientX - (host?.left ?? 0) - LENS_SIZE / 2;
      const top = clientY - (host?.top ?? 0) - LENS_SIZE / 2;
      lens.style.transform = `translate(${left}px, ${top}px)`;
      lens.style.opacity = '1';
    },
    hide() {
      if (lensRef.current) lensRef.current.style.opacity = '0';
    },
  }));

  return (
    <div ref={lensRef} className={styles.lens} aria-hidden="true" style={{ width: LENS_SIZE, height: LENS_SIZE }}>
      <canvas ref={canvasRef} className={styles.lensCanvas} />
      <span className={styles.lensLabel}>×{LENS_MAGNIFICATION}</span>
    </div>
  );
}
