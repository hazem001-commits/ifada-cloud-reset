// ============================================================
// src/app/case/[code]/play/LeadThreads.tsx
// الخيوط: أسئلة تستحق المتابعة — زخم تحقيقي، لا قائمة مهام.
//
//   خيط خاص بي  = بصيرة وصلتني لأني أقرأ مادتها؛ زملائي لا يعرفون بها.
//                 أقرّر أنا متى أشاركها (share_lead) — تصبح خيط الفريق.
//   خيط الفريق  = سؤال يعرفه الجميع.
//   مُتابَع      = حصلت خطوة حقيقية عليه. مُغلق = صار له جواب بيد الفريق.
//
// "إلى أين قد يقود" اتجاه من عرض القضية (عنصر أراه / غرفة الاستجواب) —
// ليس هدفاً ولا جواباً، ولا يكشف عنصراً لا أراه (المحرك يتحقق قبل التركيز).
// الخيوط لا تغطي العالم أبداً: شاشة عريضة → زر هادئ في رأس القضية (من
// أي تبويب) يفتح ورقة جانبية؛ هاتف → زر بمتناول الإبهام في المشهد → ورقة.
// ============================================================
'use client';

import { useEffect, useRef, useState } from 'react';
import type { Lead } from '@/lib/runtime/types';
import type { LeadPointer } from '@/cases/presentation';
import { useCasePresentation } from '@/cases/CaseContext';
import { own } from '@/cases/presentation';
import { threadGroups } from '@/lib/play/model';
import { IconLock, IconTeam, IconTransmit } from '../investigation/icons';
import { usePlay } from './PlayContext';
import Sheet from './Sheet';
import s from './play.module.css';

const STATUS: Record<Lead['status'], string> = { open: 'مفتوح', followed: 'قيد المتابعة', closed: 'له جواب' };
const NEW_MS = 7000;

export default function LeadThreads({
  variant,
  onFollow,
  onBriefing,
}: {
  /** header = رأس القضية (شاشة عريضة)؛ pill = زر المشهد على الهاتف. */
  variant: 'header' | 'pill';
  onFollow: (pointer: LeadPointer) => void;
  onBriefing?: () => void;
}) {
  const play = usePlay();
  const { opening } = useCasePresentation();
  const [sheet, setSheet] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const leads = play?.runtime.leads;
  // خيط جديد (أو صار للفريق): يُحبَّر مرة واحدة. أول قراءة = هادئة.
  useEffect(() => {
    if (!leads) return;
    const keys = leads.map((l) => `${l.code}:${l.shared ? 's' : 'p'}:${l.status}`);
    if (seen.current === null) {
      seen.current = new Set(keys);
      return;
    }
    const arrived = keys.filter((k) => !seen.current!.has(k));
    if (arrived.length === 0) return;
    for (const k of arrived) seen.current.add(k);
    const codes = new Set(arrived.map((k) => k.split(':')[0]!));
    setFresh(codes);
    const id = window.setTimeout(() => setFresh(new Set()), NEW_MS);
    return () => window.clearTimeout(id);
  }, [leads]);

  if (!play || !play.live) return null;
  const { live, settled } = threadGroups(play.runtime.leads);
  if (live.length === 0 && settled.length === 0) return null;

  async function share(code: string) {
    if (!play) return;
    setBusy(code);
    await play.shareLead(code);
    setBusy(null);
  }

  const card = (l: Lead) => {
    const pointer = opening ? own(opening.leadPointers, l.code) : undefined;
    const privateMine = !l.shared && l.mine;
    return (
      <li key={l.code} className={s.thread} data-private={privateMine ? 'true' : 'false'} data-status={l.status} data-new={fresh.has(l.code) ? 'true' : 'false'}>
        <p className={s.threadMeta}>
          {privateMine ? (
            <>
              <IconLock size={12} /> تعرفه وحدك
            </>
          ) : (
            <>
              <IconTeam size={12} /> خيط الفريق
            </>
          )}
          {l.status !== 'open' && <span className={s.threadStatus}>{STATUS[l.status]}</span>}
        </p>
        <p className={s.threadLabel}>{l.label}</p>
        <div className={s.threadActions}>
          {pointer && l.status !== 'closed' && (
            <button
              type="button"
              className={s.threadLink}
              onClick={() => {
                setSheet(false);
                onFollow(pointer);
              }}
            >
              <span aria-hidden="true">↖</span> {pointer.label}
            </button>
          )}
          {privateMine && (
            <button type="button" className={s.threadShare} disabled={busy === l.code} onClick={() => void share(l.code)}>
              <IconTransmit size={13} /> {busy === l.code ? 'جارٍ…' : 'أخبر الفريق'}
            </button>
          )}
        </div>
      </li>
    );
  };

  const anyNew = live.some((l) => fresh.has(l.code));
  // سطر الرأس ظاهر دائماً (ومشاركة الشاشة شائعة): خيوط الفريق فقط، لا بصيرتي الخاصة.
  const newest = live.find((l) => l.shared);

  return (
    <>
      {variant === 'header' ? (
        <button
          type="button"
          className={s.threadsHead}
          data-new={anyNew ? 'true' : 'false'}
          onClick={() => setSheet(true)}
          aria-label={`خيوط التحقيق: ${live.length} مفتوح`}
        >
          <span className={s.pillThread} aria-hidden="true" />
          <span className={s.headWord}>خيوط</span>
          <span className={s.pillCount}>{live.length.toLocaleString('ar')}</span>
          {newest && (
            <span key={newest.code} className={s.headTicker} data-private={!newest.shared ? 'true' : 'false'}>
              {newest.label}
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          className={s.threadsPill}
          data-new={anyNew ? 'true' : 'false'}
          onClick={() => setSheet(true)}
          aria-label={`خيوط التحقيق: ${live.length} مفتوح`}
        >
          <span className={s.pillThread} aria-hidden="true" />
          خيوط
          <span className={s.pillCount}>{live.length.toLocaleString('ar')}</span>
        </button>
      )}

      <Sheet open={sheet} title="خيوط التحقيق" kicker="ما لم يُجَب بعد" onClose={() => setSheet(false)}>
        {live.length > 0 && <ul className={s.threadList}>{live.map(card)}</ul>}
        {settled.length > 0 && (
          <>
            <h3 className={s.sheetSection}>لها جواب بيد الفريق</h3>
            <ul className={s.threadList}>{settled.map(card)}</ul>
          </>
        )}
        {onBriefing && (
          <button
            type="button"
            className={s.threadsMore}
            onClick={() => {
              setSheet(false);
              onBriefing();
            }}
          >
            أعد قراءة البلاغ
          </button>
        )}
      </Sheet>
    </>
  );
}
