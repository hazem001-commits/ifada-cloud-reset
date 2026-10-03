// ============================================================
// src/app/case/[code]/casefile/EntryMarks.tsx
// علامات حالة حقيقية فقط + إجراء التثبيت على اللوحة.
// ما في "شاركه زميل" — ما عنا بيانات مين شارك، فما بنخترعها.
// ============================================================
'use client';

import type { CaseFileEntry } from './caseFileModel';
import s from './casefile.module.css';

export function EntryTags({
  entry,
  unopened,
  reviewed,
  pinned,
}: {
  entry: CaseFileEntry;
  unopened: boolean;
  reviewed: boolean;
  pinned: boolean;
}) {
  return (
    <span className={s.chips}>
      {unopened && <span className={`${s.chip} ${s.chipNew}`}>جديد</span>}
      {entry.processing && (
        <span className={`${s.chip} ${s.chipLive}`}>
          <span className={s.liveDot} aria-hidden="true" />
          قيد التحليل
        </span>
      )}
      {entry.privateToMe && <span className={`${s.chip} ${s.chipPrivate}`}>خاص بك — لم تشاركه</span>}
      {entry.channelPrivate && <span className={`${s.chip} ${s.chipPrivate}`}>خاص بك — للربط المشترك فقط</span>}
      {entry.sharedObject && <span className={s.chip}>مشترك مع الفريق</span>}
      {reviewed && <span className={`${s.chip} ${s.chipReviewed}`}>✓ تمت مراجعته</span>}
      {pinned && <span className={`${s.chip} ${s.chipPinned}`}>على اللوحة</span>}
    </span>
  );
}

function PinGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="5" r="3.2" fill="currentColor" />
      <path d="M8 8.2 V15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function PinAction({
  pinned,
  busy,
  onPin,
}: {
  pinned: boolean;
  busy: boolean;
  onPin: () => void;
}) {
  return (
    <button
      type="button"
      className={s.pin}
      data-pinned={pinned}
      disabled={busy || pinned}
      onClick={onPin}
      title={pinned ? 'موجود على لوحة التحقيق' : 'ثبّته على لوحة التحقيق المشتركة'}
    >
      <span className={s.pinGlyph}>
        <PinGlyph />
      </span>
      {pinned ? 'على اللوحة' : 'أضف للوحة'}
    </button>
  );
}
