// ============================================================
// src/app/api/scene-media/route.ts
// رابط موقّت (~60 ثانية) لصورة مشهد موقع تحقيق — مش دليل.
// الصورة بالـ bucket الخاص case-media، ومسارها موجود هون بس
// (قائمة سماح صارمة بالسيرفر: قضية → موقع → مسار). المتصفح يرسل
// { sessionId, location } فقط ويستلم الرابط الموقّت النهائي — لا
// مسار Storage ولا media_path يوصله إطلاقاً.
// الصلاحية: عضوية الجلسة (is_session_member بجلسة المستخدم نفسه)،
// ثم قضية الجلسة تحدد أي مشهد مسموح. لا SQL جديد، لا تغيير RLS.
//
// وضع ثانٍ — لقطة عنصر قريبة: { sessionId, object, view }. نفس
// الهوية والعضوية والقضية، ثم فهرس التحقيق بجلسة اللاعب نفسه يقرر:
// العنصر ظاهر له ومكتشَف وليس اكتشافاً خاصاً لزميل (src/lib/sceneMedia).
// ============================================================
import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolveObjectView, sceneImagePath, type VisibleObjectRow } from "@/lib/sceneMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "case-media";
const SIGNED_URL_TTL_SECONDS = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCATION_RE = /^[A-Z0-9_]{1,64}$/;
const VIEW_RE = /^[a-z0-9_-]{1,32}$/;

const NO_STORE = { "Cache-Control": "no-store" };

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("BAD_REQUEST", 400);
  }

  const { sessionId, location, object, view } = (body ?? {}) as {
    sessionId?: unknown;
    location?: unknown;
    object?: unknown;
    view?: unknown;
  };
  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) {
    return fail("MISSING_FIELDS", 400);
  }
  const wantsObject = object !== undefined || view !== undefined;
  if (wantsObject) {
    if (typeof object !== "string" || !LOCATION_RE.test(object) || typeof view !== "string" || !VIEW_RE.test(view)) {
      return fail("MISSING_FIELDS", 400);
    }
  } else if (typeof location !== "string" || !LOCATION_RE.test(location)) {
    return fail("MISSING_FIELDS", 400);
  }

  // ---------- 1. الهوية (بجلسة المستخدم، تحترم RLS) ----------
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return fail("AUTH_REQUIRED", 401);
  }

  // ---------- 2. العضوية — نفس الدالة اللي تعتمدها سياسات RLS ----------
  const { data: isMember, error: memberError } = await userClient.rpc("is_session_member", {
    p_session: sessionId,
  });

  if (memberError || isMember !== true) {
    return fail("NOT_A_MEMBER", 403);
  }

  // ---------- 3. قضية الجلسة تحدد المشهد المسموح ----------
  const db = createServiceClient();
  const { data: session } = await db.from("sessions").select("case_id").eq("id", sessionId).maybeSingle();

  if (!session) {
    return fail("SESSION_NOT_FOUND", 404);
  }

  let objectPath: string | null | undefined;
  if (wantsObject) {
    // الفهرس بجلسة اللاعب نفسه: نفس ما يراه بالمشهد، لا أكثر.
    const { data: rows, error: indexError } = await userClient.rpc("investigation_object_index", {
      p_session: sessionId,
    });
    if (indexError) {
      return fail("NOT_A_MEMBER", 403);
    }
    objectPath = resolveObjectView(
      session.case_id as string,
      object as string,
      view as string,
      (rows ?? []) as VisibleObjectRow[],
    );
  } else {
    objectPath = sceneImagePath(session.case_id as string, location as string);
  }
  if (!objectPath) {
    return fail("SCENE_NOT_FOUND", 404);
  }

  // ---------- 4. رابط موقّت — service role فقط من هنا ----------
  const { data: signed, error: signError } = await db.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) {
    return fail("MEDIA_UNAVAILABLE", 502);
  }

  return NextResponse.json(
    { url: signed.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS },
    { headers: NO_STORE },
  );
}
