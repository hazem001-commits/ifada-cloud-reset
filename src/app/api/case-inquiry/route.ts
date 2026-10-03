// ============================================================
// src/app/api/case-inquiry/route.ts
// "اسأل التحقيق" — بحث مؤسَّس + موجّه نية محدود.
//
// الصلاحية: كل قراءة لمواد القضية بجلسة اللاعب نفسه (نفس RPCs
// اللي تعتمدها الواجهة: evidence_index، investigation_object_index،
// interrogation_subjects، challenge_index، ومحضر الاستجواب عبر RLS).
// لا نموذج صلاحية ثاني. service role يُستخدم بعد تأكيد العضوية فقط،
// ولقراءة "أين تعيش الأدوات" (أعمدة غير سرية — لا solution/feedback).
// النموذج اللغوي (نفس مزوّد /api/interrogate) يصنّف فقط — لا يرى
// محتوى القضية، ومخرجه يُتحقق منه بصرامة في src/lib/inquiry/router.ts.
// ============================================================
import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { Specialization } from '@/types/database';
import { runInquiry, type InquiryDeps, type RouterMessage } from '@/lib/inquiry/runInquiry';
import { CHALLENGE_TOOL, type ToolCatalog, type ToolHost } from '@/lib/inquiry/tools';
import type { EvidenceRow, LogRow, ObjectRow, SubjectRow } from '@/lib/inquiry/search';
import type { MyChallengeRow } from '@/lib/inquiry/tools';
import { getCaseContract } from '@/cases/registry';
import { chatCompletion } from '@/lib/ai/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// نفس مزوّد ونموذج الاستجواب (/api/interrogate) — لا مزوّد مدفوع جديد.
const MODEL_TIMEOUT_MS = 8000;

// حد بسيط لكل لاعب (لكل نسخة سيرفر) — يحمي تكلفة النموذج من الإغراق.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const recent = new Map<string, number[]>();

function throttled(userId: string): boolean {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(userId, hits);
  return hits.length > MAX_PER_WINDOW;
}

const NO_STORE = { 'Cache-Control': 'no-store' };

async function classifyWithGroq(messages: RouterMessage[]): Promise<string | null> {
  // نفس المزوّد المشترك (src/lib/ai/provider.ts) — نفس النموذج والحدود.
  return chatCompletion(messages, { maxTokens: 120, temperature: 0, timeoutMs: MODEL_TIMEOUT_MS, label: 'INQUIRY ROUTER' });
}

function hostsFromConfig(
  challenges: { object_code: string; spec: Specialization; requires_shared: boolean; input_config: unknown }[],
  objects: { code: string; state_workspace: unknown; interactions: unknown }[],
): ToolHost[] {
  const hosts: ToolHost[] = [];
  for (const c of challenges) {
    const toolKey = (c.input_config as { tool?: unknown } | null)?.tool;
    const tool = typeof toolKey === 'string' ? CHALLENGE_TOOL[toolKey] : undefined;
    if (tool) hosts.push({ tool, objectCode: c.object_code, spec: c.spec, requiresShared: c.requires_shared });
  }
  for (const o of objects) {
    const ws = o.state_workspace && typeof o.state_workspace === 'object' ? Object.values(o.state_workspace) : [];
    const isDevice = ws.some((w) => !!w && typeof w === 'object' && (w as { kind?: unknown }).kind === 'device');
    if (!isDevice) continue;
    const specs = Array.isArray(o.interactions)
      ? o.interactions.map((i) => (i as { spec?: unknown } | null)?.spec).filter((s): s is string => typeof s === 'string')
      : [];
    hosts.push({
      tool: 'DEVICE_INVESTIGATION',
      objectCode: o.code,
      spec: specs.includes('digital') ? 'digital' : null,
      requiresShared: false,
    });
  }
  return hosts;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400, headers: NO_STORE });
  }

  const userClient = await createClient();
  let userId: string | null = null;

  const rpcRows = async <T,>(fn: string, sessionId: string): Promise<T[]> => {
    const { data, error } = await userClient.rpc(fn, { p_session: sessionId });
    if (error) throw new Error(`${fn}: ${error.code ?? ''}`);
    return (data ?? []) as T[];
  };

  const deps: InquiryDeps = {
    async getUserId() {
      const {
        data: { user },
      } = await userClient.auth.getUser();
      userId = user?.id ?? null;
      return userId;
    },
    async isMember(sessionId) {
      const { data, error } = await userClient.rpc('is_session_member', { p_session: sessionId });
      return !error && data === true;
    },
    async mySpecializations(sessionId) {
      const { data } = await userClient.rpc('my_specializations', { p_session: sessionId });
      return Array.isArray(data) ? (data as Specialization[]) : [];
    },
    evidenceIndex: (sessionId) => rpcRows<EvidenceRow>('evidence_index', sessionId),
    objectIndex: (sessionId) => rpcRows<ObjectRow>('investigation_object_index', sessionId),
    subjects: (sessionId) => rpcRows<SubjectRow>('interrogation_subjects', sessionId),
    async interrogationLog(sessionId) {
      const { data, error } = await userClient
        .from('interrogation_log')
        .select('id, character_code, speaker, content')
        .eq('session_id', sessionId)
        .eq('speaker', 'character')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw new Error('interrogation_log');
      return (data ?? []) as LogRow[];
    },
    async myChallenges(sessionId) {
      const { data, error } = await userClient.rpc('challenge_index', { p_session: sessionId });
      return error ? [] : ((data ?? []) as MyChallengeRow[]);
    },
    async evidencePolicy(sessionId) {
      // يُستدعى فقط بعد تأكيد العضوية داخل runInquiry. قضية مجهولة → مخفي.
      const db = createServiceClient();
      const { data: session } = await db.from('sessions').select('case_id').eq('id', sessionId).maybeSingle();
      return getCaseContract(session?.case_id as string | undefined)?.restrictedEvidence ?? 'hidden';
    },
    async toolCatalog(sessionId): Promise<ToolCatalog> {
      // يُستدعى فقط بعد تأكيد العضوية داخل runInquiry.
      const db = createServiceClient();
      const { data: session } = await db.from('sessions').select('case_id').eq('id', sessionId).maybeSingle();
      if (!session) return { hosts: [], interrogation: false };
      const caseId = session.case_id as string;
      const [ch, objs, chars] = await Promise.all([
        db.from('investigation_challenges').select('object_code, spec, requires_shared, input_config').eq('case_id', caseId),
        db.from('investigation_objects').select('code, state_workspace, interactions').eq('case_id', caseId),
        db.from('characters').select('code', { count: 'exact', head: true }).eq('case_id', caseId),
      ]);
      return {
        hosts: hostsFromConfig(ch.data ?? [], objs.data ?? []),
        interrogation: (chars.count ?? 0) > 0,
      };
    },
    classify: process.env.GROQ_API_KEY ? classifyWithGroq : null,
  };

  try {
    // الحد يُطبَّق بعد معرفة الهوية فقط (getUserId داخل runInquiry يملأ userId).
    const outcome = await runInquiry(body, {
      ...deps,
      async isMember(sessionId) {
        if (userId && throttled(userId)) throw new Error('THROTTLED');
        return deps.isMember(sessionId);
      },
    });
    return NextResponse.json(outcome.body, { status: outcome.status, headers: NO_STORE });
  } catch (e) {
    if (e instanceof Error && e.message === 'THROTTLED') {
      return NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429, headers: NO_STORE });
    }
    console.error('CASE INQUIRY FAILED:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'INQUIRY_FAILED' }, { status: 502, headers: NO_STORE });
  }
}
