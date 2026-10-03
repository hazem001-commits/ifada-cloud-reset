// ============================================================
// src/server/runtime/readModel.ts
// سيرفر فقط. قارئ حالة المحرك المصرّح به: بعميل اللاعب نفسه (RLS +
// runtime_state التي تفحص العضوية وتُسقط كل ما ليس للاعب). لا service
// role هنا ولا اتحاد معارف لاعبين.
//
// قبل تطبيق sql/037: الدالة غير موجودة → { installed: false } والسلوك
// الحالي يبقى كما هو. قضية عقدها لا يفعّل المحرك → لا قراءة أصلاً.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCaseContract } from '@/cases/registry';
import { isRuntimeNotInstalled, parseRuntimeState, runtimeKnowledgeInput } from '@/lib/runtime/projection';
import type { RuntimeKnowledgeInput, RuntimeReadModel } from '@/lib/runtime/types';
import { RUNTIME_RPC } from '@/types/runtime';

export type RuntimeRead =
  | { installed: false; model: null }
  | { installed: true; model: RuntimeReadModel | null };

export async function readRuntimeState(client: SupabaseClient, sessionId: string): Promise<RuntimeRead> {
  const { data, error } = await client.rpc(RUNTIME_RPC.state, { p_session: sessionId });
  if (error) {
    if (isRuntimeNotInstalled(error)) return { installed: false, model: null };
    throw new Error(`${RUNTIME_RPC.state}: ${error.code ?? ''}`);
  }
  return { installed: true, model: parseRuntimeState(data) };
}

/** للمعرفة المصرّح بها (AI): بلا نبضات، وفقط إن فعّل عقد القضية المحرك. */
export async function runtimeKnowledgeFor(client: SupabaseClient, sessionId: string, caseId: string): Promise<RuntimeKnowledgeInput | null> {
  if (!getCaseContract(caseId)?.runtime.engine) return null;
  try {
    const read = await readRuntimeState(client, sessionId);
    return runtimeKnowledgeInput(read.model);
  } catch {
    return null; // المحرك اختياري للمعرفة: الفشل لا يُسقط اختبار الفرضية
  }
}
