// ============================================================
// src/app/case/[code]/play/TeamPresence.tsx
// حضور الفريق + نبض التحقيق (Investigation Pulse) كآلية لعب.
//
// كل زميل "بطاقة حضور": حرف اسمه، قدراته (أيقونات التخصص)، وحين يكتشف
// شيئاً بخصوصية — نبضة واحدة تتسع من بطاقته ويظهر تحتها سطر هادئ:
// "اكتشاف خاص · جهاز". لا ماذا، لا أين، لا لماذا. تهدأ بعد دقائق وتبقى
// في "أثر الفريق" (ورقة: ذاكرة اجتماعية للتحقيق، لا قائمة أدلة).
// نتيجة معالجة وصلت بلا فاعل = "وصلت نتيجة" على الشريط نفسه.
//
// المدخل الوحيد: runtime_state المنقّاة (sanitizePulses: id/فاعل/فئة/وقت).
// لا إشعارات منبثقة، لا عدّادات، لا شارات تقدّم.
// ============================================================
'use client';

import { useEffect, useRef, useState } from 'react';
import { specLabel, type Specialization } from '@/types/database';
import { PULSE_CATEGORY_LABEL, pulseLine } from '@/lib/runtime/pulse';
import { freshSystemPulses, newPulseIds, presence, sinceLabel } from '@/lib/play/model';
import { playBlip } from '../evidence/sound';
import { IconDevice, IconEye, IconFile, IconFlask } from '../investigation/icons';
import { usePlay } from './PlayContext';
import Sheet from './Sheet';
import s from './play.module.css';

const SPEC_GLYPH: Record<Specialization, () => React.ReactElement> = {
  field: () => <IconEye size={11} />,
  digital: () => <IconDevice size={11} />,
  forensics: () => <IconFlask size={11} />,
  records: () => <IconFile size={11} />,
};

const TICK_MS = 20_000;

export default function TeamPresence() {
  const play = usePlay();
  const [now, setNow] = useState(() => Date.now());
  const [trail, setTrail] = useState(false);
  const [announce, setAnnounce] = useState('');
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const pulses = play?.runtime.pulses;
  const myId = play?.myId ?? null;
  const members = play?.members;

  // وصول نبضة زميل جديدة: صوت خفيف (يحترم الكتم) + إعلان لقارئ الشاشة.
  // أول قراءة = ما حدث قبل دخولي: يُسجَّل بهدوء بلا "وصول".
  useEffect(() => {
    if (!pulses || !members) return;
    if (seen.current === null) {
      seen.current = new Set(pulses.map((p) => p.id));
      return;
    }
    const fresh = newPulseIds(seen.current, pulses);
    if (fresh.length === 0) return;
    for (const id of fresh) seen.current.add(id);
    const theirs = pulses.filter((p) => fresh.includes(p.id) && p.actorId !== myId);
    if (theirs.length === 0) return;
    const names = new Map(members.map((m) => [m.userId, m.displayName]));
    setAnnounce(pulseLine(theirs[0]!, names, myId));
    setNow(Date.now());
    playBlip('click');
  }, [pulses, members, myId]);

  if (!play || !play.live || play.members.length === 0) return null;

  const people = presence(play.members, play.holders, play.runtime.pulses, play.myId, now);
  const system = freshSystemPulses(play.runtime.pulses, now)[0];
  const names = new Map(play.members.map((m) => [m.userId, m.displayName]));

  return (
    <>
      <div className={s.presence} role="group" aria-label="فريق التحقيق">
        <button type="button" className={s.presenceRow} onClick={() => setTrail(true)} aria-describedby="presence-hint">
          {people.map((p) => (
            <span key={p.userId} className={s.tag} data-live={p.live ? 'true' : 'false'} data-me={p.isMe ? 'true' : 'false'}>
              <span className={s.monogram} aria-hidden="true">
                {p.live && <span key={p.live.id} className={s.ripple} />}
                {(p.name.trim()[0] ?? '؟').toUpperCase()}
              </span>
              <span className={s.tagText}>
                <span className={s.tagName}>{p.isMe ? 'أنت' : p.name}</span>
                {p.live && !p.isMe ? (
                  <span key={p.live.id} className={s.tagPulse}>
                    <span className={s.tagPulseLead}>اكتشاف خاص · </span>
                    {PULSE_CATEGORY_LABEL[p.live.category]}
                  </span>
                ) : (
                  <span className={s.tagSpecs} aria-label={p.specs.map(specLabel).join('، ')}>
                    {p.specs.map((sp) => (
                      <span key={sp} className={s.specGlyph} title={specLabel(sp)}>
                        {SPEC_GLYPH[sp]()}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </span>
          ))}
          {system && (
            <span key={system.id} className={s.tag} data-live="true" data-system="true">
              <span className={s.monogram} aria-hidden="true">
                <span className={s.ripple} />
                ◉
              </span>
              <span className={s.tagText}>
                <span className={s.tagName}>وصلت نتيجة</span>
                <span className={s.tagPulse}>{PULSE_CATEGORY_LABEL[system.category]}</span>
              </span>
            </span>
          )}
        </button>
      </div>

      <span id="presence-hint" className="sr-only">
        افتح أثر الفريق — ما حدث عند زملائك
      </span>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      <Sheet open={trail} title="أثر الفريق" kicker="ما حدث عند زملائك — بلا تفاصيل" onClose={() => setTrail(false)}>
        {play.runtime.pulses.length === 0 ? (
          <p className={s.empty}>لم يلاحظ أحد شيئاً بخصوصية بعد. حين يجد زميل شيئاً لم يشاركه، ستشعر به هنا — لا بما وجده.</p>
        ) : (
          <ol className={s.trail}>
            {play.runtime.pulses.map((p) => (
              <li key={p.id} className={s.trailItem} data-me={p.actorId === play.myId ? 'true' : 'false'}>
                <span className={s.trailDot} aria-hidden="true" />
                <span className={s.trailLine}>{pulseLine(p, names, play.myId)}</span>
                <time className={s.trailTime} dateTime={p.at}>
                  {sinceLabel(p.at, now)}
                </time>
              </li>
            ))}
          </ol>
        )}
        <p className={s.trailNote}>النبضة تقول إن شيئاً حدث فقط. اسأل زميلك — أو انتظر أن يشاركه.</p>
      </Sheet>
    </>
  );
}
