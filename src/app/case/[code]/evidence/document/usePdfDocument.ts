// ============================================================
// src/app/case/[code]/evidence/document/usePdfDocument.ts
// يجلب بايتات الـ PDF من الرابط الموقّت مرة واحدة، يفتحها بـ
// PDF.js، ويرجّع أبعاد كل صفحة (بمقياس 1) لحساب الملاءمة.
// الأخطاء التقنية تُسجَّل بالكونسول فقط (بدون الرابط) — الواجهة
// بتعرض رسالة داخل عالم اللعبة.
// ============================================================
'use client';

import { useEffect, useState } from 'react';
import { openPdfFromBytes, type PdfDocument } from './pdfjs';

export interface PageSize {
  width: number;
  height: number;
}

export type PdfState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; doc: PdfDocument; pages: PageSize[] };

/** المكوّن اللي بيستخدمه لازم ينعمل له key={url} — كل رابط جديد = تحميل جديد من الصفر. */
export function usePdfDocument(url: string): PdfState {
  const [state, setState] = useState<PdfState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;

    void (async () => {
      try {
        const res = await fetch(url, {
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
        if (!res.ok) throw new Error(`PDF_FETCH_STATUS_${res.status}`);

        const bytes = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;

        const opened = await openPdfFromBytes(bytes);
        if (cancelled) {
          opened.destroy();
          return;
        }
        destroy = opened.destroy;

        const pages: PageSize[] = [];
        for (let n = 1; n <= opened.doc.numPages; n += 1) {
          const page = await opened.doc.getPage(n);
          const vp = page.getViewport({ scale: 1 });
          pages.push({ width: vp.width, height: vp.height });
        }
        if (cancelled) return;

        setState({ status: 'ready', doc: opened.doc, pages });
      } catch (err: unknown) {
        if (cancelled) return;
        console.error(
          '[IFADA evidence] document load failed:',
          err instanceof Error ? err.message : 'unknown error',
        );
        setState({ status: 'error' });
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url]);

  return state;
}
