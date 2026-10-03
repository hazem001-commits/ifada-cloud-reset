// ============================================================
// src/app/case/[code]/evidence/phone/PhoneEvidenceViewer.tsx
// محطة فحص أدلة الهاتف/المحادثة المشتركة لكل القضايا:
//   • لقطة شاشة → DeviceCapture (البكسلات الأصلية كما هي).
//   • بيانات رسائل مبنينة حقيقية (لو القضية زوّدتها) → StructuredThread.
//   • ولا واحد → حالة صادقة بدون محتوى مُختلق.
// الاختيار لهون حسب classifyEvidence (نوع الوسائط + كلمات العنوان) —
// بدون كود قضية أو دليل.
// ============================================================
'use client';

import { useCallback, useId, useState } from 'react';
import type { EvidenceItem } from '@/types/case';
import type { Size } from '../image/useImageZoomPan';
import DeviceCapture from './DeviceCapture';
import PhoneMetadata from './PhoneMetadata';
import StructuredThread from './StructuredThread';
import type { PhoneMediaState, StructuredThread as Thread } from './phoneTypes';
import styles from './PhoneExamination.module.css';

export default function PhoneEvidenceViewer({
  item,
  media,
  thread,
  onRetry,
  onMediaError,
}: {
  item: EvidenceItem;
  media: PhoneMediaState;
  /** بيانات رسائل حقيقية من مصدر القضية فقط — غير مزوّدة حالياً لأي دليل. */
  thread?: Thread;
  onRetry: () => void;
  onMediaError: () => void;
}) {
  const metaId = useId();
  const [size, setSize] = useState<Size | null>(null);
  const onNaturalSize = useCallback((s: Size) => {
    setSize((prev) => (prev?.width === s.width && prev?.height === s.height ? prev : s));
  }, []);
  const structured = !!thread && thread.messages.length > 0;

  return (
    <div className={styles.workstation}>
      <PhoneMetadata id={metaId} item={item} size={size} structured={structured && media.status === 'none'} />
      <div className={styles.stage}>
        {media.status !== 'none' ? (
          <DeviceCapture
            code={item.code}
            title={item.title}
            media={media}
            describedBy={metaId}
            onRetry={onRetry}
            onMediaError={onMediaError}
            onNaturalSize={onNaturalSize}
          />
        ) : structured && thread ? (
          <StructuredThread thread={thread} />
        ) : (
          <p className={styles.emptyNote}>لا يوجد محتوى جهاز مرفق بهذا الدليل.</p>
        )}
      </div>
    </div>
  );
}
