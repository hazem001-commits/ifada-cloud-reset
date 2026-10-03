// ============================================================
// src/app/case/[code]/evidence/document/ArchiveStates.tsx
// حالات "الأرشيف" داخل عالم اللعبة: استرجاع الملف، أو تعذّره.
// لا رسائل تقنية ولا روابط — التشخيص الفعلي بالكونسول/السيرفر.
// ============================================================
'use client';

import styles from './DocumentExamination.module.css';

export function ArchiveLoading() {
  return (
    <div className={`${styles.sheet} ${styles.stateSheet}`} role="status" aria-live="polite">
      <span className={styles.stateScan} aria-hidden="true" />
      <p className={styles.stateText}>جاري استرجاع الملف من الأرشيف…</p>
    </div>
  );
}

export function ArchiveError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={`${styles.sheet} ${styles.stateSheet} ${styles.stateSheetError}`} role="alert">
      <p className={styles.stateText}>تعذّر استرجاع الملف من الأرشيف.</p>
      <button type="button" className={styles.stateRetry} onClick={onRetry}>
        طلب الملف مرة ثانية
      </button>
    </div>
  );
}
