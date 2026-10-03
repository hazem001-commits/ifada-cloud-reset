// ============================================================
// src/app/case/[code]/evidence/image/ImageMetadata.tsx
// بيانات دليل الصورة خارج الإطار — من حقول موجودة فقط (الرمز،
// العنوان، النوع، التخصص، توقيت القضية) + أبعاد الملف الفعلية
// المقاسة من الصورة نفسها. لا كاميرا ولا موقع ولا وقت مُختلق.
// ============================================================
'use client';

import { KIND_LABEL, type EvidenceItem } from '@/types/case';
import { specLabel } from '@/types/database';
import type { Size } from './useImageZoomPan';
import styles from './ImageExamination.module.css';

export type ImageMode = 'surveillance' | 'photo';

export const IMAGE_MODE_LABEL: Record<ImageMode, { ar: string; en: string }> = {
  surveillance: { ar: 'لقطة مراقبة', en: 'SURVEILLANCE CAPTURE' },
  photo: { ar: 'صورة دليل', en: 'EVIDENCE PHOTO' },
};

export default function ImageMetadata({
  id,
  item,
  mode,
  resolution,
}: {
  id: string;
  item: Pick<EvidenceItem, 'code' | 'title' | 'kind' | 'owner_spec' | 'clock_label'>;
  mode: ImageMode;
  resolution: Size | null;
}) {
  const label = IMAGE_MODE_LABEL[mode];

  return (
    <aside id={id} className={styles.meta} aria-label="بيانات الدليل">
      <div className={styles.metaTag} aria-hidden="true">
        <span className={styles.metaTagHole} />
        <span className={styles.metaTagCode}>{item.code}</span>
        <span className={styles.metaTagClass}>{label.en}</span>
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
        {resolution && (
          <div>
            <dt>أبعاد الملف</dt>
            <dd className={styles.mono} dir="ltr">
              {resolution.width} × {resolution.height} px
            </dd>
          </div>
        )}
      </dl>
    </aside>
  );
}
