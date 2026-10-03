// ============================================================
// src/app/case/[code]/evidence/document/PdfPageCanvas.tsx
// يرسم صفحة PDF واحدة على canvas تملكه IFADA — بحدة تناسب كثافة
// بكسلات الشاشة. كل رسم جديد (تكبير/صفحة) يصير على canvas جديد
// ويُبدَّل لما يخلص، فما في وميض ولا تعارض بين عمليتي رسم.
// النص المستخرج يُعرض مخفياً بصرياً لقارئات الشاشة فقط.
// ============================================================
'use client';

import { useEffect, useRef, useState } from 'react';
import type { PdfDocument } from './pdfjs';
import styles from './DocumentExamination.module.css';

const MAX_PIXEL_RATIO = 3;

function isCancellation(err: unknown): boolean {
  return err instanceof Error && err.name === 'RenderingCancelledException';
}

export default function PdfPageCanvas({
  doc,
  pageNumber,
  scale,
  width,
  height,
  label,
  onRenderError,
}: {
  doc: PdfDocument;
  pageNumber: number;
  scale: number;
  /** أبعاد CSS النهائية للصفحة (بالبكسل) — تحجز المكان قبل ما يخلص الرسم. */
  width: number;
  height: number;
  label: string;
  onRenderError: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [pageText, setPageText] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        // أرضية 1: لو المتصفح مصغّر (zoom < 100%) ما بدنا صفحة ضبابية لما يرجع يكبّر.
        const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_PIXEL_RATIO);

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.className = styles.pageCanvas ?? '';
        canvas.setAttribute('aria-hidden', 'true');

        const renderTask = page.render({
          canvas,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        task = renderTask;
        await renderTask.promise;
        if (cancelled) return;

        host.replaceChildren(canvas);

        const content = await page.getTextContent();
        if (cancelled) return;
        const text = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          // PDF.js بيرجّع العربي بأشكال العرض (ﻗﺴﻢ) — NFKC يرجّعها لحروف عادية لقارئ الشاشة.
          .normalize('NFKC')
          .replace(/\s+/g, ' ')
          .trim();
        setPageText(text);
      } catch (err: unknown) {
        if (cancelled || isCancellation(err)) return;
        console.error(
          '[IFADA evidence] page render failed:',
          err instanceof Error ? err.message : 'unknown error',
        );
        onRenderError();
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, scale, onRenderError]);

  return (
    <div className={styles.pageSurface} style={{ width: `${width}px`, height: `${height}px` }}>
      <div ref={hostRef} className={styles.pageHost} role="img" aria-label={label} />
      {pageText && <p className={styles.srOnly}>{pageText}</p>}
    </div>
  );
}
