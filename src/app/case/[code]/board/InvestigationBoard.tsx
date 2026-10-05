// ============================================================
// src/app/case/[code]/board/InvestigationBoard.tsx
// لوحة التحقيق V2 — سطح تفكير مشترك يحمل مواد التحقيق نفسها.
//
//   مكتب:  مساحة مكانية — رفع/وضع المواد، خيوط، ممرات القضية، تكبير التركيز.
//   لمس (هاتف/لوح): نفس السطح المكاني بكاميرا (TouchBoard) — تجوّل/قرصة،
//          لمسة = تركيز بورقة سفلية، ضغط مطوّل = نقل، والربط وضع صريح.
//          ليست قائمة: المواضع المشتركة نفسها، والخيوط مرئية.
//
// قواعد لا تُكسر:
//   • السحب/الترتيب/الرسم لا يستدعي المدقق أبداً. فقط "اختبر الرابط".
//   • نتيجة الفشل محايدة دائماً: لا أي جزء خطأ، لا "قريب"، لا قاعدة مخفية.
//   • ما لا يراه هذا اللاعب غير موجود على لوحته (boardModel.visibleBoard).
//   • الذكاء لا يرتّب اللوحة ولا يقترح الإجابة؛ يعمل فقط عند طلب صريح.
//   • التخزين: Board V2 (sql/031) عبر boardStore فقط. "مثبت" يُقرأ من
//     board_validations التي يكتبها السيرفر — لا يُفترض محلياً أبداً.
// ============================================================
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { subscribeAuthenticated } from '@/lib/supabase/realtime';
import { getCaseContract } from '@/cases/registry';
import { useCaseId, useCasePresentation } from '@/cases/CaseContext';
import type { EvidenceItem } from '@/types/case';
import type { InvestigationObject } from '@/types/investigationObjects';
import EvidenceExaminationRoom from '../evidence/EvidenceExaminationRoom';
import { SurfaceHeader, SurfaceState, toolClass } from '../ui/Surface';
import BoardPiece, { describe } from './BoardPiece';
import HypothesisSheet from './HypothesisSheet';
import {
  focusCorridor,
  canReason,
  nextSpot,
  originTrace,
  threadValidated,
  pinEligibility,
  proposalFromSelection,
  resolveMaterial,
  visibleBoard,
  type BoardItem,
  type BoardThread,
  type BoardValidation,
  type MaterialKind,
  type MaterialView,
  type ProvenanceRow,
  type ReasoningKind,
  type ThreadKind,
  type ViewerCatalog,
} from './boardModel';
import JointStrip from './JointStrip';
import TouchBoard, { type Cover, type TouchBoardHandle } from './TouchBoard';
import Sheet from '../play/Sheet';
import { activeProposal, alreadyMine, canContribute, type JointProposal, type JointRef } from './jointModel';
import { BOARD_TABLES, createBoardStore, shouldSettle, type BoardClient, type ConnectionState, type SettleReason, type TestOutcome } from './boardStore';
import s from './board.module.css';

// لمس: الهاتف، واللوح العمودي/الصغير بإصبع (السطح نفسه بكاميرا لمس).
const MOBILE_QUERY = '(max-width: 760px), (pointer: coarse) and (max-width: 1100px)';
function subscribeMedia(cb: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const isMobileNow = () => window.matchMedia(MOBILE_QUERY).matches;

type Panel = 'none' | 'tray' | 'compose' | 'sheet' | 'trace' | 'add' | 'ledger';

const THREAD_WORD: Record<ThreadKind, string> = { tentative: 'رابط مؤقت', support: 'إسناد', tension: 'توتر' };
const NEUTRAL = 'لم يثبت هذا الرابط بعد.';
const PRIVATE_NOTE = 'هذه المادة خاصة بك — لا تُثبَّت على اللوحة المشتركة. ساهم بها في ربط مشترك دون كشفها.';

export default function InvestigationBoard({
  sessionId,
  myId,
  evidence,
  privateEvidence,
  specsKey,
  members,
  onReturnToSource,
}: {
  sessionId: string;
  myId: string;
  evidence: EvidenceItem[];
  /** أدلة أقرؤها وهي خاصة بقناتي (إرشاد من السيرفر). لا تُعرض كقابلة للتثبيت. */
  privateEvidence?: readonly string[];
  /** أعضاء الجلسة — لاسم بشري على المساهمات المشتركة فقط. */
  members: readonly { userId: string; displayName: string }[];
  /** يتغيّر عند تغيّر تخصصاتي — يفيد تسوية الآثار المعلّقة. */
  specsKey: string;
  /** ارجع لمصدر المادة في مكان التحقيق. */
  onReturnToSource: (objectCode: string) => void;
}) {
  const caseId = useCaseId();
  const { boardLanes } = useCasePresentation();
  const policy = getCaseContract(caseId)?.restrictedEvidence ?? 'hidden';
  const store = useMemo(() => createBoardStore(createClient() as unknown as BoardClient, sessionId), [sessionId]);
  const mobile = useSyncExternalStore(subscribeMedia, isMobileNow, () => false);

  const [items, setItems] = useState<BoardItem[]>([]);
  const [threads, setThreads] = useState<BoardThread[]>([]);
  const [validations, setValidations] = useState<BoardValidation[]>([]);
  const [joint, setJoint] = useState<JointProposal[]>([]);
  /** أدلة رفض السيرفر تثبيتها قبل وصول إرشاد القنوات — لا يُعرض لها زر تثبيت ثانية. */
  const [refusedPins, setRefusedPins] = useState<Set<string>>(new Set());
  const [objects, setObjects] = useState<InvestigationObject[]>([]);
  const [provenance, setProvenance] = useState<ProvenanceRow[]>([]);
  const [ledger, setLedger] = useState<ConnectionState>({ connections: [], chapters: [] });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('none');
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: TestOutcome['status'] | 'note'; text: string } | null>(null);
  const [examining, setExamining] = useState<EvidenceItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [composeKind, setComposeKind] = useState<ReasoningKind>('question');
  const [composeText, setComposeText] = useState('');
  /** تعديل فكرة كتبتُها (لا تغيير نوعها). null = فكرة جديدة. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [lifted, setLifted] = useState<string | null>(null);
  /** لمس: وضع الربط الصريح — المادة التالية الملموسة تنضم للاختيار. */
  const [linking, setLinking] = useState(false);
  const touchRef = useRef<TouchBoardHandle>(null);
  /** لمس: اللوحة تملأ ما تحت رأس القضية بالضبط (100dvh − موضعها). */
  const [touchTop, setTouchTop] = useState<number | null>(null);
  const measureTouch = useCallback((el: HTMLElement | null) => {
    if (el) setTouchTop(Math.round(el.getBoundingClientRect().top + window.scrollY));
  }, []);

  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const lastSettleRef = useRef<number | null>(null);
  /** معرّفات ما على لوحتي — لتمييز أحداث الحذف (غير قابلة للتصفية بالجلسة). */
  const knownIdsRef = useRef<Set<string>>(new Set());
  const jointRef = useRef<HTMLElement>(null);
  const ledgerRef = useRef<HTMLDivElement>(null);
  const focusJointAfterRenderRef = useRef(false);

  // ---------- تحميل ----------
  const loadBoard = useCallback(async () => {
    try {
      const snap = await store.load();
      setItems(snap.items);
      setThreads(snap.threads);
      setValidations(snap.validations);
      setLoaded(true);
    } catch {
      setFailed(true);
    }
  }, [store]);

  const loadCatalog = useCallback(async () => {
    const supabase = createClient();
    const [idx, prov] = await Promise.all([
      supabase.rpc('investigation_object_index', { p_session: sessionId }),
      supabase.rpc('evidence_provenance', { p_session: sessionId }),
    ]);
    setObjects(idx.error ? [] : ((idx.data ?? []) as InvestigationObject[]));
    setProvenance(prov.error ? [] : ((prov.data ?? []) as ProvenanceRow[]));
  }, [sessionId]);

  const loadLedger = useCallback(async () => {
    setLedger(await store.connectionState());
  }, [store]);

  /** الربط المشترك: العرض المقنَّع من السيرفر فقط (لا صفوف مساهمات خام). */
  const loadJoint = useCallback(async () => {
    setJoint(await store.jointProposals());
  }, [store]);

  const settle = useCallback(
    async (reason: SettleReason) => {
      const now = Date.now();
      if (!shouldSettle(reason, lastSettleRef.current, now)) return;
      lastSettleRef.current = now;
      await store.settle();
    },
    [store],
  );

  useEffect(() => {
    void (async () => {
      const data = await store.load().catch(() => null);
      if (!data) return setFailed(true);
      setItems(data.items);
      setThreads(data.threads);
      setValidations(data.validations);
      setLoaded(true);
      await Promise.all([loadCatalog(), loadLedger(), loadJoint()]);
    })();
  }, [store, loadCatalog, loadLedger, loadJoint]);

  // تسوية هادئة: عند الفتح، وعند تغيّر تخصصاتي أو معرفتي (بلا إغراق).
  const settledOnce = useRef(false);
  useEffect(() => {
    const reason: SettleReason = settledOnce.current ? 'knowledge_changed' : 'open';
    settledOnce.current = true;
    void settle(reason);
  }, [settle, specsKey, evidence.length]);

  // يُنفَّذ بعد أن يرسم React حالة الربط الجديدة — فلا يضيع التركيز على شريط أُزيل.
  useEffect(() => {
    if (!focusJointAfterRenderRef.current) return;
    focusJointAfterRenderRef.current = false;
    (jointRef.current ?? ledgerRef.current)?.focus();
  }, [joint]);

  useEffect(() => {
    knownIdsRef.current = new Set([...items.map((i) => i.id), ...threads.map((t) => t.id), ...validations.map((v) => v.id)]);
  }, [items, threads, validations]);

  // Realtime = إشارة فقط؛ الحالة الموثوقة تُعاد قراءتها من جداول 031 (RLS).
  // أحداث الحذف لا تُصفّى بالجلسة (قيد Postgres Changes) وتحمل المفتاح فقط →
  // نعيد التحميل فقط إن كان المحذوف على لوحتي.
  useEffect(() => {
    const filter = `session_id=eq.${sessionId}`;
    const onDelete = (payload: { old: unknown }) => {
      const id = (payload.old as { id?: unknown } | null)?.id;
      if (typeof id === 'string' && knownIdsRef.current.has(id)) void loadBoard();
    };
    return subscribeAuthenticated(
      createClient(),
      `board-v2:${sessionId}`,
      (channel) => {
        for (const table of BOARD_TABLES) {
          // قفل مثبت جديد كتبه السيرفر → اللوحة والسجل معاً لكل الفريق.
          const onChange = () => {
            void loadBoard();
            if (table === 'board_validations') void loadLedger();
          };
          channel
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, onChange)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, onChange)
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, onDelete);
        }
        // 033: صف المقترح إشارة فقط (لا بيانات عقد) → نعيد قراءة العرض المقنَّع.
        // جدول المساهمات غير منشور أصلاً ولا يُشترك فيه هنا.
        const onJoint = () => {
          void loadJoint();
          void loadLedger();
        };
        return channel
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_joint_proposals', filter }, onJoint)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'session_joint_proposals', filter }, onJoint)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'session_object_state', filter }, () => void loadCatalog());
      },
      () => {
        void loadBoard();
        void loadCatalog();
        void loadLedger();
        void loadJoint();
      },
    );
  }, [sessionId, loadBoard, loadCatalog, loadLedger, loadJoint]);

  // ---------- منظور هذا اللاعب ----------
  const catalog: ViewerCatalog = useMemo(
    () => ({ caseId: caseId ?? '', policy, evidence, objects, privateEvidence }),
    [caseId, policy, evidence, objects, privateEvidence],
  );
  const board = useMemo(() => visibleBoard(items, threads, catalog), [items, threads, catalog]);
  const byId = useMemo(() => new Map(board.items.map((e) => [e.item.id, e])), [board]);
  const pos = useCallback((item: BoardItem) => overrides[item.id] ?? { x: item.x, y: item.y }, [overrides]);
  const corridor = useMemo(
    () => (focusId && byId.has(focusId) ? focusCorridor(focusId, board.threads, validations.map((v) => v.itemIds)) : null),
    [focusId, byId, board.threads, validations],
  );
  const pinnedCodes = useMemo(
    () => new Set(board.items.filter((e) => e.view).map((e) => `${e.view!.kind === 'evidence' ? 'evidence' : 'object'}:${e.view!.code}`)),
    [board.items],
  );

  const selected = selection.filter((id) => byId.has(id));
  const selEntries = selected.map((id) => byId.get(id)!);
  const hyps = selEntries.filter((e) => e.item.kind === 'hypothesis');
  const proposal = proposalFromSelection(selected, items, catalog);
  const restrictedSelected = selEntries.some((e) => e.item.kind === 'material' && !canReason(e.view));
  const single = selEntries.length === 1 ? selEntries[0]! : null;
  /** خيوطي بين قطعتين مختارتين — يفصلها كاتبها فقط (السيرفر يفرض ذلك). */
  const myThreadsBetween =
    selected.length === 2
      ? board.threads.filter((t) => t.authorId === myId && selected.includes(t.from) && selected.includes(t.to))
      : [];
  // الربط المشترك: المساهمة بمادة أقرؤها أنا فقط (العنوان وحده لا يكفي).
  const jointActive = activeProposal(joint);
  const contributeRef: JointRef | null = single?.view && canContribute(single.view) ? { kind: single.view.kind, id: single.view.code } : null;
  const offerContribute = !!contributeRef && !alreadyMine(jointActive, contributeRef);
  const nameOf = (userId: string) => members.find((m) => m.userId === userId)?.displayName ?? null;
  /**
   * سياسة 'hidden' (المشهد 17): أدلة أقرؤها. ما يعرّفه السيرفر خاصاً بقناتي
   * ('private') لا يُعرض له تثبيت أبداً — مقروء لي، يُساهَم به دون كشف.
   * غير المعرَّف بعد ('server_decides') يقرر السيرفر تثبيته؛ الرفض يُحفظ هنا.
   */
  const privateReadable = evidence
    .filter((e) => {
      const st = pinEligibility('evidence', e.code, catalog).status;
      return st === 'server_decides' || st === 'private';
    })
    .map((e) => resolveMaterial({ kind: 'evidence', code: e.code }, catalog))
    .filter((v): v is MaterialView => canContribute(v));

  // ---------- أفعال ----------
  function remember() {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
  }
  /** يعيد التركيز لما فتح اللوحة الجانبية؛ وإلا للقطعة قيد الفحص (لا يضيع للصفحة). */
  function restoreFocus(fallbackItemId?: string | null) {
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    if (el && document.contains(el) && el !== document.body) return el.focus();
    const id = fallbackItemId ?? (selected.length === 1 ? selected[0] : null);
    if (id) document.querySelector<HTMLElement>(`[data-item-id="${id}"]`)?.focus();
  }
  function openPanel(p: Panel) {
    remember();
    setPanel(p);
  }
  function closePanel() {
    const examined = sheetFor;
    setPanel('none');
    setSheetFor(null);
    restoreFocus(examined);
  }
  function toggle(id: string) {
    setSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function note(text: string) {
    setResult({ status: 'note', text });
  }

  async function linkSelected(kind: ThreadKind) {
    setBusy(true);
    const exists = (a: string, b: string) => threads.some((t) => (t.from === a && t.to === b) || (t.from === b && t.to === a));
    if (kind === 'tentative') {
      for (let i = 1; i < selected.length; i += 1) {
        const a = selected[i - 1]!;
        const b = selected[i]!;
        if (!exists(a, b)) await store.link(a, b, 'tentative');
      }
    } else if (hyps.length === 1) {
      const h = hyps[0]!.item.id;
      // الإسناد/التوتر ادعاء استدلالي: لا يُبنى على مادة محجوبة عني (عنوان فقط).
      const blocked = selEntries.some((e) => e.item.kind === 'material' && !canReason(e.view));
      for (const e of selEntries) {
        const id = e.item.id;
        if (id === h || exists(h, id)) continue;
        if (e.item.kind === 'material' && !canReason(e.view)) continue;
        await store.link(h, id, kind);
      }
      if (blocked) note('مادة محجوبة عنك لا تُسند بها فرضية — يسندها زميلك الذي يقرؤها.');
    }
    setBusy(false);
    void loadBoard();
  }

  /** الطريق الوحيد إلى المدقق — زر صريح فقط. القفل المثبت يأتي من السيرفر. */
  async function testSelection() {
    if (!proposal) return;
    setBusy(true);
    const outcome = await store.testSelection(selected);
    setBusy(false);
    await showOutcome(outcome);
  }

  /** رد المدقق — فردي أو مشترك — بالكلمات نفسها. المعنى فقط عند الإثبات. */
  async function showOutcome(outcome: TestOutcome) {
    if (outcome.status === 'validated') {
      setResult({ status: 'validated', text: outcome.meaning });
      await settle('validated');
      void loadBoard();
      void loadLedger();
      void loadJoint();
    } else if (outcome.status === 'throttled') {
      setResult({ status: 'throttled', text: 'اختبارات كثيرة متتالية. خذوا وقتاً لمراجعة المادة قبل المحاولة.' });
    } else if (outcome.status === 'unavailable') {
      setResult({ status: 'unavailable', text: 'تعذّر الاختبار الآن.' });
    } else {
      setResult({ status: 'not_established', text: NEUTRAL });
    }
  }

  // ---------- الربط المشترك (033) ----------
  /** بعد فعل مشترك: التركيز يعود للشريط، أو لسجل الروابط إن غادر الشريط (بعد إعادة الرسم). */
  function focusJointArea() {
    focusJointAfterRenderRef.current = true;
  }

  async function contributeSelected() {
    if (!contributeRef || !offerContribute) return;
    await contributeMaterial(contributeRef);
  }

  /** مساهمة بمادة أقرؤها (من اللوحة أو من موادي الخاصة) — لا تكشف عنوانها لمن لا يعرف بوجودها. */
  async function contributeMaterial(ref: JointRef) {
    setBusy(true);
    const outcome = await store.contributeJoint(jointActive?.id ?? null, ref);
    setBusy(false);
    if (outcome === 'not_contributable') note('لا يمكن المساهمة بهذه المادة.');
    else if (outcome === 'failed') note('ما قدرنا نضيف المساهمة. جرّب مرة ثانية.');
    void loadJoint();
  }

  async function withdrawJoint(p: JointProposal, ref: JointRef) {
    setBusy(true);
    await store.withdrawJoint(p.id, ref);
    setBusy(false);
    focusJointArea();
    await loadJoint();
  }

  async function closeJoint(p: JointProposal) {
    setBusy(true);
    await store.closeJoint(p.id);
    setBusy(false);
    focusJointArea();
    await loadJoint();
  }

  /** الطريق الوحيد لاختبار ربط مشترك — زر صريح فقط. */
  async function testJoint(p: JointProposal) {
    setBusy(true);
    const outcome = await store.testJoint(p.id);
    setBusy(false);
    focusJointArea();
    await showOutcome(outcome);
    void loadJoint();
  }

  async function pin(kind: MaterialKind, code: string) {
    const elig = pinEligibility(kind, code, catalog);
    if (elig.status === 'private') return note(PRIVATE_NOTE);
    if (elig.status !== 'eligible' && elig.status !== 'server_decides') return note(elig.status === 'share_first' ? 'شارك الاكتشاف مع الفريق أولاً — اللوحة مشتركة.' : 'هذه المادة غير متاحة للوحة.');
    setBusy(true);
    const spot = nextSpot(items.length);
    const outcome = await store.pinMaterial(elig.ref, spot.x, spot.y);
    setBusy(false);
    if (outcome === 'not_pinnable' && elig.status === 'server_decides') {
      // خاصة بي (قناتي): لا تُعرض كخيار تثبيت ثانية — المساهمة تبقى.
      setRefusedPins((prev) => new Set(prev).add(code));
      note(PRIVATE_NOTE);
    } else if (outcome === 'not_pinnable') note('هذه المادة غير متاحة للوحة.');
    else if (outcome === 'failed') note('ما قدرنا نضعها على اللوحة. جرّب مرة ثانية.');
    void loadBoard();
  }

  async function shareObject(code: string) {
    setBusy(true);
    const { error } = await createClient().rpc('share_object_discovery', { p_session: sessionId, p_object_code: code });
    setBusy(false);
    if (error) note('ما قدرنا نشارك الاكتشاف الآن.');
    void loadCatalog();
  }

  async function compose() {
    setBusy(true);
    const spot = nextSpot(items.length, { x: 0.5, y: 0.35 });
    const ok = editingId ? await store.editReasoning(editingId, composeText) : await store.addReasoning(composeKind, composeText, spot.x, spot.y);
    setBusy(false);
    if (!ok) return note(editingId ? 'ما قدرنا نحفظ التعديل.' : 'النص فارغ أو أطول من المسموح.');
    setComposeText('');
    setEditingId(null);
    closePanel();
    void loadBoard();
  }

  function startCompose() {
    setEditingId(null);
    setComposeText('');
    openPanel('compose');
  }

  function startEdit(item: BoardItem) {
    if (item.kind === 'material' || item.authorId !== myId) return;
    setEditingId(item.id);
    setComposeKind(item.kind);
    setComposeText(item.text);
    openPanel('compose');
  }

  async function unlinkSelected() {
    if (myThreadsBetween.length === 0) return;
    setBusy(true);
    for (const t of myThreadsBetween) await store.unlink(t.id);
    setBusy(false);
    void loadBoard();
  }

  async function removeSelected() {
    if (!single) return;
    const it = single.item;
    if (it.kind !== 'material' && it.authorId !== myId) return note('أفكار الفريق يحذفها كاتبها فقط.');
    setBusy(true);
    await store.remove(it.id);
    setBusy(false);
    setSelection([]);
    void loadBoard();
  }

  function openEvidence(view: MaterialView) {
    if (view.kind !== 'evidence') return;
    if (view.access !== 'readable') return note('يقرأه زميلك صاحب التخصص.');
    setExamining(view.item);
  }

  function returnToSource(view: MaterialView) {
    if (view.kind !== 'evidence') return onReturnToSource(view.code);
    const steps = originTrace(view, catalog, provenance);
    const source = steps.length >= 2 ? steps[steps.length - 2] : undefined;
    if (!source) return note('مصدر هذا الدليل ليس عنصراً ظاهراً لك بالموقع.');
    onReturnToSource(source.code);
  }

  function cite(factId: string) {
    const [kind, code] = factId.split(':');
    const entry = board.items.find((e) => e.view && e.view.code === code && (kind === 'evidence' ? e.view.kind === 'evidence' : e.view.kind !== 'evidence'));
    if (entry) {
      setSelection([entry.item.id]);
      document.querySelector<HTMLElement>(`[data-item-id="${entry.item.id}"]`)?.focus();
      return;
    }
    if (kind === 'evidence') {
      const view = resolveMaterial({ kind: 'evidence', code: code ?? '' }, catalog);
      if (view) openEvidence(view);
    }
  }

  // ---------- سحب (لا يستدعي المدقق إطلاقاً) ----------
  function onPiecePointerDown(e: PointerEvent<HTMLDivElement>, item: BoardItem) {
    if (mobile || e.button !== 0) return;
    const p = pos(item);
    dragRef.current = { id: item.id, startX: e.clientX, startY: e.clientY, originX: p.x, originY: p.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onStagePointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    if (!d.moved) {
      d.moved = true;
      setLifted(d.id);
    }
    const x = Math.min(0.97, Math.max(0.03, d.originX + dx));
    const y = Math.min(0.95, Math.max(0.05, d.originY + dy));
    setOverrides((prev) => ({ ...prev, [d.id]: { x, y } }));
  }

  function onStagePointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    setLifted(null);
    if (!d.moved) return toggle(d.id);
    const p = overrides[d.id];
    if (p) {
      setItems((prev) => prev.map((it) => (it.id === d.id ? { ...it, x: p.x, y: p.y } : it)));
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[d.id];
        return next;
      });
      void store.move(d.id, p.x, p.y);
    }
  }

  function onPieceKey(e: KeyboardEvent<HTMLDivElement>, item: BoardItem) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(item.id);
      return;
    }
    if (mobile) return;
    const step = e.shiftKey ? 0.06 : 0.02;
    const delta: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    const p = pos(item);
    const x = Math.min(0.97, Math.max(0.03, p.x + d[0]));
    const y = Math.min(0.95, Math.max(0.05, p.y + d[1]));
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, x, y } : it)));
    void store.move(item.id, x, y);
  }

  /** لمس + لوحة مفاتيح خارجية: Enter/Space = نفس اللمسة (تركيز/ربط). */
  function onTouchKey(e: KeyboardEvent<HTMLDivElement>, item: BoardItem) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (linking) {
      setLinking(false);
      if (!selection.includes(item.id)) setSelection([...selection, item.id]);
    } else setSelection([item.id]);
  }

  // ---------- Escape بالترتيب: ورقة/دُرج → تركيز → اختيار → نتيجة ----------
  useEffect(() => {
    if (examining) return; // غرفة الفحص تتولى Escape بنفسها
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (linking) setLinking(false);
      else if (panel !== 'none') {
        const examined = sheetFor;
        setPanel('none');
        setSheetFor(null);
        const el = returnFocusRef.current;
        returnFocusRef.current = null;
        if (el && document.contains(el) && el !== document.body) el.focus();
        else if (examined) document.querySelector<HTMLElement>(`[data-item-id="${examined}"]`)?.focus();
      } else if (focusId) setFocusId(null);
      else if (selection.length) setSelection([]);
      else if (result) setResult(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [examining, panel, sheetFor, focusId, selection.length, result, linking]);

  // ---------- عرض ----------
  if (failed) return <SurfaceState variant="error" title="تعذّر فتح لوحة التحقيق.">أعد تحميل الصفحة.</SurfaceState>;
  if (!loaded) return <SurfaceState variant="loading">جارٍ فتح لوحة التحقيق…</SurfaceState>;

  const hypothesisEntry = sheetFor ? byId.get(sheetFor) : undefined;
  const attachedIds =
    hypothesisEntry
      ? board.threads
          .filter((t) => (t.from === sheetFor || t.to === sheetFor) && t.kind === 'support')
          .map((t) => byId.get(t.from === sheetFor ? t.to : t.from))
          // فقط ما أقرؤه يُرسل كإسناد للاختبار (المحجوب ليس سنداً)
          .filter((e): e is NonNullable<typeof e> => !!e && !!e.view && canReason(e.view))
          .map((e) => `${e.view!.kind === 'evidence' ? 'evidence' : 'object'}:${e.view!.code}`)
      : [];
  const isValidated = (t: BoardThread) => threadValidated(t, validations);
  const traceView = panel === 'trace' && single?.view ? single.view : null;

  const tray = (
    <aside className={s.drawer} aria-label="أضف مادة للوحة">
      <div className={s.drawerSection}>
        <strong className={s.drawerTitle}>مواد يعرفها الفريق</strong>
        <p className={s.drawerHint}>اللوحة مشتركة: ما تضعه هنا يراه الفريق. اكتشافك الخاص يُشارَك أولاً.</p>
        {evidence
          .filter((e) => !pinnedCodes.has(`evidence:${e.code}`))
          .map((e) => {
            const elig = pinEligibility('evidence', e.code, catalog);
            if (elig.status !== 'eligible') return null; // سياسة 'hidden': القسم أدناه (السيرفر يقرر)
            return (
              <div key={`e:${e.code}`} className={s.trayRow}>
                <span className={s.trayTitle}>{e.title}</span>
                <button type="button" className={toolClass} disabled={busy} onClick={() => void pin('evidence', e.code)}>
                  ضع على اللوحة
                </button>
              </div>
            );
          })}
        {objects
          .filter((o) => !pinnedCodes.has(`object:${o.code}`))
          .map((o) => {
            const kind: MaterialKind = o.category === 'location' ? 'location' : 'object';
            const elig = pinEligibility(kind, o.code, catalog);
            if (elig.status === 'unavailable') return null;
            return (
              <div key={`o:${o.code}`} className={s.trayRow}>
                <span className={s.trayTitle}>{o.title}</span>
                {elig.status === 'eligible' ? (
                  <button type="button" className={toolClass} disabled={busy} onClick={() => void pin(kind, o.code)}>
                    ضع على اللوحة
                  </button>
                ) : (
                  <span className={s.trayActions}>
                    <button type="button" className={toolClass} disabled={busy} onClick={() => void shareObject(o.code)}>
                      شارك مع الفريق
                    </button>
                    {!alreadyMine(jointActive, { kind, id: o.code }) && canContribute(resolveMaterial({ kind, code: o.code }, catalog)) && (
                      <button type="button" className={toolClass} disabled={busy} onClick={() => void contributeMaterial({ kind, id: o.code })}>
                        ساهم بهذا الدليل
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
      </div>
      {privateReadable.length > 0 && (
        <div className={s.drawerSection}>
          <strong className={s.drawerTitle}>موادك المقروءة</strong>
          <p className={s.drawerHint}>ما يعرفه الفريق كله يُثبَّت على اللوحة؛ ما يخصك وحدك ساهم به في ربط مشترك دون كشفه: يرى زملاؤك أنك ساهمت، لا ماذا.</p>
          {privateReadable.map((v) => (
            <div key={`p:${v.code}`} className={s.trayRow}>
              <span className={s.trayTitle}>{v.title}</span>
              <span className={s.trayActions}>
                {pinEligibility('evidence', v.code, catalog).status === 'private' || refusedPins.has(v.code) ? (
                  <span className={s.jointBy}>خاص بك — لا يُثبَّت</span>
                ) : (
                  !pinnedCodes.has(`evidence:${v.code}`) && (
                    <button type="button" className={toolClass} disabled={busy} onClick={() => void pin('evidence', v.code)}>
                      ضع على اللوحة
                    </button>
                  )
                )}
                {!alreadyMine(jointActive, { kind: 'evidence', id: v.code }) && (
                  <button type="button" className={toolClass} disabled={busy} onClick={() => void contributeMaterial({ kind: 'evidence', id: v.code })}>
                    ساهم بهذا الدليل
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );

  const composer = (
    <aside className={s.drawer} aria-label="فكرة جديدة للفريق">
      <div className={s.drawerSection}>
        <strong className={s.drawerTitle}>{editingId ? 'عدّل فكرتك' : 'فكرة للفريق'}</strong>
        <p className={s.drawerHint}>ما يكتبه الفريق ملاحظة تفكير — ليس حقيقة من القضية.</p>
        {!editingId && (
        <div className={s.segment} role="radiogroup" aria-label="نوع الفكرة">
          {(
            [
              ['question', 'سؤال'],
              ['hypothesis', 'فرضية'],
              ['fact', 'حقيقة سجّلناها'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={composeKind === k} className={toolClass} data-primary={composeKind === k} onClick={() => setComposeKind(k)}>
              {label}
            </button>
          ))}
        </div>
        )}
        <label className={s.srOnly} htmlFor="board-compose">
          نص الفكرة
        </label>
        <textarea id="board-compose" className={s.textarea} maxLength={400} value={composeText} onChange={(e) => setComposeText(e.target.value)} />
        <div className={s.segment}>
          <button type="button" className={toolClass} data-primary="true" disabled={busy || !composeText.trim()} onClick={() => void compose()}>
            {editingId ? 'احفظ التعديل' : 'ضعها على اللوحة'}
          </button>
          <button type="button" className={toolClass} onClick={closePanel}>
            إلغاء
          </button>
        </div>
      </div>
    </aside>
  );

  const traceStepsList = traceView ? originTrace(traceView, catalog, provenance) : [];
  const tracePanel = traceView && (
    <aside className={s.drawer} aria-label="من أين أتت هذه المادة؟">
      <div className={s.drawerSection}>
        <strong className={s.drawerTitle}>أثر المصدر</strong>
        {traceStepsList.length > 0 ? (
          <p className={s.trace}>
            {traceStepsList.map((st, i) => (
              <span key={`${st.kind}:${st.code}`}>
                {i > 0 && <span className={s.traceArrow}>←</span>} <span className={s.traceStep}>{st.title}</span>
              </span>
            ))}
          </p>
        ) : (
          <p className={s.drawerHint}>لا أثر مصدر ظاهر لك لهذه المادة.</p>
        )}
        <button type="button" className={toolClass} onClick={closePanel}>
          أغلق
        </button>
      </div>
    </aside>
  );

  const contextBar = selected.length > 0 && (
    <div className={s.context} role="toolbar" aria-label="أفعال على المواد المختارة">
      <span className={s.contextCount}>{selected.length} مختارة</span>
      {selected.length >= 2 && (
        <button type="button" className={toolClass} disabled={busy} onClick={() => void linkSelected('tentative')}>
          اربط مؤقتاً
        </button>
      )}
      {proposal && (
        <button type="button" className={toolClass} data-primary="true" disabled={busy} onClick={() => void testSelection()}>
          اختبر الرابط
        </button>
      )}
      {offerContribute && (
        <button type="button" className={toolClass} disabled={busy} onClick={() => void contributeSelected()}>
          ساهم بهذا الدليل
        </button>
      )}
      {myThreadsBetween.length > 0 && (
        <button type="button" className={toolClass} disabled={busy} onClick={() => void unlinkSelected()}>
          افصل الخيط
        </button>
      )}
      {restrictedSelected && selected.length >= 2 && (
        <span className={s.contextCount}>المادة المحجوبة يختبرها من يقرؤها</span>
      )}
      {hyps.length === 1 && selected.length >= 2 && (
        <>
          <button type="button" className={toolClass} disabled={busy} onClick={() => void linkSelected('support')}>
            أسند للفرضية
          </button>
          <button type="button" className={toolClass} disabled={busy} onClick={() => void linkSelected('tension')}>
            علّم كتوتر
          </button>
        </>
      )}
      {single?.view && single.view.kind === 'evidence' && (
        <button type="button" className={toolClass} onClick={() => openEvidence(single.view!)}>
          افتح الدليل
        </button>
      )}
      {single?.view && (
        <>
          <button type="button" className={toolClass} onClick={() => returnToSource(single.view!)}>
            ارجع لمصدره
          </button>
          <button type="button" className={toolClass} onClick={() => openPanel('trace')}>
            من أين أتت؟
          </button>
        </>
      )}
      {single && (single.item.kind === 'hypothesis' || single.item.kind === 'question') && (
        <button type="button" className={toolClass} onClick={() => setFocusId(focusId === single.item.id ? null : single.item.id)}>
          {focusId === single.item.id ? 'اخرج من التركيز' : 'ركّز على هذا الخط'}
        </button>
      )}
      {single?.item.kind === 'hypothesis' && (
        <button
          type="button"
          className={toolClass}
          data-primary="true"
          onClick={() => {
            remember();
            setSheetFor(single.item.id);
            setPanel('sheet');
          }}
        >
          اختبر الفرضية
        </button>
      )}
      {single && single.item.kind !== 'material' && single.item.authorId === myId && (
        <button type="button" className={toolClass} onClick={() => startEdit(single.item)}>
          عدّل
        </button>
      )}
      {single && (single.item.kind === 'material' || single.item.authorId === myId) && (
        <button type="button" className={toolClass} disabled={busy} onClick={() => void removeSelected()}>
          أزل عن اللوحة
        </button>
      )}
      <button type="button" className={toolClass} onClick={() => setSelection([])}>
        إلغاء الاختيار
      </button>
    </div>
  );

  const pieces = board.items.map(({ item, view }) => (
    <BoardPiece
      key={item.id}
      sessionId={sessionId}
      item={item}
      view={view}
      mine={item.authorId === myId}
      selected={selected.includes(item.id)}
      dimmed={!!corridor && !corridor.items.has(item.id)}
      lifted={lifted === item.id}
      layout="canvas"
      position={pos(item)}
      // لمس: الإيماءات كلها في TouchBoard (لمسة/ضغط مطوّل/تجوّل) — لا سحب هنا.
      onPointerDown={mobile ? undefined : (e) => onPiecePointerDown(e, item)}
      onKeyDown={(e) => (mobile ? onTouchKey(e, item) : onPieceKey(e, item))}
      onActivate={() => toggle(item.id)}
    />
  ));

  /** خيط يلمس المختار: يبقى حاداً؛ غيره يخفت (بلا ممر تركيز مفعّل). */
  const touchesSelection = (t: BoardThread) => selected.length > 0 && (selected.includes(t.from) || selected.includes(t.to));
  const threadSvg = (
    <svg className={s.threads} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {board.threads.map((t) => {
        const a = byId.get(t.from);
        const b = byId.get(t.to);
        if (!a || !b) return null;
        const pa = pos(a.item);
        const pb = pos(b.item);
        return (
          <line
            key={t.id}
            className={s.thread}
            data-kind={t.kind}
            data-validated={isValidated(t)}
            data-dim={(!!corridor && !corridor.threads.has(t.id)) || (mobile && selected.length > 0 && !touchesSelection(t))}
            data-hot={mobile && touchesSelection(t)}
            x1={pa.x * 100}
            y1={pa.y * 100}
            x2={pb.x * 100}
            y2={pb.y * 100}
          />
        );
      })}
    </svg>
  );
  const threadList = (
    <ul className={s.srOnly} aria-label="الخيوط على اللوحة">
      {board.threads.map((t) => {
        const a = byId.get(t.from);
        const b = byId.get(t.to);
        return a && b ? (
          <li key={t.id}>
            {isValidated(t) ? 'رابط مثبت' : THREAD_WORD[t.kind]}: {describe(a.item, a.view)} ↔ {describe(b.item, b.view)}
          </li>
        ) : null;
      })}
    </ul>
  );

  if (mobile) {
    const title = (e: { item: BoardItem; view: MaterialView | null }) => (e.item.kind === 'material' ? (e.view?.title ?? '') : e.item.text);
    const relationsOf = (id: string) =>
      board.threads
        .filter((t) => t.from === id || t.to === id)
        .map((t) => ({ t, other: byId.get(t.from === id ? t.to : t.from) }))
        .filter((r): r is { t: BoardThread; other: NonNullable<typeof r.other> } => !!r.other);
    const between = selected.length >= 2 ? board.threads.filter((t) => selected.includes(t.from) && selected.includes(t.to)) : [];
    const relWord = (t: BoardThread) => (isValidated(t) ? 'رابط مثبت' : THREAD_WORD[t.kind]);

    const nodePanel = selected.length > 0 && !linking && panel === 'none' && (
      <section className={s.nodePanel} data-board-ui="true" aria-label={single ? describe(single.item, single.view) : 'ربط مواد مختارة'}>
        <span className={s.nodeGrip} aria-hidden="true" />
        <button type="button" className={s.nodeClose} onClick={() => setSelection([])} aria-label="أغلق — عودة للوحة">
          <span aria-hidden="true">×</span>
        </button>
        {single ? (
          <>
            <header className={s.nodeHead}>
              <p className={s.nodeKicker}>{describe(single.item, single.view).split(':')[0]}</p>
              <h3 className={s.nodeTitle}>{title(single)}</h3>
              {single.view?.kind === 'evidence' && single.view.access === 'restricted' && <p className={s.nodeNote}>محجوب عنك — يقرؤه زميلك صاحب التخصص.</p>}
              {single.item.kind !== 'material' && <p className={s.nodeNote}>{single.item.authorId === myId ? 'كتبتَها أنت — تفكير الفريق، ليس حقيقة من القضية.' : `كتبها ${nameOf(single.item.authorId) ?? 'زميل'} — تفكير الفريق، ليس حقيقة من القضية.`}</p>}
            </header>
            <div className={s.nodePrimary}>
              <Act onClick={() => setLinking(true)} primary>اربط بمادة أخرى</Act>
              {single.item.kind === 'hypothesis' &&
                <Act onClick={() => {
                  remember();
                  setSheetFor(single.item.id);
                  setPanel('sheet');
                }}>اختبر الفرضية</Act>}
              {single.view?.kind === 'evidence' && <Act onClick={() => openEvidence(single.view!)}>افتح الدليل</Act>}
            </div>
            {(() => {
              const rels = relationsOf(single.item.id);
              return rels.length > 0 ? (
                <div className={s.nodeRels}>
                  <p className={s.nodeLabel}>مرتبط به</p>
                  <ul className={s.relList}>
                    {rels.map(({ t, other }) => (
                      <li key={t.id}>
                        <button type="button" className={s.relRow} data-validated={isValidated(t)} data-kind={t.kind} onClick={() => setSelection([single.item.id, other.item.id])}>
                          <span className={s.relKind}>{relWord(t)}</span>
                          <span className={s.relTitle}>{title(other)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className={s.nodeNote}>لا خيط يربطها بعد.</p>
              );
            })()}
            <div className={s.nodeMore}>
              {offerContribute && <Act onClick={() => void contributeSelected()} disabled={busy}>ساهم بهذا الدليل</Act>}
              {single.view && <Act onClick={() => returnToSource(single.view!)}>ارجع لمصدره</Act>}
              {single.view && <Act onClick={() => openPanel('trace')}>من أين أتت؟</Act>}
              {(single.item.kind === 'hypothesis' || single.item.kind === 'question') &&
                <Act onClick={() => setFocusId(focusId === single.item.id ? null : single.item.id)}>{focusId === single.item.id ? 'اخرج من التركيز' : 'ركّز على هذا الخط'}</Act>}
              {single.item.kind !== 'material' && single.item.authorId === myId && <Act onClick={() => startEdit(single.item)}>عدّل</Act>}
              {(single.item.kind === 'material' || single.item.authorId === myId) && <Act onClick={() => void removeSelected()} disabled={busy}>أزل عن اللوحة</Act>}
            </div>
          </>
        ) : (
          <>
            <header className={s.nodeHead}>
              <p className={s.nodeKicker}>ربط {selected.length.toLocaleString('ar')} مواد</p>
              <h3 className={s.pairTitle}>
                {selEntries.map((e, i) => (
                  <span key={e.item.id}>
                    {i > 0 && <span className={s.pairJoin} aria-hidden="true"> ↔ </span>}
                    {title(e)}
                  </span>
                ))}
              </h3>
              <p className={s.nodeNote}>{between.length > 0 ? `بينها الآن: ${[...new Set(between.map(relWord))].join('، ')}` : 'لا خيط بينها بعد. الربط هنا تفكير — الاختبار وحده يسأل القضية.'}</p>
              {restrictedSelected && <p className={s.nodeNote}>المادة المحجوبة يختبرها من يقرؤها.</p>}
            </header>
            <div className={s.nodePrimary}>
              {proposal && (
                <button type="button" className={toolClass} data-primary="true" disabled={busy} onClick={() => void testSelection()}>
                  اختبر الرابط
                </button>
              )}
              {between.length === 0 && <Act onClick={() => void linkSelected('tentative')} primary={!proposal} disabled={busy}>اربط مؤقتاً</Act>}
              {hyps.length === 1 && <Act onClick={() => void linkSelected('support')} disabled={busy}>أسند للفرضية</Act>}
              {hyps.length === 1 && <Act onClick={() => void linkSelected('tension')} disabled={busy}>علّم كتوتر</Act>}
            </div>
            <div className={s.nodeMore}>
              <Act onClick={() => setLinking(true)}>أضف مادة أخرى للربط</Act>
              {myThreadsBetween.length > 0 && <Act onClick={() => void unlinkSelected()} disabled={busy}>افصل الخيط</Act>}
              <Act onClick={() => setSelection([])}>ابدأ من جديد</Act>
            </div>
          </>
        )}
      </section>
    );

    const sourceTitle = selEntries.length > 0 ? title(selEntries[selEntries.length - 1]!) : '';
    const linkBanner = linking && (
      <div className={s.linkBanner} data-board-ui="true" role="status">
        <span className={s.linkDot} aria-hidden="true" />
        <span className={s.linkText}>
          اختر ما تربطه بـ <strong>«{sourceTitle}»</strong>
        </span>
        <button type="button" className={toolClass} onClick={() => setLinking(false)}>
          إلغاء
        </button>
      </div>
    );

    /** أين تقع ورقة التركيز (مرآة board.module.css): أسفل على الهاتف، يسار على الأعرض. */
    const panelCover = (bottomShare: number): Cover =>
      window.innerWidth > 760 ? { left: Math.min(window.innerHeight <= 600 ? 0.48 * window.innerWidth : 416, 0.5 * window.innerWidth) + 16 } : { bottom: window.innerHeight * bottomShare };
    const tapNode = (id: string) => {
      if (linking) {
        setLinking(false);
        if (!selected.includes(id)) setSelection([...selected, id]);
        const from = selEntries[selEntries.length - 1];
        const to = byId.get(id);
        if (from && to) touchRef.current?.revealPair(pos(from.item), pos(to.item), panelCover(0.36));
        return;
      }
      setSelection([id]);
      const e = byId.get(id);
      if (e) touchRef.current?.reveal(pos(e.item), panelCover(0.44));
    };

    return (
      <main ref={measureTouch} className={`${s.board} ${s.touch}`} aria-label="لوحة التحقيق" style={touchTop !== null ? { height: `calc(100dvh - ${touchTop}px)` } : undefined}>
        <div className={s.touchTop}>
          {/* التبويب النشط يقول "لوحة التحقيق" أصلاً — هنا سطر واحد فقط */}
          <strong className={s.touchTitle}>{focusId && byId.get(focusId) ? 'ممر التركيز' : 'سطح التفكير المشترك'}</strong>
          <button type="button" className={s.ledgerChip} onClick={() => openPanel('ledger')} data-has={ledger.connections.length > 0 ? 'true' : 'false'}>
            <span className={s.ledgerDot} aria-hidden="true" />
            روابط مثبتة <span className={s.ledgerNum}>{ledger.connections.length.toLocaleString('ar')}</span>
          </button>
        </div>

        <JointStrip
          ref={jointRef}
          proposals={joint}
          catalog={catalog}
          myId={myId}
          nameOf={nameOf}
          busy={busy}
          onWithdraw={(p, ref) => void withdrawJoint(p, ref)}
          onClose={(p) => void closeJoint(p)}
          onTest={(p) => void testJoint(p)}
        />

        <div className={s.touchStage}>
          <TouchBoard
            handleRef={touchRef}
            items={board.items.map(({ item }) => ({ id: item.id, ...pos(item) }))}
            lanes={boardLanes}
            threads={threadSvg}
            pieces={pieces}
            linking={linking}
            onTapNode={tapNode}
            onTapEmpty={() => {
              if (!linking) setSelection([]);
            }}
            onMove={(id, x, y, commit) => {
              if (!commit) return setOverrides((prev) => ({ ...prev, [id]: { x, y } }));
              setItems((prev) => prev.map((it) => (it.id === id ? { ...it, x, y } : it)));
              setOverrides((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
              });
              void store.move(id, x, y);
            }}
            controls={
              selected.length === 0 &&
              !linking && (
                <button type="button" className={s.addFab} data-board-ui="true" onClick={() => openPanel('add')} aria-label="أضف إلى اللوحة: مادة أو فكرة">
                  <span aria-hidden="true">+</span>
                </button>
              )
            }
            overlay={
              board.items.length === 0 && (
                <div className={s.touchEmpty} data-board-ui="true">
                  <strong>اللوحة فارغة.</strong>
                  <p>ضعوا عليها مادة يعرفها الفريق أو اكتبوا سؤالاً — من زر «+».</p>
                  <p className={s.touchEmptyHint}>المس لتختار · اضغط مطوّلاً لتنقل · اسحب لتتجوّل · قرّب بإصبعين</p>
                </div>
              )
            }
          />
          {threadList}
          {linkBanner}
          {nodePanel}
        </div>

        <Sheet open={panel === 'add'} title="أضف إلى اللوحة" kicker="سطح التفكير المشترك" onClose={closePanel}>
          <div className={s.addChoices}>
            <button type="button" className={s.addChoice} onClick={() => setPanel('tray')}>
              <strong>مادة من التحقيق</strong>
              <span>ما يعرفه الفريق يُثبَّت للجميع — اكتشافك الخاص يُشارَك أولاً.</span>
            </button>
            <button
              type="button"
              className={s.addChoice}
              onClick={() => {
                setEditingId(null);
                setComposeText('');
                setPanel('compose');
              }}
            >
              <strong>فكرة للفريق</strong>
              <span>سؤال، فرضية، أو حقيقة سجّلتموها — تفكير، ليس حقيقة من القضية.</span>
            </button>
          </div>
        </Sheet>

        <Sheet open={panel === 'ledger'} title="روابط أثبتها الفريق" kicker="ما أكّدته القضية" onClose={closePanel}>
          <div ref={ledgerRef} tabIndex={-1} className={s.ledgerSheet}>
            {ledger.connections.length === 0 ? (
              <p className={s.drawerHint}>لا رابط مثبت بعد. اختاروا مادتين واختبروا الرابط.</p>
            ) : (
              <ul className={s.relList}>
                {ledger.connections.map((c, i) => (
                  <li key={i} className={s.ledgerRow}>
                    {c.meaning}
                  </li>
                ))}
              </ul>
            )}
            <p className={s.nodeLabel}>لغة الخيوط</p>
            <ul className={s.legendList}>
              <li data-kind="tentative">متقطع — رابط مؤقت</li>
              <li data-kind="support">رفيع — إسناد لفرضية</li>
              <li data-kind="tension">نقطي — توتر</li>
              <li data-kind="validated">نحاسي صلب — رابط مثبت</li>
            </ul>
          </div>
        </Sheet>

        {panel === 'tray' && tray}
        {panel === 'compose' && composer}
        {panel === 'trace' && tracePanel}
        {panel === 'sheet' && hypothesisEntry && hypothesisEntry.item.kind === 'hypothesis' && (
          <HypothesisSheet
            sessionId={sessionId}
            hypothesis={hypothesisEntry.item.text}
            attached={attachedIds}
            attachedCount={attachedIds.length}
            onClose={closePanel}
            onCite={cite}
          />
        )}

        {result && (
          <div className={s.result} data-status={result.status} role="status" aria-live="polite">
            {result.status === 'validated' && <span className={s.resultLabel}>رابط مثبت</span>}
            {result.text}
            <button type="button" className={s.resultClose} onClick={() => setResult(null)} aria-label="إغلاق">
              ×
            </button>
          </div>
        )}

        {examining && <EvidenceExaminationRoom key={examining.code} sessionId={sessionId} item={examining} onClose={() => setExamining(null)} />}
      </main>
    );
  }

  return (
    <main className={s.board} aria-label="لوحة التحقيق">
      <SurfaceHeader
        mode="لوحة التحقيق"
        title={focusId && byId.get(focusId) ? 'ممر التركيز' : 'سطح التفكير المشترك'}
        lede={
          focusId
            ? 'يظهر فقط ما ربطه الفريق بهذا الخط صراحةً.'
            : 'رتّبوا المادة كما تفكرون. الربط هنا تفكير — الاختبار وحده يسأل القضية.'
        }
        actions={
          <>
            <button type="button" className={toolClass} onClick={() => (panel === 'tray' ? closePanel() : openPanel('tray'))}>
              أضف مادة
            </button>
            <button type="button" className={toolClass} onClick={() => (panel === 'compose' ? closePanel() : startCompose())}>
              فكرة جديدة
            </button>
          </>
        }
      />

      <div ref={ledgerRef} className={s.ledger} aria-label="روابط أثبتها الفريق" tabIndex={-1}>
        <span className={s.ledgerLabel}>روابط مثبتة</span>
        {ledger.connections.length === 0 ? (
          <span className={s.ledgerItem} style={{ borderColor: 'var(--line-strong)', color: 'var(--ivory-dim)' }}>
            لا شيء بعد
          </span>
        ) : (
          ledger.connections.map((c, i) => (
            <span key={i} className={s.ledgerItem}>
              {c.meaning}
            </span>
          ))
        )}
        <span className={`${s.ledgerLabel} ${s.legend}`} aria-hidden="true">
          · متقطع = مؤقت · رفيع = إسناد · نقطي = توتر · نحاسي = مثبت
        </span>
      </div>

      <JointStrip
        ref={jointRef}
        proposals={joint}
        catalog={catalog}
        myId={myId}
        nameOf={nameOf}
        busy={busy}
        onWithdraw={(p, ref) => void withdrawJoint(p, ref)}
        onClose={(p) => void closeJoint(p)}
        onTest={(p) => void testJoint(p)}
      />

      <div className={s.workspace}>
        {(
          <div ref={stageRef} className={s.stage} onPointerMove={onStagePointerMove} onPointerUp={onStagePointerUp} onPointerCancel={onStagePointerUp}>
            {boardLanes.length > 0 && (
              <div className={s.lanes} aria-hidden="true">
                {boardLanes.map((l) => (
                  <div key={l.id} className={s.lane}>
                    <span className={s.laneLabel}>{l.label}</span>
                  </div>
                ))}
              </div>
            )}
            {threadSvg}
            {threadList}
            {pieces}
            {board.items.length === 0 && (
              <SurfaceState variant="empty" title="اللوحة فارغة.">
                ضعوا عليها مادة يعرفها الفريق من «أضف مادة»، أو اكتبوا سؤالاً من «فكرة جديدة».
              </SurfaceState>
            )}
            {contextBar}
          </div>
        )}

        {panel === 'tray' && tray}
        {panel === 'compose' && composer}
        {panel === 'trace' && tracePanel}
        {panel === 'sheet' && hypothesisEntry && hypothesisEntry.item.kind === 'hypothesis' && (
          <HypothesisSheet
            sessionId={sessionId}
            hypothesis={hypothesisEntry.item.text}
            attached={attachedIds}
            attachedCount={attachedIds.length}
            onClose={closePanel}
            onCite={cite}
          />
        )}
      </div>

      {result && (
        <div className={s.result} data-status={result.status} role="status" aria-live="polite">
          {result.status === 'validated' && <span className={s.resultLabel}>رابط مثبت</span>}
          {result.text}
        </div>
      )}

      {examining && <EvidenceExaminationRoom key={examining.code} sessionId={sessionId} item={examining} onClose={() => setExamining(null)} />}
    </main>
  );
}

/** زر فعل في ورقة اللمس — نفس أداة السطح (toolClass) وهدف 44px. */
function Act({ children, onClick, primary, disabled }: { children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={toolClass} data-primary={primary ? 'true' : undefined} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
