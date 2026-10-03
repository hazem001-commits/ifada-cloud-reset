// ============================================================
// src/lib/runtime/types.ts
// Investigation Runtime — النموذج المشترك (RESET-1). آمن للمتصفح:
// أنواع ومراجع فقط، بلا أي حقيقة قضية ولا قواعد حية.
//
//   OBSERVE → ACT → DISCOVER → PULSE → FOLLOW → CONNECT → TEST → WORLD REACTS
//
// المرجع الوحيد للقواعد الحية هو جدول case_runtime_rules بقاعدة البيانات
// (sql/037). هذا الملف يصف شكل لغة القواعد (للتحقق والاختبار) لا محتواها.
//
// العقد مراجع (kind + code) فوق الأنظمة الموجودة — لا مخزن كيانات ثانٍ:
//   place/object      → investigation_objects (+ locations للخط الزمني)
//   material/result   → evidence (+ مصدره: session_evidence_sources / runtime provenance)
//   statement         → interrogation_log (سطر قالته شخصية فعلاً)
//   person/unknown    → characters + الكيانات التدريجية (src/lib/entities)
//   timeline_event    → timeline_facts
//   action            → تفاعل عنصر / تحدٍّ / اختبار رابط / سؤال استجواب
//   processing_job    → session_object_state.processing_until + auto_advance
//   lead/world_state  → case_leads/session_leads، case_world_states/session_world_state
// ============================================================

export const RUNTIME_NODE_KINDS = [
  'place',
  'object',
  'material',
  'statement',
  'result',
  'lead',
  'person',
  'event',
  'action',
  'processing_job',
  'timeline_event',
  'unknown_entity',
  'world_state',
] as const;

export type RuntimeNodeKind = (typeof RUNTIME_NODE_KINDS)[number];

/** مرجع عقدة — لا يكرر بيانات النظام الذي يملكها. */
export interface RuntimeNodeRef {
  kind: RuntimeNodeKind;
  code: string;
}

/** أين تعيش كل عقدة فعلاً (توثيق قابل للاختبار — لا تخزين جديد). */
export const NODE_BACKING: Readonly<Record<RuntimeNodeKind, string>> = {
  place: 'investigation_objects(category=location) + locations',
  object: 'investigation_objects',
  material: 'evidence',
  statement: 'interrogation_log',
  result: 'evidence | object state, with provenance',
  lead: 'case_leads + session_leads',
  person: 'characters + progressive entities',
  event: 'timeline_facts | session_world_state',
  action: 'object interactions | investigation_challenges | connections | interrogation',
  processing_job: 'session_object_state.processing_until + auto_advance',
  timeline_event: 'timeline_facts',
  unknown_entity: 'progressive entity handle',
  world_state: 'case_world_states + session_world_state',
};

const CODE_RE = /^[A-Z0-9_-]{1,64}$/;

export function nodeRef(kind: RuntimeNodeKind, code: string): RuntimeNodeRef | null {
  const c = (code ?? '').trim().toUpperCase();
  return CODE_RE.test(c) ? { kind, code: c } : null;
}

export const nodeKey = (ref: RuntimeNodeRef): string => `${ref.kind}:${ref.code}`;

// ------------------------------------------------------------
// Pulse — تصنيف ثابت وصغير. لا تسميات خاصة بالعقد أبداً.
// ------------------------------------------------------------
export const PULSE_CATEGORIES = [
  'PERSON',
  'PLACE',
  'TIME',
  'DEVICE',
  'MOVEMENT',
  'PHYSICAL_TRACE',
  'RECORD',
  'CONTRADICTION',
  'NEW_ACTION',
] as const;

export type PulseCategory = (typeof PULSE_CATEGORIES)[number];

export const isPulseCategory = (v: unknown): v is PulseCategory =>
  typeof v === 'string' && (PULSE_CATEGORIES as readonly string[]).includes(v);

/** إشارة اجتماعية فقط: من (أو النظام) + فئة عامة + وقت. لا شيء آخر. */
export interface Pulse {
  id: string;
  /** null = النظام (نتيجة معالجة وصلت). */
  actorId: string | null;
  category: PulseCategory;
  at: string;
}

// ------------------------------------------------------------
// Discovery / Provenance / Action
// ------------------------------------------------------------
export type DiscoveryScope = 'private' | 'team';

export type ActionKind = 'object_interaction' | 'challenge' | 'connection' | 'joint_connection' | 'interrogation' | 'share' | 'runtime';

export interface ActionRef {
  kind: ActionKind;
  code: string;
  object?: string;
}

export interface Discovery {
  node: RuntimeNodeRef;
  scope: DiscoveryScope;
  /** من اكتشفه — null = النظام/العالم أو غير معروف للقارئ. */
  by: string | null;
  via: ActionRef | null;
}

export type ProvenanceCause = 'initial' | 'investigation_action' | 'challenge' | 'connection' | 'runtime' | 'world';

export interface Provenance {
  node: RuntimeNodeRef;
  cause: ProvenanceCause;
  actorId: string | null;
  at: string | null;
}

export interface ProcessingJob {
  object: string;
  running: boolean;
}

export interface TimelineEvent {
  person: string;
  place: string;
  startCk: number;
  endCk: number;
  anchor: RuntimeNodeRef;
}

export interface UnknownEntity {
  handle: string;
  label: string;
  identified: boolean;
}

export interface Person {
  /** شخصية استجواب (characters.code) إن كانت معروفة للاعب. */
  character: string | null;
  entity: UnknownEntity | null;
}

// ------------------------------------------------------------
// Lead / World State
// ------------------------------------------------------------
export type LeadStatus = 'open' | 'followed' | 'closed';

/** المراحل الصريحة لدورة حياة الخيط. */
export type LeadPhase = 'latent' | 'open_private' | 'open_team' | 'shared' | 'followed' | 'closed';

export interface Lead {
  code: string;
  /** وصف اتجاه — لا يحمل الجواب أبداً. */
  label: string;
  status: LeadStatus;
  shared: boolean;
  mine: boolean;
  openedAt: string | null;
}

export interface WorldState {
  code: string;
  headline: string;
  reachedAt: string;
}

export interface RevealedPlace {
  code: string;
  title: string;
  category: string;
  shared: boolean;
}

// ------------------------------------------------------------
// لغة القواعد (نفس sql/037 بالضبط) — للتحقق والمحاكاة فقط.
// ------------------------------------------------------------
export type RuntimeScope = 'actor' | 'team';

export type RuntimeCondition =
  | { kind: 'object_discovered'; object: string }
  | { kind: 'object_state'; object: string; states: string[] }
  | { kind: 'evidence_unlocked'; evidence: string }
  | { kind: 'connection_validated'; rule: string }
  | { kind: 'world_state'; state: string }
  | { kind: 'lead'; lead: string; status: LeadStatus };

export type RuntimeEffect =
  | { kind: 'open_lead'; lead: string }
  | { kind: 'follow_lead'; lead: string }
  | { kind: 'close_lead'; lead: string }
  | { kind: 'reveal_object'; object: string }
  | { kind: 'advance_object_state'; object: string; from: string; to: string }
  | { kind: 'reach_world_state'; state: string }
  | { kind: 'deliver_evidence'; evidence: string };

export interface RuntimeRule {
  id: string;
  status: 'draft' | 'approved';
  scope: RuntimeScope;
  conditions: RuntimeCondition[];
  effects: RuntimeEffect[];
  sortOrder: number;
}

/**
 * مادة يسلّمها العالم فقط (أثر حالة عالم): متطلّبها القديم هو هذا الحارس
 * غير القابل للتحقيق، فترفضها unlock_evidence لكل مسار لاعب إلى الأبد.
 */
export const RUNTIME_ONLY_REQUIRES = ['@RUNTIME'] as const;

/** حدود السلسلة — مرآة ثوابت _runtime_cascade. */
export const CASCADE_LIMITS = { maxFiringsPerTransaction: 32, maxPasses: 8 } as const;

/** قراءة اللاعب لحالة المحرك (runtime_state) — بعد التنقية. */
export interface RuntimeReadModel {
  leads: Lead[];
  world: WorldState[];
  places: RevealedPlace[];
  pulses: Pulse[];
}

/** ما يدخل المعرفة المصرّح بها من المحرك — بلا نبضات أبداً. */
export interface RuntimeKnowledgeInput {
  leads: Lead[];
  world: WorldState[];
  places: RevealedPlace[];
}
