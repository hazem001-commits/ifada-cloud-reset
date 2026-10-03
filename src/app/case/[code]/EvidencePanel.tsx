// ============================================================
// src/app/case/[code]/EvidencePanel.tsx
// قائمة الأدلة. الدليل خارج تخصصك بيظهر محجوباً —
// بتعرف إنه موجود، بس لازم صاحب التخصص يقرأه لك.
// ============================================================
'use client';

import { useState } from 'react';
import { specLabel, type LobbyMember, type Specialization } from '@/types/database';
import { KIND_LABEL, type EvidenceItem, type UnlockableItem } from '@/types/case';
import EvidenceExaminationRoom from './evidence/EvidenceExaminationRoom';
import { isReviewed } from './evidence/reviewed';
import { useSpecializationHolders } from './useSpecializationHolders';

export default function EvidencePanel({
  sessionId,
  evidence,
  unlockable,
  mySpecs,
  myId,
  members,
  onUnlock,
}: {
  sessionId: string;
  evidence: EvidenceItem[];
  unlockable: UnlockableItem[];
  /** تخصصاتي الفعلية (الأساسي أولاً). */
  mySpecs: Specialization[];
  myId: string;
  members: LobbyMember[];
  onUnlock: (code: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [examining, setExamining] = useState<EvidenceItem | null>(null);

  const holders = useSpecializationHolders(sessionId);

  // مين تسأل عن دليل خارج صلاحيتك: كل زميل ماسك التخصص فعلياً (مش بس
  // اللي تخصصه الأساسي هو)، بترتيب انضمامهم. بجلسات 5–8 ممكن أكثر من
  // واحد يمسك نفس التخصص بصلاحية كاملة — بنذكرهم كلهم بدل ما نختار واحد.
  // لو ما في حامل معروف (لسا بيتحمّل أو حالة ناقصة): اسم التخصص نفسه.
  function holderName(spec: Specialization): string {
    const ids = holders?.[spec] ?? [];
    const names = members
      .filter((m) => m.userId !== myId && ids.includes(m.userId))
      .map((m) => m.displayName);
    return names.length > 0 ? names.join(' أو ') : specLabel(spec);
  }

  return (
    <main className="shell" style={{ width: '100%' }}>
      {unlockable.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: 'var(--t-lg)' }}>خطوط متاحة للمتابعة</h2>
          <p className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: '0.4rem' }}>
            هاي ضمن {mySpecs.length > 1 ? 'تخصصاتك' : 'تخصصك'}. افتح اللي بتشوفه مناسب — الفريق كله بيشوف إنه انفتح.
          </p>

          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              marginTop: '0.9rem',
              display: 'grid',
              gap: '1px',
            }}
          >
            {unlockable.map((u) => (
              <li
                key={u.code}
                style={{
                  background: 'var(--ink-raised)',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  borderInlineStart: '2px solid var(--signal)',
                }}
              >
                <span>
                  <span className="mono muted" style={{ fontSize: 'var(--t-xs)' }}>
                    {u.code}
                  </span>{' '}
                  {u.title}
                  <br />
                  <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>
                    {KIND_LABEL[u.kind]}
                  </span>
                </span>
                <button className="btn" onClick={() => onUnlock(u.code)}>
                  تابع هذا الخط
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 style={{ fontSize: 'var(--t-lg)' }}>ملف الأدلة</h2>

      {evidence.length === 0 && (
        <p className="notice" style={{ marginTop: '1rem' }}>
          الملف فاضي لهلأ.
        </p>
      )}

      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          marginTop: '0.9rem',
          display: 'grid',
          gap: '1px',
        }}
      >
        {evidence.map((e) => {
          const isOpen = open === e.code;
          const reviewed = e.readable && isReviewed(sessionId, e.code);
          return (
            <li key={e.code} style={{ background: 'var(--ink-raised)' }}>
              <button
                onClick={() =>
                  e.readable ? setExamining(e) : setOpen(isOpen ? null : e.code)
                }
                aria-expanded={e.readable ? undefined : isOpen}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 0,
                  color: 'inherit',
                  font: 'inherit',
                  textAlign: 'start',
                  padding: '0.9rem 1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  <span className="mono muted" style={{ fontSize: 'var(--t-xs)' }}>
                    {e.code}
                  </span>{' '}
                  {e.title}
                  {reviewed && (
                    <span
                      className="mono"
                      style={{ color: 'var(--signal)', fontSize: 'var(--t-xs)' }}
                      title="تمت المراجعة"
                    >
                      {' '}✓
                    </span>
                  )}
                  {e.clock_label && (
                    <>
                      {' '}
                      <span className="mono" style={{ color: 'var(--signal)', fontSize: 'var(--t-xs)' }}>
                        {e.clock_label}
                      </span>
                    </>
                  )}
                  <br />
                  <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>
                    {KIND_LABEL[e.kind]}
                    {!e.readable && e.owner_spec && ` · عند ${holderName(e.owner_spec)}`}
                  </span>
                </span>
                <span className="muted" aria-hidden="true">
                  {e.readable ? 'فحص ›' : isOpen ? '–' : '+'}
                </span>
              </button>

              {!e.readable && isOpen && (
                <div
                  style={{
                    padding: '0 1rem 1.1rem',
                    borderTop: '1px solid var(--ink-line)',
                    paddingTop: '1rem',
                  }}
                >
                  <div style={{ display: 'grid', gap: '0.6rem', maxWidth: '60ch' }}>
                    <p style={{ margin: 0 }}>
                      <span className="redacted">
                        محتوى هذا الدليل خارج صلاحيتك بالكامل ولا يمكن عرضه هنا
                      </span>
                    </p>
                    {e.owner_spec && (
                      <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: 0 }}>
                        هذا الدليل من اختصاص {specLabel(e.owner_spec)}. اسأل{' '}
                        {holderName(e.owner_spec)} يقرأه لك.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: '1.5rem' }}>
        {mySpecs.length > 1 ? 'تخصصاتك' : 'تخصصك'}: {mySpecs.map((sp) => specLabel(sp)).join(' · ')}. ما رح
        تقدر تقرأ كل شي — وهاد مقصود.
      </p>

      {examining && (
        <EvidenceExaminationRoom
          // دليل مختلف = غرفة جديدة (حالة وطلب صلاحية جديدين، بدون وسائط قديمة).
          key={examining.code}
          sessionId={sessionId}
          item={examining}
          onClose={() => setExamining(null)}
        />
      )}
    </main>
  );
}
