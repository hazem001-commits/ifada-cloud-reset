// ============================================================
// src/app/case/[code]/investigation/inquiry/InquiryResults.tsx
// عرض رد "اسأل التحقيق" — بلا أي نص يكتبه نموذج لغوي:
//   بحث   → مقتطفات حرفية من مواد متاحة لي، كل واحد بمرجع حقيقي
//   أداة  → أي أداة تحقيق حقيقية تساعد، وزر أفتحها أنا بنفسي
//   غيره  → رسالة ثابتة هادئة (غير متاح بعد / لا نحسم عنك / لم نفهم)
// التمييز المعرفي: مصدر (نص كما هو) ≠ ادعاء (كلام شخص) ≠ تفسير البحث.
// ============================================================
'use client';

import { specLabel } from '@/types/database';
import type { InquiryResponse, OpenTarget, SearchResult } from '@/lib/inquiry/types';
import q from './inquiry.module.css';

function ResultRow({ r, onOpen }: { r: SearchResult; onOpen: (t: OpenTarget) => void }) {
  return (
    <li className={q.result} data-epistemic={r.epistemic}>
      <p className={q.resultMeta}>
        <span>{r.sourceLabel}</span>
        <span className={q.epistemic} data-epistemic={r.epistemic}>
          {r.epistemic === 'claim' ? 'ادعاء — كلام شخص' : 'مصدر'}
        </span>
        {r.ref.type === 'evidence' && <span className={q.tech}>{r.ref.code}</span>}
        {r.clock && <span className={q.tech}>{r.clock}</span>}
      </p>
      <p className={q.resultTitle}>{r.title}</p>
      {r.excerpt ? (
        <blockquote className={q.excerpt}>{r.excerpt}</blockquote>
      ) : r.access === 'title' && r.ownerSpec ? (
        <p className={q.withheld}>المحتوى لدى تخصص {specLabel(r.ownerSpec)} في فريقك.</p>
      ) : null}
      {r.open && (
        <button type="button" className={q.open} onClick={() => r.open && onOpen(r.open)}>
          افتح المصدر
          <span aria-hidden="true">←</span>
        </button>
      )}
    </li>
  );
}

export default function InquiryResults({
  response,
  onOpen,
  onExample,
}: {
  response: InquiryResponse;
  onOpen: (target: OpenTarget) => void;
  onExample: (text: string) => void;
}) {
  switch (response.kind) {
    case 'search':
      return (
        <div className={q.body}>
          <p className={q.interpretation}>
            <span>
              بحثنا عن: <bdi className={q.terms}>{response.interpretation.terms.join(' · ')}</bdi>
            </span>
            <span className={q.interpretTag}>
              {response.interpretation.by === 'model' ? 'تفسير آلي لسؤالك' : 'مطابقة نصية'}
            </span>
          </p>
          {response.results.length === 0 ? (
            <p className={q.quiet}>لا توجد مطابقة في المواد المتاحة لك حالياً.</p>
          ) : (
            <>
              <p className={q.note}>مقتطفات حرفية من مواد متاحة لك — ليست استنتاجاً.</p>
              <ul className={q.results}>
                {response.results.map((r) => (
                  <ResultRow key={`${r.ref.type}:${r.ref.code}`} r={r} onOpen={onOpen} />
                ))}
              </ul>
            </>
          )}
        </div>
      );
    case 'tool':
      return (
        <div className={q.body}>
          <p className={q.message}>{response.message}</p>
          {response.open && response.openLabel && (
            <button type="button" className={q.toolOpen} onClick={() => response.open && onOpen(response.open)}>
              {response.openLabel}
              <span aria-hidden="true">←</span>
            </button>
          )}
        </div>
      );
    case 'fallback':
      return (
        <div className={q.body}>
          <p className={q.message}>{response.message}</p>
          <ul className={q.examples} aria-label="أمثلة">
            {response.examples.map((ex) => (
              <li key={ex}>
                <button type="button" className={q.example} onClick={() => onExample(ex)}>
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
    default:
      return (
        <div className={q.body}>
          <p className={q.message}>{response.message}</p>
        </div>
      );
  }
}
