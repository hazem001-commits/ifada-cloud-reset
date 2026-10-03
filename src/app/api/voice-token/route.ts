// ============================================================
// src/app/api/voice-token/route.ts
// يصدر توكن دخول صوت مؤقت. المفاتيح الحقيقية (API Secret)
// ما توصل للمتصفح أبداً — بس التوكن الموقّع، وهو محدود
// بالجلسة والهوية ووقت انتهاء قصير.
// ============================================================
import { NextResponse, type NextRequest } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { sessionId } = (await request.json().catch(() => ({}))) as {
    sessionId?: string;
  };

  if (!sessionId) {
    return NextResponse.json({ error: 'MISSING_SESSION' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  }

  // تحقّق العضوية عبر RLS — لو مش عضو، ما في صف يرجع.
  const { data: member } = await supabase
    .from('session_members')
    .select('user_id')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: 'NOT_A_MEMBER' }, { status: 403 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json({ error: 'VOICE_NOT_CONFIGURED' }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  const token = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: profile?.display_name ?? 'محقق',
    ttl: '4h',
  });

  // غرفة واحدة لكل جلسة تحقيق. صوت فقط — بدون فيديو.
  token.addGrant({
    room: `ifada-${sessionId}`,
    roomJoin: true,
    canPublish: true,
    canPublishData: false,
    canSubscribe: true,
  });

  return NextResponse.json({
    token: await token.toJwt(),
    url: wsUrl,
    room: `ifada-${sessionId}`,
  });
}
