// ============================================================
// src/app/case/[code]/board/boardModel.ts
// نموذج لوحة التحقيق V2 — دوال نقية (لا شبكة، لا React).
//
// اللوحة سطح تفكير مشترك يحمل "مواد" التحقيق نفسها، لا عقداً مرقّمة.
// قاعدتان لا تُكسران:
//   1. كل لاعب يرى المادة فقط إن كانت مرئية له هو (نفس evidence_index
//      وفهرس العناصر وسياسة القضية). مادة لا يراها = غير موجودة على لوحته
//      (لا عنوان، لا مكان فارغ، لا عدد).
//   2. التثبيت على اللوحة المشتركة = إظهار للفريق. لذا لا يُثبَّت إلا ما
//      يراه الفريق أصلاً؛ اكتشافي الخاص يُشارَك أولاً بقاعدة اللعبة نفسها.
//
// التخزين: جداول Board V2 الحية (sql/031 — board_items / board_threads /
// board_validations)، والكتابة عبر RPCs السيرفر فقط. المادة صف مرجع فقط
// (نوع + كود، نصها فارغ بقيد DB) — العنوان يُقرأ من بيانات كل لاعب
// المصرّح بها عند العرض. جداول اللوحة القديمة لا تُقرأ ولا تُكتب هنا.
// ============================================================
import type { EvidenceItem } from '@/types/case';
import type { InvestigationObject } from '@/types/investigationObjects';
import type { NodeRef } from '@/lib/connections/types';
import { evidenceVisibility, type RestrictedEvidencePolicy } from '@/lib/evidenceVisibility';

// ------------------------------------------------------------
// الأنواع
// ------------------------------------------------------------

/** مواد مكتوبة (من القضية) يمكن وضعها على اللوحة. */
export type MaterialKind = 'evidence' | 'object' | 'location';

/** تفكير اللاعبين — ملاحظات فريق، ليست حقيقة قضية. */
export type ReasoningKind = 'fact' | 'question' | 'hypothesis';
export const REASONING_KINDS: readonly ReasoningKind[] = ['fact', 'question', 'hypothesis'];

export interface MaterialRef {
  kind: MaterialKind;
  code: string;
}

interface ItemBase {
  id: string;
  x: number;
  y: number;
  authorId: string;
  createdAt: string;
}
export type BoardItem =
  | (ItemBase & { kind: 'material'; ref: MaterialRef })
  | (ItemBase & { kind: ReasoningKind; text: string });

/**
 * خيوط اللوحة (لغة الربط):
 *   tentative — "نظن أن هذه مرتبطة" (مؤقت، لا يعني شيئاً بالسيرفر)
 *   support   — لاعب يسند مادة لفرضيته (تفكيره هو، ليس تحققاً)
 *   tension   — تناقض/توتر داخل تحليل فرضية
 * "مثبت" ليس نوع خيط يكتبه العميل: يأتي من السيرفر فقط.
 */
export type ThreadKind = 'tentative' | 'support' | 'tension';
export const THREAD_KINDS: readonly ThreadKind[] = ['tentative', 'support', 'tension'];

export interface BoardThread {
  id: string;
  kind: ThreadKind;
  from: string;
  to: string;
  authorId: string;
}

// ------------------------------------------------------------
// صفوف Board V2 (sql/031) → نموذج اللوحة. أي شكل غير متوقع يُسقط (مغلق).
// ------------------------------------------------------------
export interface BoardItemRow {
  id: string;
  session_id: string;
  kind: string;
  material_kind: string | null;
  material_code: string | null;
  text: string;
  x: number;
  y: number;
  author_id: string;
  created_at: string;
}
export interface BoardThreadRow {
  id: string;
  session_id: string;
  kind: string;
  from_item: string;
  to_item: string;
  author_id: string;
}
/** مكتوبة بالسيرفر فقط (test_board_selection). لا معرّف قاعدة. */
export interface BoardValidationRow {
  id: string;
  session_id: string;
  item_ids: string[];
  meaning: string;
}
export interface BoardValidation {
  id: string;
  itemIds: string[];
  meaning: string;
}

const MATERIAL_KINDS: readonly MaterialKind[] = ['evidence', 'object', 'location'];
const CODE_RE = /^[A-Z0-9_-]{1,64}$/;
export const MAX_REASONING_CHARS = 400;

export function decodeItem(row: BoardItemRow): BoardItem | null {
  const base: ItemBase = { id: row.id, x: clamp01(row.x), y: clamp01(row.y), authorId: row.author_id, createdAt: row.created_at };
  if (row.kind === 'material') {
    const kind = row.material_kind as MaterialKind;
    const code = row.material_code ?? '';
    if (!MATERIAL_KINDS.includes(kind) || !CODE_RE.test(code)) return null;
    return { ...base, kind: 'material', ref: { kind, code } };
  }
  if ((REASONING_KINDS as readonly string[]).includes(row.kind) && typeof row.text === 'string' && row.text) {
    return { ...base, kind: row.kind as ReasoningKind, text: row.text };
  }
  return null;
}

/** نوع خيط خارج اللغة المسموحة (مثل "validated") لا يُعرض أبداً — "مثبت" من السيرفر فقط. */
export function decodeThread(row: BoardThreadRow): BoardThread | null {
  if (!(THREAD_KINDS as readonly string[]).includes(row.kind) || row.from_item === row.to_item) return null;
  return { id: row.id, kind: row.kind as ThreadKind, from: row.from_item, to: row.to_item, authorId: row.author_id };
}

export function decodeValidation(row: BoardValidationRow): BoardValidation | null {
  if (!Array.isArray(row.item_ids) || row.item_ids.length < 2 || typeof row.meaning !== 'string' || !row.meaning) return null;
  return { id: row.id, itemIds: row.item_ids.filter((x): x is string => typeof x === 'string'), meaning: row.meaning };
}

/** خيط مثبت = طرفاه داخل مجموعة كتبها السيرفر بعد اختبار ناجح. */
export function threadValidated(t: BoardThread, validations: readonly BoardValidation[]): boolean {
  return validations.some((v) => v.itemIds.includes(t.from) && v.itemIds.includes(t.to));
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(0.98, Math.max(0.02, v)) : 0.5);

// ------------------------------------------------------------
// منظور العارض (ما يراه هذا اللاعب فقط)
// ------------------------------------------------------------
export interface ViewerCatalog {
  caseId: string;
  policy: RestrictedEvidencePolicy;
  evidence: readonly EvidenceItem[];
  objects: readonly InvestigationObject[];
  /**
   * أدلة أقرؤها وهي خاصة بقناتي (إرشاد من السيرفر — /api/private-evidence،
   * أكواد أقرؤها أصلاً فقط). غائب = لا إرشاد بعد: السيرفر يقرر عند التثبيت.
   */
  privateEvidence?: readonly string[];
}

export type MaterialView =
  | {
      kind: 'evidence';
      code: string;
      title: string;
      /** readable = أقرأ محتواه؛ restricted = أعرفه بعنوانه فقط (قاعدة منتج). */
      access: 'readable' | 'restricted';
      evidenceKind: EvidenceItem['kind'];
      clock: string | null;
      hasMedia: boolean;
      ownerSpec: EvidenceItem['owner_spec'];
      item: EvidenceItem;
    }
  | {
      kind: 'object' | 'location';
      code: string;
      title: string;
      category: InvestigationObject['category'];
      state: string;
      shared: boolean;
      object: InvestigationObject;
    };

const objectKnownToMe = (o: InvestigationObject) => o.discovered && o.state !== 'HIDDEN';

function evidenceView(code: string, cat: ViewerCatalog): MaterialView | null {
  const e = cat.evidence.find((x) => x.code === code);
  if (!e) return null;
  const visibility = evidenceVisibility(
    { code: e.code, title: e.title, kind: e.kind, owner_spec: e.owner_spec, clock_label: e.clock_label, body: e.body, readable: e.readable },
    cat.policy,
  );
  if (!visibility) return null;
  return {
    kind: 'evidence',
    code: e.code,
    title: e.title,
    access: visibility,
    evidenceKind: e.kind,
    clock: e.clock_label,
    hasMedia: visibility === 'readable' && e.has_media,
    ownerSpec: e.owner_spec,
    item: e,
  };
}

function objectView(code: string, cat: ViewerCatalog, want: 'object' | 'location'): MaterialView | null {
  const o = cat.objects.find((x) => x.code === code);
  if (!o || !objectKnownToMe(o)) return null;
  const isLocation = o.category === 'location';
  if (want === 'object' && isLocation) return null;
  if (want === 'location' && !isLocation) return null;
  return { kind: isLocation ? 'location' : 'object', code: o.code, title: o.title, category: o.category, state: o.state, shared: o.is_shared, object: o };
}

/** عرض المادة لهذا العارض — أو null (غير موجودة بالنسبة له إطلاقاً). */
export function resolveMaterial(ref: MaterialRef, cat: ViewerCatalog): MaterialView | null {
  switch (ref.kind) {
    case 'evidence':
      return evidenceView(ref.code, cat);
    case 'object':
      return objectView(ref.code, cat, 'object');
    case 'location':
      return objectView(ref.code, cat, 'location');
  }
}

/** العناصر والخيوط التي يراها هذا العارض فعلاً (المخفي يختفي مع خيوطه). */
export function visibleBoard(
  items: readonly BoardItem[],
  threads: readonly BoardThread[],
  cat: ViewerCatalog,
): { items: { item: BoardItem; view: MaterialView | null }[]; threads: BoardThread[] } {
  const shown = items
    .map((item) => ({ item, view: item.kind === 'material' ? resolveMaterial(item.ref, cat) : null }))
    .filter((x) => x.item.kind !== 'material' || x.view !== null);
  const ids = new Set(shown.map((x) => x.item.id));
  return { items: shown, threads: threads.filter((t) => ids.has(t.from) && ids.has(t.to)) };
}

// ------------------------------------------------------------
// أهلية التثبيت على اللوحة المشتركة
// ------------------------------------------------------------
export type PinEligibility =
  /** الفريق يراها أصلاً — التثبيت لا يكشف شيئاً جديداً. */
  | { status: 'eligible'; ref: { kind: MaterialKind; code: string } }
  /** اكتشافي الخاص: يُشارَك أولاً بقاعدة اللعبة (share_object_discovery). */
  | { status: 'share_first'; code: string }
  /**
   * سياسة 'hidden' (توزيع بالقنوات): أقرؤه، لكن العميل لا يعرف إن كان
   * بالمسار المشترك أم بقناتي الخاصة (الربط بالسيرفر فقط). السيرفر يقرر
   * عند التثبيت (035): المشترك يُثبَّت، الخاص يُرفض بلا أثر.
   */
  | { status: 'server_decides'; ref: { kind: MaterialKind; code: string } }
  /**
   * خاصة بقناتي (حسب السيرفر): مقروءة لي، تُساهَم بها في ربط مشترك دون
   * كشف، ولا تُثبَّت على اللوحة المشتركة أبداً — لا يُعرض فعل سيرفضه السيرفر.
   */
  | { status: 'private'; code: string }
  /** غير مرئية لي، أو قضية سياستها تمنع ظهورها للفريق قبل مشاركة لا تملكها اللوحة بعد. */
  | { status: 'unavailable' };

function ancestorsTeamVisible(o: InvestigationObject, objects: readonly InvestigationObject[]): boolean {
  const byCode = new Map(objects.map((x) => [x.code, x]));
  let parent = o.parent_code ? byCode.get(o.parent_code) : undefined;
  let code = o.parent_code;
  for (let depth = 0; code; depth += 1) {
    if (depth > 8 || !parent) return false; // سلف غير مرئي لي/مفقود/عمق زائد → مغلق
    if (!parent.discovered || !parent.is_shared) return false;
    code = parent.parent_code;
    parent = code ? byCode.get(code) : undefined;
  }
  return true;
}

export function pinEligibility(kind: MaterialKind, code: string, cat: ViewerCatalog): PinEligibility {
  if (kind === 'evidence') {
    const v = evidenceView(code, cat);
    if (!v) return { status: 'unavailable' };
    // سياسة 'title' (غرفة 714): كل دليل مفتوح يظهر للفريق بعنوانه أصلاً.
    if (cat.policy === 'title') return { status: 'eligible', ref: { kind, code } };
    // سياسة 'hidden': ما أقرؤه قد يكون بالمسار المشترك — السيرفر وحده يعرف.
    if (v.kind !== 'evidence' || v.access !== 'readable') return { status: 'unavailable' };
    if (cat.privateEvidence?.includes(code)) return { status: 'private', code };
    return { status: 'server_decides', ref: { kind, code } };
  }
  const o = cat.objects.find((x) => x.code === code);
  if (!o || !objectKnownToMe(o)) return { status: 'unavailable' };
  if ((kind === 'location') !== (o.category === 'location')) return { status: 'unavailable' };
  if (!o.is_shared) return { status: 'share_first', code };
  if (!ancestorsTeamVisible(o, cat.objects)) return { status: 'unavailable' };
  return { status: 'eligible', ref: { kind, code } };
}

// ------------------------------------------------------------
// اختبار الرابط — من اختيار صريح فقط
// ------------------------------------------------------------
export const MIN_TEST = 2;
export const MAX_TEST = 5;

/**
 * يحوّل اختيار اللاعب إلى عقد اقتراح. فقط مواد مرئية له (أفكار اللاعبين
 * ليست عقداً). null = الاختيار غير صالح للاختبار (لا يُرسل شيء).
 */
/**
 * "مرئي للفريق" ≠ "مقروء/صالح للاستدلال". دليل محجوب (عنوان فقط) يظهر
 * على اللوحة لأن الفريق يعرف بوجوده، لكنه لا يصلح سنداً ولا عقدة اختبار
 * ولا مادة يستدل منها الذكاء — إلا لمن يقرؤه.
 */
export function canReason(view: MaterialView | null): boolean {
  return !!view && (view.kind !== 'evidence' || view.access === 'readable');
}

export function proposalFromSelection(
  selected: readonly string[],
  items: readonly BoardItem[],
  cat: ViewerCatalog,
): NodeRef[] | null {
  const unique = [...new Set(selected)];
  if (unique.length < MIN_TEST || unique.length > MAX_TEST) return null;
  const nodes: NodeRef[] = [];
  for (const id of unique) {
    const item = items.find((i) => i.id === id);
    if (!item || item.kind !== 'material') return null;
    const view = resolveMaterial(item.ref, cat);
    if (!view || !canReason(view)) return null; // لا أختبر ما لا أقرؤه
    nodes.push({ kind: view.kind, id: view.code });
  }
  return nodes;
}

// ------------------------------------------------------------
// ممر التركيز — بلا استنتاج
// ------------------------------------------------------------
/**
 * عند التركيز على فرضية/سؤال: يظهر فقط ما ربطه اللاعبون بها صراحةً
 * (خيوط مباشرة)، والروابط المثبتة بين تلك المواد. لا "صلة" مستنتجة.
 */
export function focusCorridor(
  focusId: string,
  threads: readonly BoardThread[],
  validatedGroups: readonly (readonly string[])[] = [],
): { items: Set<string>; threads: Set<string> } {
  const items = new Set<string>([focusId]);
  const ts = new Set<string>();
  for (const t of threads) {
    if (t.from === focusId || t.to === focusId) {
      items.add(t.from);
      items.add(t.to);
      ts.add(t.id);
    }
  }
  // روابط مثبتة معروفة أصلاً بين مواد داخل الممر فقط
  for (const t of threads) {
    if (items.has(t.from) && items.has(t.to)) ts.add(t.id);
  }
  for (const g of validatedGroups) if (g.every((id) => items.has(id))) for (const id of g) items.add(id);
  return { items, threads: ts };
}

// ------------------------------------------------------------
// أثر المصدر — من بيانات مصرّح بها فقط، بلا اختراع
// ------------------------------------------------------------
export interface ProvenanceRow {
  evidence_code: string;
  object_code: string;
  object_title: string;
  object_category: string;
}
export interface OriginStep {
  kind: 'location' | 'object' | 'evidence';
  code: string;
  title: string;
}

/**
 * من أين أتت هذه المادة؟ للدليل: العنصر الذي أنتجه (evidence_provenance —
 * مرئي لي فقط) ثم سلسلة آبائه المعروفة لي. للعنصر: سلسلة آبائه المعروفة.
 * سلف غير مرئي لي = تنتهي السلسلة عنده (لا يُكشف ولا يُخمَّن).
 */
export function originTrace(view: MaterialView, cat: ViewerCatalog, provenance: readonly ProvenanceRow[]): OriginStep[] {
  const steps: OriginStep[] = [];
  const known = new Map(cat.objects.filter(objectKnownToMe).map((o) => [o.code, o]));
  let start: InvestigationObject | undefined;
  if (view.kind === 'evidence') {
    const src = provenance.find((p) => p.evidence_code === view.code);
    start = src ? known.get(src.object_code) : undefined;
    if (!start) return [];
  } else {
    start = known.get(view.code);
  }
  const chain: InvestigationObject[] = [];
  for (let o = start, depth = 0; o && depth <= 8; depth += 1) {
    chain.unshift(o);
    o = o.parent_code ? known.get(o.parent_code) : undefined;
  }
  for (const o of chain) steps.push({ kind: o.category === 'location' ? 'location' : 'object', code: o.code, title: o.title });
  if (view.kind === 'evidence') steps.push({ kind: 'evidence', code: view.code, title: view.title });
  return steps;
}

// ------------------------------------------------------------
// ممرات القضية (مثل المشهد 17: ما كُتب / ما طُلب / ما حدث)
// ------------------------------------------------------------
export interface BoardLane {
  id: string;
  label: string;
}
/** الممر = شريط أفقي من اللوحة (x). لا تخزين إضافي: الموضع نفسه هو التصنيف. */
export function laneOf(x: number, lanes: readonly BoardLane[]): BoardLane | null {
  if (lanes.length === 0) return null;
  // RTL: الممر الأول يبدأ من اليمين
  const idx = Math.min(lanes.length - 1, Math.floor((1 - clamp01(x)) * lanes.length));
  return lanes[idx] ?? null;
}

export function validReasoningText(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || t.length > MAX_REASONING_CHARS) return null;
  return t;
}

/**
 * موضع افتراضي لمادة/فكرة جديدة: لولب حول مركز اللوحة (حتمي، بلا تداخل
 * متكرر). اللاعب يحرّكها بعدها حيث يفكر — اللوحة لا ترتّب نفسها أبداً.
 */
export function nextSpot(n: number, center: { x: number; y: number } = { x: 0.5, y: 0.5 }): { x: number; y: number } {
  // متباعدة بما يكفي ليظهر الخيط بين قطعتين (القطعة ≈ 15٪ من العرض).
  const angle = n * 2.399963; // الزاوية الذهبية
  const r = 0.16 + 0.05 * Math.sqrt(n);
  return {
    x: Math.min(0.9, Math.max(0.1, center.x + r * Math.cos(angle))),
    y: Math.min(0.88, Math.max(0.12, center.y + r * 1.15 * Math.sin(angle))),
  };
}
