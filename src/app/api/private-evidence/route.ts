// ============================================================
// src/app/api/private-evidence/route.ts
// أي أدلتي المقروءة خاصة بقناتي (توزيع القنوات — المشهد 17)؟
// لكي لا يعرض العميل "ضع على اللوحة" لمادة يرفض السيرفر تثبيتها دائماً.
//
// لا منطق صلاحية جديد: evidence_index بجلسة المستخدم نفسها (هي التي تقرر
// ما يقرؤه)، ثم تقاطع مع التوزيع المكتوب بالسيرفر. الرد = أكواد يقرؤها
// اللاعب أصلاً فقط — لا شيء عن قناة زميل. لا service role.
// إرشاد عرض فقط: التثبيت يبقى قرار pin_board_material بالسيرفر.
// ============================================================
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readablePrivateEvidence } from "@/server/cases/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let sessionId: unknown;
  try {
    ({ sessionId } = await request.json());
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (typeof sessionId !== "string" || !sessionId) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  // العضوية + ما أقرؤه: نفس RPC كل أسطح الأدلة.
  const [{ data: rows, error }, { data: session }] = await Promise.all([
    supabase.rpc("evidence_index", { p_session: sessionId }),
    supabase.from("sessions").select("case_id").eq("id", sessionId).maybeSingle(),
  ]);
  if (error || !rows || !session) {
    return NextResponse.json({ error: "NOT_A_MEMBER" }, { status: 403 });
  }

  const codes = readablePrivateEvidence(
    (session as { case_id: string }).case_id,
    rows as { code: string; readable: boolean }[],
  );
  return NextResponse.json({ codes });
}
