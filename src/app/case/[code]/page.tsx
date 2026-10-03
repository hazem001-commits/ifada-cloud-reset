// ============================================================
// src/app/case/[code]/page.tsx
// صفحة التحقيق. تتحقق من العضوية على السيرفر قبل أي شي.
// ============================================================
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { buildLobbyView, type LobbyRow } from '@/types/database';
import CaseWorkspace from './CaseWorkspace';
import CaseUnavailable from '../../CaseUnavailable';
import { isCaseOpenForPlay } from '@/cases/registry';
import { devCaseAccess } from '@/server/cases/devAccess';

export const dynamic = 'force-dynamic';

export default async function CasePage({
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
        <p className="muted">الكود غلط، أو إنك مش من فريق هذا التحقيق.</p>
        <hr className="rule" />
        <a className="btn" href="/">
          رجوع للأرشيف
        </a>
      </main>
    );
  }

  const view = buildLobbyView(data as LobbyRow[]);
  if (!view) redirect('/');

  if (view.status === 'lobby') {
    redirect(`/lobby/${code.toUpperCase()}`);
  }

  const me = view.members.find((m) => m.userId === user.id);
  if (!me) redirect('/');

  // قضية غير قابلة للعب (قيد التطوير/غير مسجّلة) لا تُفتح كتحقيق عادي،
  // حتى لو أُنشئت جلستها مباشرة عبر RPC.
  if (!isCaseOpenForPlay(view.caseId, devCaseAccess())) {
    return <CaseUnavailable title={view.caseTitle} />;
  }

  return (
    <CaseWorkspace
      sessionId={view.sessionId}
      caseId={view.caseId}
      caseTitle={view.caseTitle}
      code={code.toUpperCase()}
      mySpec={me.specialization}
      myId={user.id}
      members={view.members}
    />
  );
}
