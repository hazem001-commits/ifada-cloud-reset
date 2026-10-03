// ============================================================
// src/app/case/[code]/board/BoardPiece.tsx
// قطعة واحدة على لوحة التحقيق. المادة تحتفظ بهويتها (نفس تصنيف ملف
// القضية): ورق، صورة/مراقبة بلقطة حقيقية مقصوصة، شريط صوتي، شاشة،
// أثر مادي، مكان. أفكار الفريق تبدو مكتوبة بيد اللاعبين — ليست حقيقة قضية.
// كل ما يُعرض هنا من بيانات العارض نفسه المصرّح بها (MaterialView).
// ============================================================
'use client';

import type { KeyboardEvent, PointerEvent } from 'react';
import { entryFromEvidence, IDENTITY_LABEL, type ArtifactIdentity } from '../casefile/caseFileModel';
import EvidenceThumb from '../casefile/EvidenceThumb';
import type { BoardItem, MaterialView, ReasoningKind } from './boardModel';
import s from './board.module.css';

const REASONING_LABEL: Record<ReasoningKind, string> = {
  fact: 'حقيقة سجّلها الفريق',
  question: 'سؤال مفتوح',
  hypothesis: 'فرضية الفريق',
};

const STYLE_FOR: Record<ArtifactIdentity, keyof typeof s> = {
  document: 'paper',
  record: 'paper',
  testimony: 'paper',
  photo: 'photo',
  cctv: 'photo',
  phone: 'photo',
  video: 'photo',
  audio: 'tape',
  digital: 'screen',
  physical: 'tag',
  lab: 'tag',
};

function objectIdentity(view: Extract<MaterialView, { kind: 'object' | 'location' }>): ArtifactIdentity | 'place' {
  if (view.kind === 'location') return 'place';
  if (view.category === 'device' || view.category === 'access' || view.category === 'archive') return 'digital';
  return 'physical';
}

export function describe(item: BoardItem, view: MaterialView | null): string {
  if (item.kind !== 'material') return `${REASONING_LABEL[item.kind]}: ${item.text}`;
  if (!view) return '';
  if (view.kind === 'evidence') {
    const id = entryFromEvidence(view.item).identity;
    return `${IDENTITY_LABEL[id]}: ${view.title}${view.access === 'restricted' ? ' (محجوب — يقرأه صاحب التخصص)' : ''}`;
  }
  return `${view.kind === 'location' ? 'مكان' : 'عنصر من الموقع'}: ${view.title}`;
}

export default function BoardPiece({
  sessionId,
  item,
  view,
  mine,
  selected,
  dimmed,
  lifted,
  layout,
  position,
  onPointerDown,
  onKeyDown,
  onActivate,
}: {
  sessionId: string;
  item: BoardItem;
  view: MaterialView | null;
  mine: boolean;
  selected: boolean;
  dimmed: boolean;
  lifted: boolean;
  layout: 'canvas' | 'stack';
  position: { x: number; y: number };
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onActivate: () => void;
}) {
  const style = layout === 'canvas' ? { left: `${position.x * 100}%`, top: `${position.y * 100}%` } : undefined;
  const common = {
    role: 'button' as const,
    tabIndex: 0,
    'aria-pressed': selected,
    'aria-label': describe(item, view),
    'data-selected': selected,
    'data-dim': dimmed,
    'data-lifted': lifted,
    'data-item-id': item.id,
    style,
    onPointerDown,
    onKeyDown,
    // نقرة بلوحة المفاتيح/لمس بلا سحب تُعالَج عبر onActivate من المستدعي.
    onClick: layout === 'stack' ? onActivate : undefined,
  };

  if (item.kind !== 'material') {
    return (
      <div {...common} className={`${s.item} ${s.reason}`} data-kind={item.kind}>
        <span className={s.kicker}>
          <span>{REASONING_LABEL[item.kind]}</span>
          {mine && <span>أنت</span>}
        </span>
        <span className={s.reasonText}>{item.text}</span>
      </div>
    );
  }
  if (!view) return null;

  if (view.kind === 'evidence') {
    const identity = entryFromEvidence(view.item).identity;
    const look = STYLE_FOR[identity];
    const imageable = view.access === 'readable' && view.hasMedia && (identity === 'photo' || identity === 'cctv' || identity === 'phone');
    return (
      <div {...common} className={`${s.item} ${s[look]}`} data-access={view.access}>
        {look === 'photo' && (
          <span className={s.thumb}>
            {imageable ? (
              <EvidenceThumb
                sessionId={sessionId}
                code={view.code}
                imageClassName={s.thumbImage}
                fallback={() => <span className={s.thumbFallback}>{view.clock ?? IDENTITY_LABEL[identity]}</span>}
              />
            ) : (
              <span className={s.thumbFallback}>{view.clock ?? IDENTITY_LABEL[identity]}</span>
            )}
          </span>
        )}
        <span className={s.kicker}>
          <span>{IDENTITY_LABEL[identity]}</span>
          <span>{view.clock ?? view.code}</span>
        </span>
        {look === 'tape' && <span className={s.tapeReel} aria-hidden="true" />}
        <span className={s.itemTitle}>{view.title}</span>
        {view.access === 'restricted' && <span className={s.itemNote}>يقرأه صاحب التخصص</span>}
      </div>
    );
  }

  const identity = objectIdentity(view);
  const look = identity === 'place' ? 'place' : STYLE_FOR[identity];
  return (
    <div {...common} className={`${s.item} ${s[look]}`}>
      <span className={s.kicker}>
        <span>{identity === 'place' ? 'مكان' : 'من الموقع'}</span>
        {!view.shared && <span>اكتشافك</span>}
      </span>
      <span className={s.itemTitle}>{view.title}</span>
    </div>
  );
}
