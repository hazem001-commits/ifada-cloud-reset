// ============================================================
// src/app/case/[code]/evidence/audio/StationMessage.tsx
// حالات محطة الاستماع داخل عالم اللعبة (استرجاع/رسم/تعذّر). لا
// رسائل تقنية ولا روابط — التشخيص بالكونسول فقط.
// ============================================================
'use client';

import styles from './AudioExamination.module.css';

export default function StationMessage({
  children,
  error,
  onRetry,
}: {
  children: string;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className={styles.stationMessage} role={error ? 'alert' : 'status'} aria-live="polite">
      {!error && <span className={styles.stateScan} aria-hidden="true" />}
      <p data-error={error || undefined}>{children}</p>
      {onRetry && (
        <button type="button" className={styles.stateRetry} onClick={onRetry}>
          طلب الملف مرة ثانية
        </button>
      )}
    </div>
  );
}
