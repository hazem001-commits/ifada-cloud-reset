// ============================================================
// src/app/case/[code]/evidence/document/DocumentToolbar.tsx
// أدوات فحص الوثيقة — تنقّل صفحات، تكبير/تصغير، ملاءمة، إعادة.
// كل زر له وظيفة حقيقية فقط. بالعربي "السابق" سهمه لليمين.
// ============================================================
'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import styles from './DocumentExamination.module.css';

export type FitMode = 'width' | 'page';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

export default function DocumentToolbar({
  page,
  pageCount,
  zoomPercent,
  canZoomIn,
  canZoomOut,
  fitMode,
  isDefaultView,
  onPrev,
  onNext,
  onZoomIn,
  onZoomOut,
  onToggleFit,
  onReset,
}: {
  page: number;
  pageCount: number;
  zoomPercent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  fitMode: FitMode;
  isDefaultView: boolean;
  onPrev: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleFit: () => void;
  onReset: () => void;
}) {
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // لما زر التنقّل المركّز عليه يتعطّل (أول/آخر صفحة)، المتصفح بيرمي
  // التركيز على body — رجّعه للزر المقابل حتى ما يضيع مكان اللاعب.
  useEffect(() => {
    // Chrome بيضل يعتبر الزر المعطّل "مركّزاً" لحظياً قبل ما يرمي التركيز على body.
    const active = document.activeElement;
    const lost = active === document.body || (active instanceof HTMLButtonElement && active.disabled);
    if (!lost) return;
    if (page >= pageCount) prevRef.current?.focus();
    else if (page <= 1) nextRef.current?.focus();
  }, [page, pageCount]);

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="أدوات فحص الوثيقة">
      {pageCount > 1 && (
        <div className={styles.toolGroup}>
          <button ref={prevRef} type="button" className={styles.tool} onClick={onPrev} disabled={page <= 1} aria-label="الصفحة السابقة">
            <Icon>
              <path d="M9 6l6 6-6 6" />
            </Icon>
          </button>
          <span className={styles.pageCounter} aria-live="polite" aria-atomic="true">
            <span className={styles.srOnly}>{`صفحة ${page} من ${pageCount}`}</span>
            <span aria-hidden="true" className={styles.pageCounterVisual}>
              <span className={styles.pageWord}>صفحة</span>
              <span className={styles.pageNumbers}>
                <strong>{pad(page)}</strong> / {pad(pageCount)}
              </span>
            </span>
          </span>
          <button ref={nextRef} type="button" className={styles.tool} onClick={onNext} disabled={page >= pageCount} aria-label="الصفحة التالية">
            <Icon>
              <path d="M15 6l-6 6 6 6" />
            </Icon>
          </button>
        </div>
      )}

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
          onClick={onToggleFit}
          aria-label={fitMode === 'width' ? 'ملاءمة الصفحة كاملة' : 'ملاءمة العرض'}
          title={fitMode === 'width' ? 'ملاءمة الصفحة كاملة' : 'ملاءمة العرض'}
        >
          {fitMode === 'width' ? (
            <Icon>
              <rect x="7" y="4" width="10" height="16" rx="1" />
            </Icon>
          ) : (
            <Icon>
              <path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3" />
            </Icon>
          )}
        </button>
        <button
          type="button"
          className={styles.tool}
          onClick={onReset}
          disabled={isDefaultView}
          aria-label="إعادة العرض الافتراضي"
          title="إعادة العرض الافتراضي"
        >
          <Icon>
            <path d="M5 12a7 7 0 1 0 2.1-5" />
            <path d="M5 4v4h4" />
          </Icon>
        </button>
      </div>
    </div>
  );
}
