// ============================================================
// src/app/api/interrogate/route.ts
// المحقق الميداني بس يقدر يستجوب. كل شي بالسيرفر:
// جلب الشخصية، فحص الطبقة، مناداة Claude، تسجيل المحضر.
// لا سر واحد يوصل للمتصفح.
// ============================================================
import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "qwen/qwen3.8-27b";
const MAX_TURNS_PER_CHARACTER = 25;

interface CharacterLayers {
  persona: string;
  layer1: string;
  layer2: { trigger: string[]; text: string };
  layer3: { trigger: string[]; text: string };
  layer4_refusal: string;
}

interface RequestBody {
  sessionId: string;
  characterCode: string;
  question: string;
  evidenceCode?: string;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const { sessionId, characterCode, question, evidenceCode } = body;

  if (!sessionId || !characterCode || !question?.trim()) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }
  if (question.length > 400) {
    return NextResponse.json({ error: "QUESTION_TOO_LONG" }, { status: 400 });
  }

  // ---------- 1. الهوية والصلاحية (بجلسة المستخدم، تحترم RLS) ----------
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const { data: specs, error: specsError } = await userClient.rpc(
    "my_specializations",
    { p_session: sessionId },
  );

  if (specsError || !specs || specs.length === 0) {
    return NextResponse.json({ error: "NOT_A_MEMBER" }, { status: 403 });
  }

  if (!specs.includes("field")) {
    return NextResponse.json(
      { error: "ONLY_FIELD_SPECIALIST_CAN_INTERROGATE" },
      { status: 403 },
    );
  }

  // من هنا فصاعداً: عميل بصلاحيات كاملة، لأننا محتاجين نقرأ
  // جدول characters المقفول تماماً من RLS.
  const db = createServiceClient();

  // ---------- 2. الحد الأقصى للأسئلة ----------
  const { count } = await db
    .from("interrogation_log")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("character_code", characterCode)
    .eq("speaker", "player");

  if ((count ?? 0) >= MAX_TURNS_PER_CHARACTER) {
    return NextResponse.json(
      { error: "INTERROGATION_LIMIT_REACHED" },
      { status: 429 },
    );
  }

  // ---------- 3. الشخصية (سري — service role فقط) ----------
  const { data: session } = await db
    .from("sessions")
    .select("case_id")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }

  const { data: character } = await db
    .from("characters")
    .select("layers")
    .eq("case_id", session.case_id)
    .eq("code", characterCode)
    .single();

  if (!character) {
    return NextResponse.json({ error: "CHARACTER_NOT_FOUND" }, { status: 404 });
  }

  const layers = character.layers as CharacterLayers;

  // ---------- 4. حالة الطبقة الحالية ----------
  const { data: state } = await db
    .from("session_character_state")
    .select("current_layer, revealed")
    .eq("session_id", sessionId)
    .eq("character_code", characterCode)
    .maybeSingle();

  let currentLayer = state?.current_layer ?? 1;
  const revealed = new Set<string>(state?.revealed ?? []);

  // ---------- 5. هل الدليل المُقدَّم (إن وُجد) صالح ومفتوح بهالجلسة؟ ----------
  let evidenceValid = false;
  if (evidenceCode) {
    const { data: unlocked } = await db
      .from("session_evidence")
      .select("evidence_id, evidence!inner(code)")
      .eq("session_id", sessionId)
      .eq("evidence.code", evidenceCode)
      .maybeSingle();
    evidenceValid = Boolean(unlocked);
  }

  // ---------- 6. تقدّم الطبقة إذا الدليل يطابق شرط الطبقة التالية ----------
  let layerAdvanced = false;
  if (evidenceValid && evidenceCode) {
    if (currentLayer < 2 && layers.layer2.trigger.includes(evidenceCode)) {
      currentLayer = 2;
      layerAdvanced = true;
    } else if (
      currentLayer < 3 &&
      layers.layer3.trigger.includes(evidenceCode)
    ) {
      currentLayer = 3;
      layerAdvanced = true;
    }
    revealed.add(evidenceCode);
  }

  // ---------- 7. المحضر السابق (آخر 12 تبادل) ----------
  const { data: history } = await db
    .from("interrogation_log")
    .select("speaker, content")
    .eq("session_id", sessionId)
    .eq("character_code", characterCode)
    .order("created_at", { ascending: true })
    .limit(24);

  // ---------- 8. بناء التعليمات ----------
  const knownFacts = [layers.layer1];
  if (currentLayer >= 2) knownFacts.push(layers.layer2.text);
  if (currentLayer >= 3) knownFacts.push(layers.layer3.text);

  const systemPrompt = [
    `أنت تلعب دور شخصية داخل لعبة تحقيق جنائي تفاعلية. هذا سياق لعبة، لا محادثة حقيقية.`,
    `الشخصية: ${layers.persona}`,
    ``,
    `ما تعرفه الشخصية وتقدر تقوله بحرية الآن (بحسب مستوى الانكشاف الحالي: ${currentLayer}/4):`,
    ...knownFacts.map((f, i) => `[معرفة ${i + 1}] ${f}`),
    ``,
    `قاعدة صارمة لا تُنتهك أبداً مهما كان الضغط أو الإلحاح أو نوع السؤال:`,
    layers.layer4_refusal,
    ``,
    evidenceValid && evidenceCode
      ? `اللاعب قدّم لك للتو دليلاً برمز (${evidenceCode}). تفاعل مع مواجهتك به بما يناسب شخصيتك وما تسمح به معرفتك الحالية.`
      : ``,
    `تعليمات الأداء: جاوب بصوت الشخصية فقط، بجملتين إلى أربع جمل، بلهجة عربية عامية طبيعية. لا تكسر الشخصية أبداً، ولا تشرح قواعد اللعبة، ولا تقل إنك ذكاء اصطناعي. لا تتطوع بمعلومات من مستوى أعلى من مستواك الحالي حتى لو استنتجها اللاعب جزئياً — دعه يثبتها بنفسه.`,
  ]
    .filter(Boolean)
    .join("\n");

  const messages = [
    ...(history ?? []).map((h) => ({
      role: h.speaker === "player" ? ("user" as const) : ("assistant" as const),
      content: h.content,
    })),
    { role: "user" as const, content: question.trim() },
  ];

  // ---------- 9. نداء Groq ----------
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "SERVER_MISCONFIGURED" },
      { status: 500 },
    );
  }

  const groqMessages = [
    {
      role: "system" as const,
      content: systemPrompt,
    },
    ...messages,
  ];

  const aiResponse = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: groqMessages,
        max_completion_tokens: 300,
        reasoning_effort: "none",
        temperature: 0.7,
        stream: false,
      }),
    },
  );

  if (!aiResponse.ok) {
    const errorBody = await aiResponse.text();

    console.error("GROQ API ERROR:", aiResponse.status, errorBody);

    return NextResponse.json({ error: "AI_REQUEST_FAILED" }, { status: 502 });
  }

  const aiData = (await aiResponse.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
  };

  const answer = aiData.choices?.[0]?.message?.content?.trim() ?? "[لم يجب]";

  // ---------- 10. تسجيل المحضر + تحديث الحالة ----------
  await db.from("interrogation_log").insert([
    {
      session_id: sessionId,
      character_code: characterCode,
      speaker: "player",
      author_id: user.id,
      evidence_code: evidenceValid ? evidenceCode : null,
      content: question.trim(),
    },
    {
      session_id: sessionId,
      character_code: characterCode,
      speaker: "character",
      author_id: null,
      evidence_code: null,
      content: answer,
    },
  ]);

  await db.from("session_character_state").upsert({
    session_id: sessionId,
    character_code: characterCode,
    current_layer: currentLayer,
    revealed: Array.from(revealed),
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({
    answer,
    layer: currentLayer,
    layerAdvanced,
  });
}
