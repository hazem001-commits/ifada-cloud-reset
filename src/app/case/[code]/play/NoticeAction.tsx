// ============================================================
// src/app/case/[code]/play/NoticeAction.tsx
// الملاحظة: أول فعل في التحقيق، متاح لكل لاعب أياً كان تخصصه (الكل يرى
// العالم نفسه؛ التخصص يحدد ما تفعله بما تجده، لا ما تراه).
// إيماءة واحدة واضحة (لا "مسار أداة" تخصصي)، وتذكير هادئ بالقاعدة:
// ما تلاحظه يبقى لك حتى تقرّر مشاركته. الإجراء نفسه رجع من السيرفر.
// ============================================================
'use client';

import type { ObjectAction } from '@/types/investigationObjects';
import { IconEye } from '../investigation/icons';
import s from './play.module.css';

export default function NoticeAction({
  action,
  busy,
  onAction,
}: {
  action: ObjectAction;
  busy: boolean;
  onAction: (code: string) => void;
}) {
  return (
    <div className={s.notice}>
      <button type="button" className={s.noticeBtn} disabled={busy} aria-busy={busy} onClick={() => onAction(action.code)}>
        <IconEye size={17} />
        {action.label}
      </button>
      <p className={s.noticeText}>ما تلاحظه يبقى لك وحدك حتى تقرّر مشاركته.</p>
    </div>
  );
}
