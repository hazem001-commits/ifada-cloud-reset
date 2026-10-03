// ============================================================
// src/app/case/[code]/evidence/image/ImageToolbar.tsx
// أدوات فحص الصورة — كل زر له وظيفة حقيقية فقط: تكبير/تصغير،
// ملاءمة الشاشة (= إعادة)، الدقة الأصلية 1:1، عدسة الفحص (أجهزة
// المؤشر الدقيق فقط)، وإظهار الإطار بدون تأثيرات الشاشة (CCTV).
// ============================================================
'use client';

import type { ReactNode } from 'react';
import styles from './ImageExamination.module.css';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

export default function ImageToolbar({
  zoomPercent,
  canZoomIn,
  canZoomOut,
  isFitted,
  canShowNative,
  isNative,
  lensAvailable,
  lensOn,
  screenFxAvailable,
  screenFxOn,
  onZoomIn,
  onZoomOut,
  onFit,
  onNative,
  onToggleLens,
  onToggleScreenFx,
}: {
  zoomPercent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  isFitted: boolean;
  canShowNative: boolean;
  isNative: boolean;
  lensAvailable: boolean;
  lensOn: boolean;
  screenFxAvailable: boolean;
  screenFxOn: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onNative: () => void;
  onToggleLens: () => void;
  onToggleScreenFx: () => void;
}) {
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="أدوات فحص الصورة">
      <div className={styles.toolGroup}>
        <button type="button" className={styles.tool} onClick={onZoomOut} disabled={!canZoomOut} aria-label="تصغير">
          <Icon>
            <circle cx="11" cy="11" r="6" />
            <path d="M8.5 11h5M20 20l-4.2-4.2" />
          </Icon>
        </button>
        <span className={styles.zoomReadout} aria-live="polite">
          {zoomPercent}%
        </span>
        <button type="button" className={styles.tool} onClick={onZoomIn} disabled={!canZoomIn} aria-label="تكبير">
          <Icon>
            <circle cx="11" cy="11" r="6" />
            <path d="M8.5 11h5M11 8.5v5M20 20l-4.2-4.2" />
          </Icon>
        </button>
      </div>

      <div className={styles.toolGroup}>
        <button
          type="button"
          className={styles.tool}
          onClick={onFit}
          disabled={isFitted}
          aria-label="ملاءمة الشاشة"
          title="ملاءمة الشاشة"
        >
          <Icon>
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </Icon>
        </button>
        {canShowNative && (
          <button
            type="button"
            className={`${styles.tool} ${styles.toolText}`}
            onClick={onNative}
            disabled={isNative}
            aria-label="الدقة الأصلية"
            title="الدقة الأصلية"
          >
            1:1
          </button>
        )}
      </div>

      {(lensAvailable || screenFxAvailable) && (
        <div className={styles.toolGroup}>
          {lensAvailable && (
            <button
              type="button"
              className={styles.tool}
              onClick={onToggleLens}
              aria-pressed={lensOn}
              aria-label="عدسة الفحص"
              title="عدسة الفحص"
            >
              <Icon>
                <circle cx="10.5" cy="10.5" r="6.5" />
                <circle cx="10.5" cy="10.5" r="2.5" />
                <path d="M15.5 15.5L20 20" />
              </Icon>
            </button>
          )}
          {screenFxAvailable && (
            <button
              type="button"
              className={styles.tool}
              onClick={onToggleScreenFx}
              aria-pressed={!screenFxOn}
              aria-label="عرض الإطار بدون تأثيرات الشاشة"
              title="عرض الإطار بدون تأثيرات الشاشة"
            >
              <Icon>
                <rect x="3.5" y="5" width="17" height="12" rx="1" />
                <path d="M3.5 9h17M3.5 13h17M9 20h6" />
              </Icon>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
