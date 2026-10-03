// ============================================================
// src/app/lobby/[code]/page.tsx
// غرفة الانتظار. يقرأ اللوبي من السيرفر ثم يسلّمه لمكون حي.
// ============================================================
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { buildLobbyView, type LobbyRow } from '@/types/database';
import LobbyClient from './LobbyClient';
import CaseUnavailable from '../../CaseUnavailable';
import { isCaseOpenForPlay } from '@/cases/registry';
import { devCaseAccess } from '@/server/cases/devAccess';

export const dynamic = 'force-dynamic';

export default async function LobbyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data, error } = await supabase.rpc('session_lobby', {
    p_code: code.toUpperCase(),
  });

  if (error || !data || (data as LobbyRow[]).length === 0) {
    return (
      <main className="shell" style={{ maxWidth: '32rem' }}>
        <h1 style={{ fontSize: 'var(--t-xl)' }}>ما لقينا هذا التحقيق</h1>
        <p className="muted">
          الكود غلط، أو إنك مش من فريق هذا التحقيق. ارجع للأرشيف وانضم بالكود
          الصحيح.
        </p>
        <hr className="rule" />
        <Link className="btn" href="/">
          رجوع للأرشيف
        </Link>
      </main>
    );
  }

  const view = buildLobbyView(data as LobbyRow[]);
  if (!view) redirect('/');
  // لا غرفة انتظار (ولا بدء) لقضية غير قابلة للعب بعد.
  if (!isCaseOpenForPlay(view.caseId, devCaseAccess())) {
    return <CaseUnavailable title={view.caseTitle} />;
  }
  // الجلسة بدأت فعلاً (تحديث الصفحة/لاعب متأخر) — مباشرة على التحقيق.
  if (view.status === 'active' || view.status === 'hearing') redirect(`/case/${code.toUpperCase()}`);

  return <LobbyClient code={code.toUpperCase()} initial={view} me={user.id} />;
}
