// ============================================================
// src/types/runtime.ts
// شكل ردود RPC الخاصة بالمحرك (sql/037) كما تصل من السيرفر — قبل
// التنقية. لا تُستخدم مباشرة بالعرض: تمر دائماً بـ parseRuntimeState
// (src/lib/runtime/projection.ts) المغلقة عند الشك.
// ============================================================

/** runtime_state(p_session) → jsonb */
export interface RuntimeStateRpc {
  leads: { lead: string; label: string; status: string; shared: boolean; mine: boolean; opened_at: string }[];
  world: { state: string; headline: string; reached_at: string }[];
  places: { code: string; title: string; category: string; shared: boolean }[];
  /** أعمدة آمنة فقط (session_pulses). */
  pulses: { id: string; actor: string | null; category: string; at: string }[];
}

/** runtime_provenance(p_session) → صفوف لعقد يراها المستدعي فقط (بلا معرّف قاعدة). */
export interface RuntimeProvenanceRow {
  node_kind: 'lead' | 'world_state' | 'object' | 'evidence';
  node_code: string;
  actor_id: string | null;
  created_at: string;
}

/** أسماء RPC المحرك — مصدر واحد للواجهة والسيرفر. */
export const RUNTIME_RPC = {
  state: 'runtime_state',
  provenance: 'runtime_provenance',
  settle: 'runtime_settle',
  shareLead: 'share_lead',
} as const;

/** جداول الإشارة (Realtime) — الحدث إشارة لإعادة الجلب فقط. */
export const RUNTIME_SIGNAL_TABLES = ['session_pulses', 'session_leads', 'session_world_state'] as const;
