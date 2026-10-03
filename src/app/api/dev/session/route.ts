// ============================================================
// src/app/api/dev/session/route.ts
// جلسة تطوير محلية لقضية قيد التطوير — انظر src/server/cases/devSession.ts.
// خارج next dev، أو لقضية غير 'development'، المسار "غير موجود" (404).
// لا entitlement يُنشأ، ولا تعديل على create_session، ولا مسار سري يصل
// للمتصفح — يرجع رمز الغرفة فقط.
// ============================================================
import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { devSessionGuard, newSessionCode } from '@/server/cases/devSession';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () => NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

export async function POST(request: NextRequest) {
  // 1. الحارس قبل أي شيء آخر (بيئة + عقد قضية قيد التطوير + تخصص صالح)
  if (process.env.NODE_ENV !== 'development') return notFound();
  let body: { caseId?: unknown; specialization?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }
  const guard = devSessionGuard({ nodeEnv: process.env.NODE_ENV, caseId: body.caseId, specialization: body.specialization });
  if (!guard.ok) return guard.status === 404 ? notFound() : NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });

  // 2. الهوية بجلسة المستخدم نفسها — قبل أي عميل service role
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  // 3. نفس شكل create_session: جلسة lobby + عضوية المضيف. لا entitlement.
  const service = createServiceClient();
  for (let tries = 0; tries < 20; tries += 1) {
    const code = newSessionCode();
    const { data: session, error } = await service
      .from('sessions')
      .insert({ case_id: guard.caseId, code, host_id: user.id })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') continue; // رمز مستخدم — جرّب غيره
      return NextResponse.json({ error: 'CREATE_FAILED' }, { status: 500 });
    }
    const { error: memberError } = await service
      .from('session_members')
      .insert({ session_id: session.id, user_id: user.id, specialization: guard.specialization, is_host: true });
    if (memberError) {
      await service.from('sessions').delete().eq('id', session.id); // لا جلسة بلا مضيف
      return NextResponse.json({ error: 'CREATE_FAILED' }, { status: 500 });
    }
    return NextResponse.json({ code });
  }
  return NextResponse.json({ error: 'CODE_GENERATION_FAILED' }, { status: 500 });
}
