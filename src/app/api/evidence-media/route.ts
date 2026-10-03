// ============================================================
// src/app/api/evidence-media/route.ts
// روابط موقّتة (~60 ثانية) لوسائط الأدلة الحقيقية.
// لا نكرر منطق صلاحية جديد: نستدعي evidence_index بجلسة
// المستخدم نفسها (تحترم RLS + التخصص المتعدد) للتأكد إن الدليل
// readable لهذا اللاعب بالذات. evidence_index ما ترجع media_path
// إطلاقاً — فقط بعد نجاح الفحص نجيب المسار الفعلي بعميل service
// role، مقيّد بنفس case_id تبع الجلسة. لا مسار Storage يوصل
// للمتصفح أبداً — فقط الرابط الموقّت النهائي.
// ============================================================
import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { EvidenceItem } from "@/types/case";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "case-media";
const SIGNED_URL_TTL_SECONDS = 60;

// امتداد الملف الحقيقي معروف بالسيرفر فقط (من media_path الخاص).
// نشتق منه content-type آمن للواجهة بدون ما نكشف المسار نفسه.
const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
};

function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

interface RequestBody {
  sessionId: string;
  code: string;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const { sessionId, code } = body;
  if (!sessionId || !code?.trim()) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }

  // ---------- 1. الهوية (بجلسة المستخدم، تحترم RLS) ----------
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  // ---------- 2. العضوية + الفتح + التخصص — نفس RPC اللي تستخدمه لوحة الأدلة ----------
  const { data: rows, error: rpcError } = await userClient.rpc(
    "evidence_index",
    { p_session: sessionId },
  );

  if (rpcError || !rows) {
    return NextResponse.json({ error: "NOT_A_MEMBER" }, { status: 403 });
  }

  const target = code.trim().toUpperCase();
  const item = (rows as EvidenceItem[]).find((row) => row.code === target);

  if (!item) {
    return NextResponse.json({ error: "EVIDENCE_NOT_FOUND" }, { status: 404 });
  }

  if (!item.readable || !item.has_media) {
    return NextResponse.json({ error: "NOT_AUTHORIZED" }, { status: 403 });
  }

  // ---------- 3. الصلاحية نجحت — هلأ فقط نجيب المسار الفعلي، مقيّد بنفس قضية الجلسة ----------
  const db = createServiceClient();

  const { data: session } = await db
    .from("sessions")
    .select("case_id")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }

  const { data: evidenceRow } = await db
    .from("evidence")
    .select("media_path")
    .eq("case_id", session.case_id)
    .eq("code", target)
    .maybeSingle();

  if (!evidenceRow?.media_path) {
    return NextResponse.json({ error: "MEDIA_UNAVAILABLE" }, { status: 502 });
  }

  // ---------- 4. رابط موقّت — service role فقط من هنا ----------
  const { data: signed, error: signError } = await db.storage
    .from(BUCKET)
    .createSignedUrl(evidenceRow.media_path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) {
    return NextResponse.json({ error: "MEDIA_UNAVAILABLE" }, { status: 502 });
  }

  return NextResponse.json({
    url: signed.signedUrl,
    kind: item.kind,
    contentType: contentTypeFor(evidenceRow.media_path),
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });
}
