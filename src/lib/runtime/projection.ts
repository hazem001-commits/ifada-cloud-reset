// ============================================================
// src/lib/runtime/projection.ts
// قراءات المحرك: (1) تنقية runtime_state (sql/037) لنموذج قراءة مضبوط،
// مغلق عند الشك؛ (2) إسقاط صفوف الأنظمة الموجودة (فهرس العناصر،
// فهرس الأدلة، الخط الزمني) على عقد/اكتشافات المحرك — بلا تخزين جديد.
//
// قبل تطبيق 037 لا توجد الدالة: isRuntimeNotInstalled يميّز ذلك، فيبقى
// كل شيء على سلوكه الحالي (لا انهيار لغرفة 714 ولا للمشهد 17).
// ============================================================
import { sanitizePulses } from './pulse';
import {
  nodeRef,
  type Discovery,
  type Lead,
  type ProcessingJob,
  type RevealedPlace,
  type RuntimeKnowledgeInput,
  type RuntimeNodeRef,
  type RuntimeReadModel,
  type TimelineEvent,
  type WorldState,
} from './types';

const CODE_RE = /^[A-Z0-9_-]{1,64}$/;
const str = (v: unknown, max = 400): string | null => (typeof v === 'string' && v.length <= max ? v : null);
const time = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

/** "الدالة غير مثبّتة بعد" فقط (037 لم يُطبَّق) — أي خطأ آخر حقيقي. */
export function isRuntimeNotInstalled(error: { code?: string } | null | undefined): boolean {
  return !!error && (error.code === 'PGRST202' || error.code === '42883');
}

export const EMPTY_RUNTIME: RuntimeReadModel = Object.freeze({ leads: [], world: [], places: [], pulses: [] }) as RuntimeReadModel;

function parseLead(raw: unknown): Lead | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const code = str(r.lead, 64);
  const label = str(r.label, 200);
  if (!code || !CODE_RE.test(code) || !label) return null;
  if (r.status !== 'open' && r.status !== 'followed' && r.status !== 'closed') return null;
  if (typeof r.shared !== 'boolean' || typeof r.mine !== 'boolean') return null;
  // خيط غير مشترك ليس لي = لا يجب أن يصل أصلاً → مغلق عند الشك
  if (!r.shared && !r.mine) return null;
  return { code, label, status: r.status, shared: r.shared, mine: r.mine, openedAt: time(r.opened_at) };
}

function parseWorld(raw: unknown): WorldState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const code = str(r.state, 64);
  const headline = str(r.headline, 200);
  const reachedAt = time(r.reached_at);
  if (!code || !CODE_RE.test(code) || !headline || !reachedAt) return null;
  return { code, headline, reachedAt };
}

function parsePlace(raw: unknown): RevealedPlace | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const code = str(r.code, 64);
  const title = str(r.title, 200);
  const category = str(r.category, 32);
  if (!code || !CODE_RE.test(code) || !title || !category || typeof r.shared !== 'boolean') return null;
  return { code, title, category, shared: r.shared };
}

function list<T>(raw: unknown, parse: (x: unknown) => T | null): T[] {
  return Array.isArray(raw) ? raw.map(parse).filter((x): x is T => x !== null) : [];
}

/** runtime_state jsonb → نموذج قراءة. شكل غير صالح = null (لا عرض). */
export function parseRuntimeState(raw: unknown): RuntimeReadModel | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    leads: list(r.leads, parseLead),
    world: list(r.world, parseWorld),
    places: list(r.places, parsePlace),
    pulses: sanitizePulses(r.pulses),
  };
}

/** ما يُسمح أن يدخل المعرفة من المحرك — النبضات تُحذف هنا صراحةً. */
export function runtimeKnowledgeInput(model: RuntimeReadModel | null): RuntimeKnowledgeInput | null {
  if (!model) return null;
  return { leads: model.leads, world: model.world, places: model.places };
}

// ------------------------------------------------------------
// إسقاط الأنظمة الموجودة على عقد المحرك (بلا تخزين جديد)
// ------------------------------------------------------------
export interface ObjectIndexLike {
  code: string;
  category: string;
  discovered: boolean;
  is_shared: boolean;
  state: string;
  processing?: boolean;
}

/** عنصر الموقع = مكان؛ غير ذلك = عنصر. */
export const objectNodeRef = (o: Pick<ObjectIndexLike, 'code' | 'category'>): RuntimeNodeRef | null =>
  nodeRef(o.category === 'location' ? 'place' : 'object', o.code);

export const materialRef = (evidenceCode: string): RuntimeNodeRef | null => nodeRef('material', evidenceCode);

/**
 * اكتشافات العناصر كما يراها اللاعب: خاص (اكتشافي غير المشترك) أو فريق.
 * المحجوب عني (اكتشاف زميل الخاص، state = 'HIDDEN') ليس اكتشافاً لي.
 */
export function objectDiscoveries(rows: readonly ObjectIndexLike[], myId: string | null): Discovery[] {
  const out: Discovery[] = [];
  for (const o of rows) {
    if (!o.discovered || o.state === 'HIDDEN') continue;
    const node = objectNodeRef(o);
    if (!node) continue;
    out.push({ node, scope: o.is_shared ? 'team' : 'private', by: o.is_shared ? null : myId, via: null });
  }
  return out;
}

/** مهام المعالجة = processing_until الحالي (019) — لا مجدول جديد. */
export function processingJobs(rows: readonly ObjectIndexLike[]): ProcessingJob[] {
  return rows.filter((o) => o.state !== 'HIDDEN' && o.processing === true).map((o) => ({ object: o.code, running: true }));
}

export interface TimelineFactLike {
  person_code: string;
  location_code: string;
  start_ck: number;
  end_ck: number;
  evidence_code: string;
}

/** حقيقة خط زمني = حدث زمني مرسى على مادة (timeline_facts). */
export function timelineEvents(facts: readonly TimelineFactLike[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const f of facts) {
    const anchor = materialRef(f.evidence_code);
    if (!anchor || !Number.isFinite(f.start_ck) || !Number.isFinite(f.end_ck) || f.end_ck < f.start_ck) continue;
    out.push({ person: f.person_code, place: f.location_code, startCk: f.start_ck, endCk: f.end_ck, anchor });
  }
  return out;
}
