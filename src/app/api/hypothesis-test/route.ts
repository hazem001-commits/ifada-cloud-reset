// ============================================================
// src/app/api/hypothesis-test/route.ts
// "اختبر الفرضية" — نداء نموذج واحد لكل طلب صريح من اللاعب.
// كل قراءة معرفة بعميل اللاعب نفسه (RPCs/RLS المعتمدة) بعد التحقق من
// العضوية؛ عميل الخدمة يُستخدم فقط لمعرفة قضية الجلسة. لا حقيقة مخفية،
// لا نصوص أدلة غير مقروءة، لا اكتشافات زملاء خاصة، لا قواعد روابط.
// ============================================================
import { NextResponse, type NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { EvidenceRow, LogRow, ObjectRow, SubjectRow } from '@/lib/inquiry/search';
import { loadAuthorizedKnowledge, type AuthorizedKnowledgeSource } from '@/lib/ai/knowledge';
import { chatCompletion, providerAvailable } from '@/lib/ai/provider';
import { runStressTest } from '@/lib/ai/stressTest';
import { getCaseContract } from '@/cases/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

// حد لكل لاعب (لكل نسخة سيرفر): كل طلب = نداء نموذج محتمل.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 4;
const recent = new Map<string, number[]>();
function throttled(userId: string): boolean {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(userId, hits);
  return hits.length > MAX_PER_WINDOW;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'error', error: 'BAD_REQUEST' }, { status: 400, headers: NO_STORE });
  }

  const userClient = await createClient();
  let userId: string | null = null;

  const rpcRows = async <T,>(fn: string, sessionId: string): Promise<T[]> => {
    const { data, error } = await userClient.rpc(fn, { p_session: sessionId });
    if (error) throw new Error(`${fn}: ${error.code ?? ''}`);
    return (data ?? []) as T[];
  };

  const source: AuthorizedKnowledgeSource = {
    async isMember(sessionId) {
      const { data, error } = await userClient.rpc('is_session_member', { p_session: sessionId });
      return !error && data === true;
    },
    async caseIdOf(sessionId) {
      // بعد تأكيد العضوية فقط (loadAuthorizedKnowledge يتحقق أولاً).
      const { data } = await createServiceClient().from('sessions').select('case_id').eq('id', sessionId).maybeSingle();
      return (data?.case_id as string | undefined) ?? null;
    },
    restrictedEvidence: (caseId) => getCaseContract(caseId)?.restrictedEvidence ?? 'hidden',
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
        .limit(200);
      if (error) throw new Error('interrogation_log');
      return (data ?? []) as LogRow[];
    },
    async validatedConnections(sessionId) {
      // معاني الفريق المثبتة فقط (027 لا يرجع معرّفات قواعد للاعب).
      const { data, error } = await userClient.rpc('session_connection_state', { p_session: sessionId });
      if (error || !data || typeof data !== 'object') return [];
      const list = (data as { connections?: { meaning?: unknown }[] }).connections ?? [];
      return list.filter((c) => typeof c.meaning === 'string').map((c) => ({ ruleId: '', meaning: c.meaning as string }));
    },
    interrogationLayers: async () => [],
    // لا كيانات مكتوبة بعد (sql/030 مقترح) — لا أوصاف أشخاص.
    entities: () => null,
    tools: async () => [],
    async challengeCodes(sessionId) {
      const { data, error } = await userClient.rpc('challenge_index', { p_session: sessionId });
      return error ? [] : ((data ?? []) as { code: string }[]).map((c) => c.code);
    },
  };

  try {
    const outcome = await runStressTest(body, {
      async getUserId() {
        const {
          data: { user },
        } = await userClient.auth.getUser();
        userId = user?.id ?? null;
        return userId;
      },
      async isMember(sessionId) {
        if (userId && throttled(userId)) throw new Error('THROTTLED');
        return source.isMember(sessionId);
      },
      async loadKnowledge(sessionId) {
        const caseId = await source.caseIdOf(sessionId);
        return loadAuthorizedKnowledge(sessionId, source, {
          connectionsEnabled: getCaseContract(caseId)?.systems.connections ?? false,
        });
      },
      complete: providerAvailable()
        ? (messages) => chatCompletion(messages, { maxTokens: 900, temperature: 0.2, timeoutMs: 20_000, label: 'STRESS TEST' })
        : null,
    });
    return NextResponse.json(outcome.body, { status: outcome.status, headers: NO_STORE });
  } catch (e) {
    if (e instanceof Error && e.message === 'THROTTLED') {
      return NextResponse.json({ status: 'error', error: 'TOO_MANY_REQUESTS' }, { status: 429, headers: NO_STORE });
    }
    console.error('STRESS TEST FAILED:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ status: 'unavailable' }, { status: 502, headers: NO_STORE });
  }
}
