// ============================================================
// src/app/case/[code]/evidence/document/pdfjs.ts
// تحميل PDF.js كسولاً (فقط لما تنفتح وثيقة PDF) مع worker واحد
// مشترك. لا عارض PDF تبع المتصفح — IFADA ترسم الصفحات بنفسها.
// ============================================================
'use client';

import type * as PdfJs from 'pdfjs-dist';

export type PdfJsModule = typeof PdfJs;
export type PdfDocument = PdfJs.PDFDocumentProxy;

let loader: Promise<PdfJsModule> | null = null;

export function loadPdfJs(): Promise<PdfJsModule> {
  if (!loader) {
    loader = import('pdfjs-dist')
      .then((pdfjs) => {
        if (!pdfjs.GlobalWorkerOptions.workerPort) {
          pdfjs.GlobalWorkerOptions.workerPort = new Worker(
            new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
            { type: 'module' },
          );
        }
        return pdfjs;
      })
      .catch((err: unknown) => {
        // اسمح بمحاولة ثانية بدل ما نعلق على وعد مرفوض للأبد.
        loader = null;
        throw err;
      });
  }
  return loader;
}

/**
 * يحمّل وثيقة من بايتات جاهزة (مش من رابط) — الرابط الموقّت
 * يُستهلك مرة واحدة بـ fetch، وما بيضل PDF.js يطلب منه أجزاء
 * بعد انتهاء صلاحيته.
 */
export async function openPdfFromBytes(
  bytes: Uint8Array,
): Promise<{ doc: PdfDocument; destroy: () => void }> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    data: bytes,
    // v6 ما عاد فيه eval أصلاً (خيار isEvalSupported انشال). XFA مطفي:
    // ما في نماذج تفاعلية ولا طبقة روابط — الوثيقة للقراءة فقط.
    enableXfa: false,
    disableAutoFetch: true,
  });
  const doc = await task.promise;
  return { doc, destroy: () => void task.destroy() };
}
