// ============================================================
// src/app/case/[code]/board/boardStore.ts
// طبقة بيانات لوحة التحقيق V2 فوق Board V2 الحية (sql/031، مطبّق):
//   قراءة  → board_items / board_threads / board_validations (RLS: أعضاء الجلسة)
//   كتابة  → RPCs السيرفر فقط (لا كتابة جداول مباشرة؛ العميل لا يملك صلاحيتها)
// وجداول اللوحة القديمة لا تُقرأ ولا تُكتب هنا إطلاقاً (لا كتابة مزدوجة).
//
// فصل صارم:
//   الترتيب/السحب/الرسم/التثبيت  → RPCs اللوحة فقط.
//   اختبار الرابط                → testSelection فقط (test_board_selection →
//                                   propose_connection من 027 كالمستدعي)، ولا
//                                   يُستدعى إلا من فعل صريح للاعب.
//   تسوية الآثار المعلّقة         → settle (هادئة، بلا رد).
//
// "مثبت" لا يُكتب من العميل أبداً: board_validations يكتبها السيرفر بعد
// اختبار ناجح فقط، وتُقرأ لكل الفريق. فحوص العميل تحسّن التجربة فقط —
// السيرفر صاحب القرار.
// ============================================================
import {
  decodeItem,
  decodeThread,
  decodeValidation,
  validReasoningText,
  type BoardItem,
  type BoardItemRow,
  type BoardThread,
  type BoardThreadRow,
  type BoardValidation,
  type BoardValidationRow,
  type MaterialKind,
  type ReasoningKind,
  type ThreadKind,
} from './boardModel';
import { decodeJointProposals, type JointProposal, type JointRef } from './jointModel';

export const BOARD_TABLES = ['board_items', 'board_threads', 'board_validations'] as const;
export type BoardTable = (typeof BOARD_TABLES)[number];

type RpcError = { message?: string; code?: string } | null;

/** الحد الأدنى من عميل Supabase الذي تحتاجه اللوحة (قابل للحقن بالاختبارات). قراءة فقط من الجداول. */
export interface BoardClient {
  from(table: BoardTable): {
    select(cols: string): { eq(col: string, v: string): PromiseLike<{ data: unknown[] | null; error: unknown }> };
  };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError }>;
}

export type TestOutcome =
  | { status: 'validated'; meaning: string }
  | { status: 'not_established' }
  | { status: 'throttled' }
  | { status: 'unavailable' };

/** not_pinnable = رد السيرفر المحايد الواحد (مخفي/خاص/غير معروف/قضية أخرى). */
export type PinOutcome = 'pinned' | 'not_pinnable' | 'failed';

export interface ConnectionState {
  connections: { meaning: string; validated_at: string; validated_by: string | null }[];
  chapters: string[];
}

export interface BoardSnapshot {
  items: BoardItem[];
  threads: BoardThread[];
  validations: BoardValidation[];
}

const ITEM_COLS = 'id, session_id, kind, material_kind, material_code, text, x, y, author_id, created_at';
const THREAD_COLS = 'id, session_id, kind, from_item, to_item, author_id';
const VALIDATION_COLS = 'id, session_id, item_ids, meaning';

const isNotPinnable = (e: RpcError) => !!e && /NOT_PINNABLE/.test(e.message ?? '');

/** رد المدقق (فردي أو مشترك): المعنى فقط عند الإثبات؛ أي شكل آخر = "غير مثبت" بلا تفاصيل. */
function parseOutcome(data: unknown): TestOutcome {
  const d = (data ?? {}) as { status?: string; meaning?: unknown };
  if (d.status === 'validated' && typeof d.meaning === 'string') return { status: 'validated', meaning: d.meaning };
  if (d.status === 'throttled') return { status: 'throttled' };
  return { status: 'not_established' };
}

export function createBoardStore(client: BoardClient, sessionId: string) {
  return {
    /** حالة اللوحة كما يكتبها السيرفر. فشل أي قراءة = خطأ (لا لوحة جزئية صامتة). */
    async load(): Promise<BoardSnapshot> {
      const [i, t, v] = await Promise.all([
        client.from('board_items').select(ITEM_COLS).eq('session_id', sessionId),
        client.from('board_threads').select(THREAD_COLS).eq('session_id', sessionId),
        client.from('board_validations').select(VALIDATION_COLS).eq('session_id', sessionId),
      ]);
      if (i.error || t.error || v.error) throw new Error('BOARD_LOAD_FAILED');
      const keep = <T,>(x: T | null): x is T => x !== null;
      return {
        items: ((i.data ?? []) as BoardItemRow[]).map(decodeItem).filter(keep),
        threads: ((t.data ?? []) as BoardThreadRow[]).map(decodeThread).filter(keep),
        validations: ((v.data ?? []) as BoardValidationRow[]).map(decodeValidation).filter(keep),
      };
    },

    /** تثبيت مادة: المرجع فقط. السيرفر يقرر الأهلية (الفريق يعرف بوجودها أصلاً). */
    async pinMaterial(ref: { kind: MaterialKind; code: string }, x: number, y: number): Promise<PinOutcome> {
      const { error } = await client.rpc('pin_board_material', { p_session: sessionId, p_kind: ref.kind, p_code: ref.code, p_x: x, p_y: y });
      if (!error) return 'pinned'; // null id = مثبتة أصلاً — النتيجة نفسها
      return isNotPinnable(error) ? 'not_pinnable' : 'failed';
    },

    async addReasoning(kind: ReasoningKind, text: string, x: number, y: number): Promise<boolean> {
      const clean = validReasoningText(text);
      if (!clean) return false;
      const { error } = await client.rpc('add_board_reasoning', { p_session: sessionId, p_kind: kind, p_text: clean, p_x: x, p_y: y });
      return !error;
    },

    /** كاتبها فقط (السيرفر يفرض ذلك). */
    async editReasoning(id: string, text: string): Promise<boolean> {
      const clean = validReasoningText(text);
      if (!clean) return false;
      const { error } = await client.rpc('edit_board_reasoning', { p_item: id, p_text: clean });
      return !error;
    },

    /** موضع فقط — لا صلاحية ولا تحقق. */
    async move(id: string, x: number, y: number): Promise<boolean> {
      const { error } = await client.rpc('move_board_item', { p_item: id, p_x: x, p_y: y });
      return !error;
    },

    /** مادة: أي عضو. فكرة: كاتبها فقط (السيرفر يفرض ذلك). */
    async remove(id: string): Promise<boolean> {
      const { error } = await client.rpc('remove_board_item', { p_item: id });
      return !error;
    },

    async link(from: string, to: string, kind: ThreadKind): Promise<boolean> {
      if (from === to) return false;
      const { error } = await client.rpc('link_board_items', { p_session: sessionId, p_from: from, p_to: to, p_kind: kind });
      return !error;
    },

    /** كاتب الخيط فقط (السيرفر يفرض ذلك). */
    async unlink(id: string): Promise<boolean> {
      const { error } = await client.rpc('unlink_board_thread', { p_thread: id });
      return !error;
    },

    /**
     * الطريق الوحيد إلى المدقق. يُستدعى من زر "اختبر الرابط" فقط. يرسل
     * معرّفات قطع اللوحة؛ السيرفر يحوّلها لعقد ويختبرها كالمستدعي (027).
     */
    async testSelection(itemIds: readonly string[]): Promise<TestOutcome> {
      const { data, error } = await client.rpc('test_board_selection', { p_session: sessionId, p_items: [...new Set(itemIds)] });
      return error ? { status: 'unavailable' } : parseOutcome(data);
    },

    // ---------- الربط المشترك (sql/033، حي) ----------
    /** العرض المقنَّع فقط — لا قراءة لجداول المساهمات أبداً (RPC-only بالسيرفر). */
    async jointProposals(): Promise<JointProposal[]> {
      const { data, error } = await client.rpc('joint_proposals', { p_session: sessionId });
      return error ? [] : decodeJointProposals(data);
    },

    /** مساهمة بمادة أقرؤها: في المقترح المفتوح إن وُجد، وإلا يُفتح واحد. */
    async contributeJoint(proposalId: string | null, ref: JointRef): Promise<'contributed' | 'not_contributable' | 'failed'> {
      let id = proposalId;
      if (!id) {
        const opened = await client.rpc('open_joint_proposal', { p_session: sessionId, p_relation: null });
        if (opened.error || typeof opened.data !== 'string') return 'failed';
        id = opened.data;
      }
      const { error } = await client.rpc('contribute_to_joint', { p_proposal: id, p_kind: ref.kind, p_id: ref.id });
      if (!error) return 'contributed';
      return /NOT_CONTRIBUTABLE/.test(error.message ?? '') ? 'not_contributable' : 'failed';
    },

    /** مساهمتي فقط (السيرفر يفرض ذلك). */
    async withdrawJoint(proposalId: string, ref: JointRef): Promise<boolean> {
      const { error } = await client.rpc('withdraw_joint_contribution', { p_proposal: proposalId, p_kind: ref.kind, p_id: ref.id });
      return !error;
    },

    async closeJoint(proposalId: string): Promise<boolean> {
      const { error } = await client.rpc('close_joint_proposal', { p_proposal: proposalId });
      return !error;
    },

    /** الطريق الوحيد لاختبار ربط مشترك. يُستدعى من زر «اختبر الربط المشترك» فقط. */
    async testJoint(proposalId: string): Promise<TestOutcome> {
      const { data, error } = await client.rpc('test_joint_proposal', { p_proposal: proposalId });
      return error ? { status: 'unavailable' } : parseOutcome(data);
    },

    /** تسوية هادئة لآثار الفريق المعلّقة كعضو نفسه. لا يرجع شيئاً. */
    async settle(): Promise<void> {
      await client.rpc('settle_connection_effects', { p_session: sessionId });
    },

    async connectionState(): Promise<ConnectionState> {
      const { data, error } = await client.rpc('session_connection_state', { p_session: sessionId });
      if (error || !data || typeof data !== 'object') return { connections: [], chapters: [] };
      const d = data as Partial<ConnectionState>;
      return {
        connections: Array.isArray(d.connections) ? d.connections.filter((c) => typeof c?.meaning === 'string') : [],
        chapters: Array.isArray(d.chapters) ? d.chapters.filter((c): c is string => typeof c === 'string') : [],
      };
    },
  };
}

export type BoardStore = ReturnType<typeof createBoardStore>;

// ------------------------------------------------------------
// تسوية الآثار — متى؟ (منطق نقي، بلا إغراق)
// ------------------------------------------------------------
export type SettleReason = 'open' | 'validated' | 'specs_changed' | 'knowledge_changed';
export const SETTLE_MIN_GAP_MS = 30_000;

/**
 * هل نسوّي الآن؟ بعد تثبيت ناجح: دائماً (قد ينتج أثر للتو). فتح اللوحة /
 * تغيّر التخصص / تغيّر المعرفة: فقط إن مرّت فترة كافية منذ آخر تسوية.
 */
export function shouldSettle(reason: SettleReason, lastAt: number | null, now: number): boolean {
  if (reason === 'validated') return true;
  return lastAt === null || now - lastAt >= SETTLE_MIN_GAP_MS;
}
