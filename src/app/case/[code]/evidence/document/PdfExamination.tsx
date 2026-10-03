// ============================================================
// src/app/case/[code]/evidence/document/PdfExamination.tsx
// فحص وثيقة PDF: صفحة واحدة واضحة على الطاولة، تنقّل صفحات،
// تكبير بخطوات ثابتة فوق "الملاءمة" (عرض/صفحة كاملة). الملاءمة
// تُحسب من حجم سطح الفحص الفعلي، فما في تمرير أفقي إلا لما
// اللاعب نفسه يكبّر فوق عرض الطاولة.
// ============================================================
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { EvidenceItem } from '@/types/case';
import DocumentMetadata from './DocumentMetadata';
import DocumentToolbar, { type FitMode } from './DocumentToolbar';
import PdfPageCanvas from './PdfPageCanvas';
import { ArchiveError, ArchiveLoading } from './ArchiveStates';
import { usePdfDocument } from './usePdfDocument';
import { useStageSize } from './useStageSize';
import type { DocumentVariant } from './documentVariant';
import styles from './DocumentExamination.module.css';

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;
const DEFAULT_ZOOM_INDEX = 1;
const DEFAULT_FIT: FitMode = 'width';
/** حتى على شاشة عريضة، "ملاءمة العرض" ما بتكبّر الورقة أكثر من هيك — تضل الطاولة ظاهرة حولها. */
const MAX_FIT_SCALE = 1.15;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export default function PdfExamination({
  url,
  item,
  variant,
  metaId,
  stamps,
  onRetry,
}: {
  url: string;
  item: EvidenceItem;
  variant: DocumentVariant;
  metaId: string;
  stamps: ReactNode;
  onRetry: () => void;
}) {
  const pdf = usePdfDocument(url);
  const stageRef = useRef<HTMLDivElement>(null);
  const stage = useStageSize(stageRef);

  const [page, setPage] = useState(1);
  const [fitMode, setFitMode] = useState<FitMode>(DEFAULT_FIT);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [renderFailed, setRenderFailed] = useState(false);

  const pageCount = pdf.status === 'ready' ? pdf.doc.numPages : 0;
  const size = pdf.status === 'ready' ? pdf.pages[page - 1] : undefined;

  let scale = 0;
  if (size && stage.width > 0 && stage.height > 0) {
    const byWidth = Math.min(stage.width / size.width, MAX_FIT_SCALE);
    const fit = fitMode === 'width' ? byWidth : Math.min(byWidth, stage.height / size.height);
    scale = Math.round(fit * (ZOOM_STEPS[zoomIndex] ?? 1) * 100) / 100;
  }
  const zoomPercent = scale > 0 ? Math.round(scale * 100) : null;

  const goTo = useCallback(
    (next: number) => {
      if (next < 1 || next > pageCount) return;
      setPage(next);
      stageRef.current?.scrollTo({ top: 0, left: 0 });
    },
    [pageCount],
  );

  const zoomBy = useCallback((delta: number) => {
    setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + delta)));
  }, []);

  const reset = useCallback(() => {
    setFitMode(DEFAULT_FIT);
    setZoomIndex(DEFAULT_ZOOM_INDEX);
  }, []);

  const onRenderError = useCallback(() => setRenderFailed(true), []);

  // لما الوثيقة تجهز، ابدأ من رأس الصفحة (مش من مكان حالة التحميل).
  useEffect(() => {
    if (pdf.status === 'ready') stageRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pdf.status]);

  useEffect(() => {
    if (pdf.status !== 'ready') return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      // اتجاه القراءة عربي: السهم الأيسر = الصفحة التالية.
      const actions: Record<string, () => void> = {
        ArrowLeft: () => goTo(page + 1),
        PageDown: () => goTo(page + 1),
        ArrowRight: () => goTo(page - 1),
        PageUp: () => goTo(page - 1),
        '+': () => zoomBy(1),
        '=': () => zoomBy(1),
        '-': () => zoomBy(-1),
        '0': reset,
      };
      const action = actions[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pdf.status, page, goTo, zoomBy, reset]);

  const failed = pdf.status === 'error' || renderFailed;

  return (
    <div className={styles.workstation} data-variant={variant}>
      <DocumentMetadata
        id={metaId}
        item={item}
        variant={variant}
        pageCount={pageCount || null}
        zoomPercent={failed ? null : zoomPercent}
      />

      <div className={styles.stageWrap}>
        <div ref={stageRef} className={styles.stage} aria-describedby={metaId}>
          <div className={styles.desk}>
            <div className={styles.sheetFrame} data-variant={variant} data-stacked={pageCount > 1 || undefined}>
              {failed ? (
                <ArchiveError onRetry={onRetry} />
              ) : pdf.status === 'ready' && size && scale > 0 ? (
                <div key={page} className={`${styles.sheet} ${styles.pdfSheet}`}>
                  <PdfPageCanvas
                    doc={pdf.doc}
                    pageNumber={page}
                    scale={scale}
                    width={size.width * scale}
                    height={size.height * scale}
                    label={`${item.code} — ${item.title} — صفحة ${page} من ${pageCount}`}
                    onRenderError={onRenderError}
                  />
                </div>
              ) : (
                <ArchiveLoading />
              )}
              {!failed && pdf.status === 'ready' && stamps}
            </div>
          </div>
        </div>

        {pdf.status === 'ready' && !failed && (
          <DocumentToolbar
            page={page}
            pageCount={pageCount}
            zoomPercent={zoomPercent ?? 100}
            canZoomIn={zoomIndex < ZOOM_STEPS.length - 1}
            canZoomOut={zoomIndex > 0}
            fitMode={fitMode}
            isDefaultView={fitMode === DEFAULT_FIT && zoomIndex === DEFAULT_ZOOM_INDEX}
            onPrev={() => goTo(page - 1)}
            onNext={() => goTo(page + 1)}
            onZoomIn={() => zoomBy(1)}
            onZoomOut={() => zoomBy(-1)}
            onToggleFit={() => {
              setFitMode((m) => (m === 'width' ? 'page' : 'width'));
              setZoomIndex(DEFAULT_ZOOM_INDEX);
            }}
            onReset={reset}
          />
        )}
      </div>
    </div>
  );
}
