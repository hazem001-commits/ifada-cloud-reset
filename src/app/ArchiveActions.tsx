// ============================================================
// src/app/ArchiveActions.tsx
// إنشاء تحقيق أو الانضمام لواحد. يستدعي RPC مباشرة —
// الدالة نفسها بتفحص الهوية والصلاحية، فما في داعي لـ API route.
// ============================================================
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  SPECIALIZATIONS,
  translateDbError,
  type Specialization,
} from '@/types/database';

type Mode = 'idle' | 'create' | 'join';

export default function ArchiveActions({ cases }: { cases: { id: string; title: string; dev?: boolean }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  // الخيارات من السيرفر فقط (منشورة + قابلة للعب) — لا قائمة قضايا ثابتة هنا.
  const [caseId, setCaseId] = useState(cases[0]?.id ?? '');
  const [code, setCode] = useState('');
  const [spec, setSpec] = useState<Specialization>('field');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createSession() {
    setBusy(true);
    setError(null);
    if (cases.find((c) => c.id === caseId)?.dev) return createDevSession();

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc('create_session', {
      p_case_id: caseId,
      p_specialization: spec,
    });

    setBusy(false);

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row?.session_code) {
      setError('ما رجعنا كود التحقيق. جرّب مرة ثانية.');
      return;
    }
    router.push(`/lobby/${row.session_code}`);
  }

  /** قضية قيد التطوير (next dev فقط): مسار تطوير محلي بلا entitlement — انظر api/dev/session. */
  async function createDevSession() {
    const res = await fetch('/api/dev/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseId, specialization: spec }),
    });
    const out = (await res.json().catch(() => ({}))) as { code?: string };
    setBusy(false);
    if (!res.ok || !out.code) {
      setError('تعذّر فتح جلسة التطوير.');
      return;
    }
    router.push(`/lobby/${out.code}`);
  }

  async function joinSession() {
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const cleaned = code.trim().toUpperCase();

    const { error: rpcError } = await supabase.rpc('join_session', {
      p_code: cleaned,
      p_specialization: spec,
    });

    setBusy(false);

    if (rpcError) {
      setError(translateDbError(rpcError.message));
      return;
    }
    router.push(`/lobby/${cleaned}`);
  }

  if (mode === 'idle') {
    return (
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {cases.length > 0 && (
          <button className="btn" onClick={() => setMode('create')}>
            افتح تحقيق جديد
          </button>
        )}
        <button className="btn btn-quiet" onClick={() => setMode('join')}>
          انضم بكود
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1rem', maxWidth: '36rem' }}>
      {mode === 'create' && (
        <label style={{ display: 'grid', gap: '0.4rem' }}>
          <span style={{ fontSize: 'var(--t-sm)' }}>القضية</span>
          <select
            className="field"
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
          >
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {mode === 'join' && (
        <label style={{ display: 'grid', gap: '0.4rem' }}>
          <span style={{ fontSize: 'var(--t-sm)' }}>كود التحقيق</span>
          <input
            className="field mono"
            value={code}
            maxLength={6}
            placeholder="A7K2M9"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
      )}

      <fieldset
        style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}
      >
        <legend style={{ fontSize: 'var(--t-sm)', padding: 0 }}>
          تخصصك الأساسي
        </legend>
        <p className="muted" style={{ fontSize: 'var(--t-xs)', margin: 0 }}>
          بفريق أقل من أربعة، قد يُسند لك تخصص إضافي عند بدء التحقيق.
        </p>

        {SPECIALIZATIONS.map((s) => (
          <label
            key={s.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '0.6rem',
              alignItems: 'start',
              background: spec === s.id ? 'var(--ink-raised)' : 'transparent',
              border: '1px solid var(--ink-line)',
              padding: '0.7rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="spec"
              value={s.id}
              checked={spec === s.id}
              onChange={() => setSpec(s.id)}
              style={{ marginTop: '0.4rem' }}
            />
            <span>
              <strong style={{ fontWeight: 600 }}>{s.label}</strong>
              <br />
              <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>
                {s.canDo}
              </span>
              <br />
              <span style={{ fontSize: 'var(--t-sm)', color: 'var(--seal)' }}>
                {s.cannotDo}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {error && <p className="notice">{error}</p>}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          className="btn"
          disabled={busy || (mode === 'join' && code.trim().length !== 6) || (mode === 'create' && !caseId)}
          onClick={mode === 'create' ? createSession : joinSession}
        >
          {busy
            ? 'لحظة…'
            : mode === 'create'
              ? 'افتح التحقيق'
              : 'انضم للفريق'}
        </button>
        <button
          className="btn btn-quiet"
          onClick={() => {
            setMode('idle');
            setError(null);
          }}
        >
          رجوع
        </button>
      </div>
    </div>
  );
}
