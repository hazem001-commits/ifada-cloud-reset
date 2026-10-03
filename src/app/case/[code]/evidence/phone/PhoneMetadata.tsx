// ============================================================
// src/app/case/[code]/evidence/phone/PhoneMetadata.tsx
// بيانات دليل الهاتف — حقول موجودة فقط (الرمز، العنوان، النوع،
// التخصص، توقيت القضية) + أبعاد اللقطة المقاسة. ما في استنتاج لصاحب
// الجهاز ولا جهة الاتصال ولا اسم التطبيق ولا تاريخ الرسائل.
// ============================================================
'use client';

import { KIND_LABEL, type EvidenceItem } from '@/types/case';
import { specLabel } from '@/types/database';
import type { Size } from '../image/useImageZoomPan';
import styles from './PhoneExamination.module.css';

export default function PhoneMetadata({
  id,
  item,
  size,
  structured,
}: {
  id: string;
  item: Pick<EvidenceItem, 'code' | 'title' | 'kind' | 'owner_spec' | 'clock_label'>;
  size: Size | null;
  structured: boolean;
}) {
  return (
    <aside id={id} className={styles.meta} aria-label="بيانات الدليل">
      <div className={styles.metaTag} aria-hidden="true">
        <span className={styles.metaTagHole} />
        <span className={styles.metaTagCode}>{item.code}</span>
        <span className={styles.metaTagClass}>{structured ? 'MESSAGE RECORD' : 'DEVICE CAPTURE'}</span>
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
          <dd>{structured ? 'سجل رسائل' : 'لقطة شاشة جهاز'}</dd>
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
        {size && (
          <div>
            <dt>أبعاد اللقطة</dt>
            <dd className={styles.mono} dir="ltr">
              {size.width} × {size.height} px
            </dd>
          </div>
        )}
      </dl>
    </aside>
  );
}
