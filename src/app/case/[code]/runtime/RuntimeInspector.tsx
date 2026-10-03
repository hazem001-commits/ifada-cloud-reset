// ============================================================
// src/app/case/[code]/runtime/RuntimeInspector.tsx
// DEV ONLY — مفتش وظيفي للمحرك (RESET-1). ليس واجهة منتج ولا تصميماً
// نهائياً: يتحقق فقط من الخيوط، حالة العالم، النبضات، والأماكن المكشوفة.
// يظهر فقط تحت next dev أو NEXT_PUBLIC_IFADA_RUNTIME_INSPECTOR=1، ولقضية
// يفعّل عقدها المحرك. كل ما يعرضه رجع للاعب نفسه من runtime_state.
// ============================================================
'use client';

import { useMemo, useState } from 'react';
import type { LobbyMember } from '@/types/database';
import { pulseLine } from '@/lib/runtime/pulse';
import { useRuntimeState } from './useRuntimeState';

const STATUS_LABEL = { open: 'مفتوح', followed: 'متتبَّع', closed: 'مغلق' } as const;

export default function RuntimeInspector({
  sessionId,
  myId,
  members,
}: {
  sessionId: string;
  myId: string;
  members: LobbyMember[];
}) {
  const [open, setOpen] = useState(false);
  const runtime = useRuntimeState(sessionId, true);
  const names = useMemo(() => new Map(members.map((m) => [m.userId, m.displayName])), [members]);
  const m = runtime.model;

  return (
    <aside
      dir="rtl"
      aria-label="مفتش المحرك (تطوير)"
      style={{
        position: 'fixed',
        insetInlineEnd: '0.75rem',
        bottom: '0.75rem',
        // تحت أوراق اللوحة وأدراجها (z 20) وتحت البث والعارض — لا يغطي واجهة حرجة.
        zIndex: 15,
        maxWidth: 'min(22rem, calc(100vw - 1.5rem))',
        maxHeight: '60dvh',
        overflow: 'auto',
        background: 'var(--ink-raised)',
        border: '1px dashed var(--signal)',
        padding: '0.5rem 0.75rem',
        fontSize: 'var(--t-xs)',
      }}
    >
      <button
        type="button"
        className="mono"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        // بلا all: unset — يبقى إطار التركيز (:focus-visible) ظاهراً للوحة المفاتيح.
        style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
      >
        DEV · RUNTIME {runtime.installed === false ? '(037 غير مطبّق)' : ''}
      </button>
      {open && (
        <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
          {runtime.installed === false && <p className="muted">المحرك غير مثبّت بقاعدة البيانات — السلوك الحالي دون تغيير.</p>}
          {runtime.error && <p className="notice">{runtime.error}</p>}
          {m && (
            <>
              <section>
                <strong>حالة العالم</strong>
                {m.world.length === 0 ? <p className="muted">—</p> : (
                  <ul>{m.world.map((w) => <li key={w.code}>{w.headline}</li>)}</ul>
                )}
              </section>
              <section>
                <strong>الخيوط</strong>
                {m.leads.length === 0 ? <p className="muted">—</p> : (
                  <ul>
                    {m.leads.map((l) => (
                      <li key={l.code}>
                        {l.label} · {STATUS_LABEL[l.status]} · {l.shared ? 'للفريق' : 'خاص بي'}
                        {!l.shared && l.mine && (
                          <button type="button" onClick={() => void runtime.shareLead(l.code)} style={{ marginInlineStart: '0.4rem' }}>
                            شارك
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <strong>أماكن مكشوفة</strong>
                {m.places.length === 0 ? <p className="muted">—</p> : (
                  <ul>{m.places.map((p) => <li key={p.code}>{p.title} · {p.shared ? 'للفريق' : 'خاص بي'}</li>)}</ul>
                )}
              </section>
              <section>
                <strong>نبض التحقيق</strong>
                {m.pulses.length === 0 ? <p className="muted">—</p> : (
                  <ul>{m.pulses.map((p) => <li key={p.id}>{pulseLine(p, names, myId)}</li>)}</ul>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
