// ============================================================
// src/app/case/[code]/evidence/document/DocumentMetadata.tsx
// بطاقة بيانات الدليل خارج الورقة نفسها — من حقول موجودة فقط
// (الرمز، العنوان، النوع، التخصص، توقيت القضية، التصنيف البصري).
// لا جهات إصدار ولا ضباط ولا تواريخ مُختلقة.
// ============================================================
'use client';

import { KIND_LABEL, type EvidenceItem } from '@/types/case';
import { specLabel } from '@/types/database';
import { VARIANT_LABEL, type DocumentVariant } from './documentVariant';
import styles from './DocumentExamination.module.css';

export default function DocumentMetadata({
  id,
  item,
  variant,
  pageCount,
  zoomPercent,
}: {
  id: string;
  item: Pick<EvidenceItem, 'code' | 'title' | 'kind' | 'owner_spec' | 'clock_label'>;
  variant: DocumentVariant;
  pageCount: number | null;
  zoomPercent: number | null;
}) {
  const label = VARIANT_LABEL[variant];

  return (
    <aside id={id} className={styles.meta} aria-label="بيانات الدليل">
      <div className={styles.metaTag} aria-hidden="true">
        <span className={styles.metaTagHole} />
        <span className={styles.metaTagCode}>{item.code}</span>
        <span className={styles.metaTagClass}>{label.en}</span>
      </div>

      <dl className={styles.metaList}>
        <div className={styles.metaCode}>
          <dt>رقم الدليل</dt>
          <dd className={styles.mono}>{item.code}</dd>
        </div>
        <div className={styles.metaWide}>
          <dt>العنوان</dt>
          <dd>{item.title}</dd>
        </div>
        <div>
          <dt>النوع</dt>
          <dd>{KIND_LABEL[item.kind]}</dd>
        </div>
        <div>
          <dt>التصنيف</dt>
          <dd>{label.ar}</dd>
        </div>
        {/* مالك قدراتي فقط (توزيع بالتخصص). أدلة القنوات بلا مالك: لا سطر — القناة ليست تخصصاً. */}
        {item.owner_spec && (
          <div>
            <dt>التخصص</dt>
            <dd>{specLabel(item.owner_spec)}</dd>
          </div>
        )}
        {item.clock_label && (
          <div>
            <dt>توقيت القضية</dt>
            <dd className={styles.mono}>{item.clock_label}</dd>
          </div>
        )}
        {pageCount !== null && (
          <div>
            <dt>الصفحات</dt>
            <dd className={styles.mono}>{String(pageCount).padStart(2, '0')}</dd>
          </div>
        )}
        {zoomPercent !== null && (
          <div className={styles.metaZoom}>
            <dt>التكبير</dt>
            <dd className={styles.mono}>{zoomPercent}%</dd>
          </div>
        )}
      </dl>
    </aside>
  );
}
