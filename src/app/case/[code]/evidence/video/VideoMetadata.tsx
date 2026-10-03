// ============================================================
// src/app/case/[code]/evidence/video/VideoMetadata.tsx
// بيانات دليل الفيديو — حقول موجودة فقط (الرمز، العنوان، النوع،
// التخصص، توقيت القضية) + خصائص مقاسة من الملف نفسه (المدة، أبعاد
// الإطار). لا كاميرا ولا موقع ولا وقت تسجيل مُختلق.
// ============================================================
'use client';

import { KIND_LABEL, type EvidenceItem } from '@/types/case';
import { specLabel } from '@/types/database';
import { formatVideoTime } from './videoTime';
import styles from './VideoExamination.module.css';

export default function VideoMetadata({
  id,
  item,
  duration,
  frameSize,
}: {
  id: string;
  item: Pick<EvidenceItem, 'code' | 'title' | 'kind' | 'owner_spec' | 'clock_label'>;
  duration: number;
  frameSize: { width: number; height: number } | null;
}) {
  return (
    <aside id={id} className={styles.meta} aria-label="بيانات الدليل">
      <div className={styles.metaTag} aria-hidden="true">
        <span className={styles.metaTagHole} />
        <span className={styles.metaTagCode}>{item.code}</span>
        <span className={styles.metaTagClass}>VIDEO RECORDING</span>
      </div>

      <dl className={styles.metaList}>
        <div className={styles.metaDesktop}>
          <dt>رقم الدليل</dt>
          <dd className={styles.mono}>{item.code}</dd>
        </div>
        <div className={styles.metaDesktop}>
          <dt>العنوان</dt>
          <dd>{item.title}</dd>
        </div>
        <div>
          <dt>النوع</dt>
          <dd>{KIND_LABEL[item.kind]}</dd>
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
        {duration > 0 && Number.isFinite(duration) && (
          <div>
            <dt>المدة</dt>
            <dd className={styles.mono} dir="ltr">
              {formatVideoTime(duration)}
            </dd>
          </div>
        )}
        {frameSize && (
          <div>
            <dt>أبعاد الإطار</dt>
            <dd className={styles.mono} dir="ltr">
              {frameSize.width} × {frameSize.height} px
            </dd>
          </div>
        )}
      </dl>
    </aside>
  );
}
