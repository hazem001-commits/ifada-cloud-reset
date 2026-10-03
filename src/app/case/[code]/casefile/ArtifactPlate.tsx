// ============================================================
// src/app/case/[code]/casefile/ArtifactPlate.tsx
// "الأثر نفسه" — شكل بصري مختلف فعلاً لكل نوع مادة. كل النصوص
// المعروضة هون حقيقية (العنوان، مقتطف المحتوى المصرّح، توقيت القصة).
// الزخارف (مسطرة قياس، بكرات، ثقوب فيلم) أيقونية صريحة — لا بيانات
// مُختلقة: ما في موجة صوت وهمية، ولا اسم ملف، ولا رقم كاميرا.
// ============================================================
'use client';

import type { CaseFileEntry } from './caseFileModel';
import { excerptLines, IDENTITY_LABEL } from './caseFileModel';
import EvidenceThumb from './EvidenceThumb';
import a from './artifacts.module.css';

type PlateSize = 'tile' | 'hero';

export default function ArtifactPlate({
  sessionId,
  entry,
  size,
}: {
  sessionId: string;
  entry: CaseFileEntry;
  size: PlateSize;
}) {
  const lines = excerptLines(entry.body, size === 'hero' ? 7 : 4);
  const root = `${a.plate} ${size === 'hero' ? a.hero : ''}`;

  switch (entry.identity) {
    case 'physical':
      return (
        <div className={`${root} ${a.physical}`} aria-hidden="true">
          <div className={a.tag}>
            <span className={a.tagHole} />
            <span className={a.tagKind}>{IDENTITY_LABEL.physical}</span>
            <span className={a.tagTitle}>{entry.title}</span>
            {size === 'hero' && lines[0] && <span className={a.tagNote}>{lines[0]}</span>}
          </div>
          <div className={a.scale} />
        </div>
      );

    case 'lab':
      return (
        <div className={`${root} ${a.lab}`} aria-hidden="true">
          <div className={a.labSheet}>
            <div className={a.labHead}>
              <span className={a.labRing} />
              <span>{IDENTITY_LABEL.lab}</span>
              {entry.processing && <span className={a.labPending}>التحليل جارٍ</span>}
            </div>
            <div className={a.labResult}>
              {lines.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          </div>
        </div>
      );

    case 'digital':
      return (
        <div className={`${root} ${a.digital}`} aria-hidden="true">
          <div className={a.termBar}>
            <span className={a.termDot} />
            <span>{IDENTITY_LABEL.digital}</span>
            {entry.clock && <span className={`${a.termClock} mono`}>{entry.clock}</span>}
          </div>
          <ol className={a.termLines}>
            {lines.map((l, i) => (
              <li key={i}>
                <span className={a.lineNo}>{String(i + 1).padStart(2, '0')}</span>
                <span className={a.lineText}>{l}</span>
              </li>
            ))}
            <li className={a.caretLine}>
              <span className={a.lineNo}>{String(lines.length + 1).padStart(2, '0')}</span>
              <span className={a.caret} />
            </li>
          </ol>
        </div>
      );

    case 'document':
    case 'record':
    case 'testimony':
      return (
        <div className={`${root} ${a.paperDesk}`} aria-hidden="true">
          <div className={a.paperStack}>
            <div className={`${a.sheet} ${entry.identity === 'record' ? a.sheetRecord : ''} ${entry.identity === 'testimony' ? a.sheetTestimony : ''}`}>
              {entry.identity === 'record' && <div className={a.recordBand}>{IDENTITY_LABEL.record}</div>}
              {entry.identity === 'testimony' && <div className={a.quote}>”</div>}
              <div className={a.sheetTitle}>{entry.title}</div>
              <div className={a.sheetLines}>
                {lines.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      );

    case 'cctv':
      return (
        <div className={`${root} ${a.cctv}`} aria-hidden="true">
          <div className={a.monitor}>
            <EvidenceThumb
              sessionId={sessionId}
              code={entry.code}
              className={a.screen}
              imageClassName={a.screenImage}
              fallback={(s) => <span className={a.noSignal}>{s === 'loading' ? 'جاري تحميل الإطار…' : 'افتح الدليل لفحص الإطار'}</span>}
            />
            <span className={a.scanlines} />
            {entry.clock && <span className={`${a.osd} mono`}>{entry.clock}</span>}
            <span className={a.osdLabel}>{IDENTITY_LABEL.cctv}</span>
          </div>
        </div>
      );

    case 'photo':
      return (
        <div className={`${root} ${a.photoDesk}`} aria-hidden="true">
          <div className={a.print}>
            <EvidenceThumb
              sessionId={sessionId}
              code={entry.code}
              className={a.printImageWrap}
              imageClassName={a.printImage}
              fallback={() => <span className={a.printEmpty}>{IDENTITY_LABEL.photo}</span>}
            />
          </div>
        </div>
      );

    case 'phone':
      return (
        <div className={`${root} ${a.phoneDesk}`} aria-hidden="true">
          <div className={a.device}>
            <EvidenceThumb
              sessionId={sessionId}
              code={entry.code}
              className={a.deviceScreen}
              imageClassName={a.deviceImage}
              fallback={() => <span className={a.deviceEmpty}>{IDENTITY_LABEL.phone}</span>}
            />
          </div>
        </div>
      );

    case 'audio':
      return (
        <div className={`${root} ${a.audio}`} aria-hidden="true">
          <div className={a.deck}>
            <span className={a.reel} />
            <span className={a.reel} />
            <span className={a.tape} />
          </div>
          <div className={a.deckLabel}>
            <span>{IDENTITY_LABEL.audio}</span>
            {entry.clock && <span className="mono">{entry.clock}</span>}
          </div>
        </div>
      );

    case 'video':
      return (
        <div className={`${root} ${a.video}`} aria-hidden="true">
          <span className={a.sprockets} />
          <div className={a.frame}>
            <span className={a.play} />
            {entry.clock && <span className={`${a.osd} mono`}>{entry.clock}</span>}
          </div>
          <span className={a.sprockets} />
        </div>
      );
  }
}
