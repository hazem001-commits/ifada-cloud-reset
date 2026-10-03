'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login() {
    setBusy(true);
    setError(null);

    const supabase = createClient();

    const { error: authError } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (authError) {
      setBusy(false);
      setError('الإيميل أو كلمة المرور غير صحيحة.');
      return;
    }

    router.push(next);
    router.refresh();
  }

  async function signup() {
    setBusy(true);
    setError(null);

    if (name.trim().length < 2) {
      setBusy(false);
      setError('اكتب اسم المحقق.');
      return;
    }

    if (password.length < 6) {
      setBusy(false);
      setError('كلمة المرور لازم تكون 6 أحرف على الأقل.');
      return;
    }

    const supabase = createClient();

    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          display_name: name.trim(),
        },
      },
    });

    if (authError) {
      setBusy(false);
      setError(authError.message);
      return;
    }

    router.push(next);
    router.refresh();
  }

  const invalid =
    busy ||
    !email.includes('@') ||
    password.length < 6;

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div>
        <span className="stamp">RESTRICTED ACCESS</span>
      </div>

      <h1 style={{ fontSize: 'var(--t-2xl)' }}>
        أرشيف القضايا
      </h1>

      <p className="muted">
        سجّل دخولك كمحقق أو أنشئ حساب جديد.
      </p>

      <label style={{ display: 'grid', gap: '0.4rem' }}>
        <span style={{ fontSize: 'var(--t-sm)' }}>
          الإيميل
        </span>

        <input
          className="field mono"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label style={{ display: 'grid', gap: '0.4rem' }}>
        <span style={{ fontSize: 'var(--t-sm)' }}>
          كلمة المرور
        </span>

        <input
          className="field"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      <label style={{ display: 'grid', gap: '0.4rem' }}>
        <span style={{ fontSize: 'var(--t-sm)' }}>
          اسم المحقق{' '}
          <span className="muted">
            (مطلوب عند إنشاء الحساب فقط)
          </span>
        </span>

        <input
          className="field"
          type="text"
          maxLength={40}
          placeholder="حازم"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      {error && <p className="notice">{error}</p>}

      <button
        className="btn"
        onClick={login}
        disabled={invalid}
      >
        {busy ? 'جاري الدخول…' : 'تسجيل الدخول'}
      </button>

      <button
        className="btn btn-quiet"
        onClick={signup}
        disabled={invalid || name.trim().length < 2}
      >
        إنشاء حساب جديد
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main
      className="shell"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        alignContent: 'center',
        maxWidth: '32rem',
      }}
    >
      <Suspense fallback={<p className="muted">…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}