// ============================================================
// src/app/case/[code]/evidence/document/DocumentEvidenceViewer.tsx
// طاولة فحص الوثيقة: ملف أرشيف تحت، ورقة فوقه، ختم، بيانات الدليل
// جانباً، وأدوات فحص. PDF يُرسم بصفحات تملكها IFADA (PDF.js) —
// بدون أي واجهة عرض PDF تبع المتصفح. بدون وسائط: النص هو الورقة.
// ============================================================
'use client';

import { useEffect, useId } from 'react';
import type { EvidenceItem } from '@/types/case';
import EvidenceStamp from '../EvidenceStamp';
import { playBlip } from '../sound';
import DocumentMetadata from './DocumentMetadata';
import PdfExamination from './PdfExamination';
import { documentVariantFor, isClassified } from './documentVariant';
import { ArchiveError, ArchiveLoading } from './ArchiveStates';
import styles from './DocumentExamination.module.css';

export type DocumentMediaState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; url: string; contentType: string };

/** مدة تأخير نزول الختم بالـ CSS — الصوت يتزامن مع لحظة الارتطام. */
const STAMP_IMPACT_MS = 620;

function StampCluster({ code, classified }: { code: string; classified: boolean }) {
  useEffect(() => {
    const t = window.setTimeout(() => playBlip('stamp'), STAMP_IMPACT_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className={styles.stamps} aria-hidden="true">
      <EvidenceStamp text={code} className={styles.stampCode} />
      {classified && <EvidenceStamp text="CONFIDENTIAL" className={styles.stampClass} />}
    </div>
  );
}

export default function DocumentEvidenceViewer({
  item,
  media,
  onRetry,
  onMediaError,
}: {
  item: EvidenceItem;
  media: DocumentMediaState;
  onRetry: () => void;
  onMediaError: () => void;
}) {
  const metaId = useId();
  const variant = documentVariantFor(item);
  const classified = isClassified(variant);

  const stamps = <StampCluster code={item.code} classified={classified} />;

  if (media.status === 'ready' && media.contentType === 'application/pdf') {
    return (
      <PdfExamination
        key={media.url}
        url={media.url}
        item={item}
        variant={variant}
        metaId={metaId}
        stamps={stamps}
        onRetry={onRetry}
      />
    );
  }

  return (
    <div className={styles.workstation} data-variant={variant}>
      <DocumentMetadata id={metaId} item={item} variant={variant} pageCount={null} zoomPercent={null} />
      <div className={styles.stageWrap}>
        <div className={styles.stage} aria-describedby={metaId}>
          <div className={styles.desk}>
            <div className={styles.sheetFrame} data-variant={variant}>
              {media.status === 'loading' ? (
                <ArchiveLoading />
              ) : media.status === 'error' ? (
                <ArchiveError onRetry={onRetry} />
              ) : (
                <article className={`${styles.sheet} ${styles.textSheet}`}>
                  <header className={styles.textHeader}>
                    <span className={styles.mono}>{item.code}</span>
                    <h3>{item.title}</h3>
                  </header>
                  {media.status === 'ready' && media.contentType.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={media.url} alt={item.title} className={styles.sheetImage} onError={onMediaError} />
                  ) : item.body ? (
                    <pre className={styles.textBody}>{item.body}</pre>
                  ) : (
                    <p className={styles.textEmpty}>لا محتوى إضافي لهذا الدليل.</p>
                  )}
                </article>
              )}
              {media.status !== 'loading' && media.status !== 'error' && stamps}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
