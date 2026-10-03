// ============================================================
// src/app/case/[code]/evidence/audio/AudioMetadata.tsx
// بيانات دليل التسجيل — حقول موجودة فقط (الرمز، العنوان، النوع،
// التخصص، توقيت القضية) + خصائص الملف المقاسة فعلياً من الصوت
// المفكوك (المدة، عدد القنوات). معدّل العيّنات ما بينعرض لأن فك
// الترميز بيعيد عيّنته لمعدّل السياق — مش قيمة الملف الأصلية. لا جهاز تسجيل ولا
// مكان ولا متحدّث مُختلق.
// ============================================================
'use client';

import { KIND_LABEL, type EvidenceItem } from '@/types/case';
import { specLabel } from '@/types/database';
import { formatTimecode, type DecodedAudioInfo } from './audioAnalysis';
import styles from './AudioExamination.module.css';

export default function AudioMetadata({
  id,
  item,
  duration,
  wave,
}: {
  id: string;
  item: Pick<EvidenceItem, 'code' | 'title' | 'kind' | 'owner_spec' | 'clock_label'>;
  duration: number;
  wave: DecodedAudioInfo | null;
}) {
  return (
    <aside id={id} className={styles.meta} aria-label="بيانات الدليل">
      <div className={styles.metaTag} aria-hidden="true">
        <span className={styles.metaTagHole} />
        <span className={styles.metaTagCode}>{item.code}</span>
        <span className={styles.metaTagClass}>AUDIO RECORDING</span>
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
        {duration > 0 && (
          <div>
            <dt>المدة</dt>
            <dd className={styles.mono} dir="ltr">
              {formatTimecode(duration)}
            </dd>
          </div>
        )}
        {wave && (
          <div>
            <dt>القنوات</dt>
            <dd className={styles.mono} dir="ltr">
              {wave.channels === 1 ? 'MONO' : wave.channels === 2 ? 'STEREO' : `${wave.channels} CH`}
            </dd>
          </div>
        )}
      </dl>
    </aside>
  );
}
