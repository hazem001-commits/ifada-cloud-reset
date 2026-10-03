// ============================================================
// tests/board/board.test.ts
// لوحة التحقيق V2: عزل القضايا، خصوصية اللوحة المشتركة، أهلية التثبيت،
// السحب لا يستدعي المدقق، الاختبار الصريح وحده يفعل، ردود محايدة، تسوية
// هادئة، تحكم بلا سحب دقيق على الهاتف، وحركة مخفّضة. التخزين: Board V2
// الحية (sql/031) عبر RPCs فقط — لا جداول اللوحة القديمة، لا كتابة مزدوجة.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  decodeItem,
  decodeThread,
  decodeValidation,
  focusCorridor,
  laneOf,
  nextSpot,
  originTrace,
  pinEligibility,
  proposalFromSelection,
  resolveMaterial,
  threadValidated,
  visibleBoard,
  type BoardItem,
  type BoardItemRow,
  type BoardThread,
  type BoardThreadRow,
  type ViewerCatalog,
} from '../../src/app/case/[code]/board/boardModel';
import { BOARD_TABLES, createBoardStore, shouldSettle, SETTLE_MIN_GAP_MS, type BoardClient } from '../../src/app/case/[code]/board/boardStore';
import { getCasePresentation } from '../../src/cases/registry';
import type { EvidenceItem } from '../../src/types/case';
import type { InvestigationObject } from '../../src/types/investigationObjects';

// ------------------------------------------------------------
// عالم صغير: منظور لاعبين (A حامل التخصص، B ليس)
// ------------------------------------------------------------
const ev = (code: string, readable: boolean, over: Partial<EvidenceItem> = {}): EvidenceItem => ({
  code,
  title: `عنوان ${code}`,
  kind: 'document',
  owner_spec: 'forensics',
  clock_label: null,
  body: readable ? `نص ${code}` : null,
  has_media: false,
  readable,
  unlocked_at: '2026-10-01T00:00:00Z',
  ...over,
} as EvidenceItem);

const obj = (code: string, over: Partial<InvestigationObject> = {}): InvestigationObject => ({
  code,
  category: 'object',
  parent_code: 'ROOM_714',
  title: `عنصر ${code}`,
  description: '',
  state: 'DISCOVERED',
  discovered: true,
  is_shared: true,
  processing: false,
  actions: [],
  ...over,
});

const ROOM = obj('ROOM_714', { category: 'location', parent_code: null, state: 'KNOWN' });

function catalog(over: Partial<ViewerCatalog> = {}): ViewerCatalog {
  return {
    caseId: 'room-714',
    policy: 'title',
    evidence: [ev('F-01', true), ev('D-03', false)],
    objects: [ROOM, obj('GLASS_CUP'), obj('VICTIM_ITEMS', { is_shared: false }), obj('PASSPORT', { parent_code: 'VICTIM_ITEMS' })],
    ...over,
  };
}

/** صف board_items كما يرجعه 031: 'ev:F-01' / 'obj:X' / 'loc:X' مادة، وإلا فكرة من نوع kind. */
const row = (id: string, ref: string, text = '', x = 0.5, y = 0.5): BoardItemRow => {
  const m = /^(ev|obj|loc):(.+)$/.exec(ref);
  const materialKind = m ? ({ ev: 'evidence', obj: 'object', loc: 'location' } as const)[m[1] as 'ev' | 'obj' | 'loc'] : null;
  return {
    id,
    session_id: 's',
    kind: m ? 'material' : ref,
    material_kind: materialKind,
    material_code: m ? m[2]! : null,
    text,
    x,
    y,
    author_id: 'a',
    created_at: '2026-10-01T00:00:00Z',
  };
};
const item = (...a: Parameters<typeof row>): BoardItem => decodeItem(row(...a))!;
const threadRow = (id: string, from: string, to: string, kind = 'tentative'): BoardThreadRow => ({
  id,
  session_id: 's',
  kind,
  from_item: from,
  to_item: to,
  author_id: 'a',
});
const thread = (...a: Parameters<typeof threadRow>): BoardThread => decodeThread(threadRow(...a))!;

/** كل ملفات المصدر (للفحوص البنيوية). */
function sourceFiles(dir = 'src'): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx|mjs|js)$/.test(n) ? [p] : [];
  });
}

// ============================================================
// الترميز: مرجع فقط، لا عناوين
// ============================================================
test('materials are stored as references only — never titles (031 RPC carries kind + code only)', async () => {
  const { client, calls } = fakeClient();
  await createBoardStore(client, 's').pinMaterial({ kind: 'evidence', code: 'F-01' }, 0.4, 0.4);
  assert.deepEqual(calls, [{ op: 'rpc', fn: 'pin_board_material', args: { p_session: 's', p_kind: 'evidence', p_code: 'F-01', p_x: 0.4, p_y: 0.4 } }]);
  const sql = readFileSync('sql/031_board_v2.sql', 'utf8');
  assert.match(sql, /check \(kind <> 'material' or text = ''\)/, 'DB forces material rows to carry no label');
  const bridge = readFileSync('src/app/case/[code]/investigation/boardBridge.ts', 'utf8');
  assert.ok(!/title/.test(bridge.replace(/\/\/[^\n]*/g, '')), 'the scene/case-file pin sends no title');
});

test('decode (031 rows): typed items only; anything unexpected is dropped, never guessed', () => {
  assert.equal(item('1', 'ev:F-01').kind, 'material');
  const h = item('3', 'hypothesis', 'كريم كذب');
  assert.ok(h.kind === 'hypothesis' && h.text === 'كريم كذب');
  assert.equal(decodeItem(row('4', 'note', 'ملاحظة')), null, 'legacy plain notes have no V2 kind');
  assert.equal(decodeItem(row('5', 'ev:f-01')), null, 'codes are uppercase refs only');
  assert.equal(decodeItem({ ...row('6', 'ev:F-01'), material_kind: 'title' }), null);
  assert.equal(decodeItem(row('7', 'question', '')), null, 'empty reasoning is not an item');
  assert.equal(thread('l', '1', '2').kind, 'tentative');
  assert.equal(thread('l', '1', '2', 'tension').kind, 'tension');
  assert.equal(decodeThread(threadRow('l', '1', '2', 'validated')), null, 'a "validated" thread kind is never rendered — validation is server state');
  assert.equal(decodeThread(threadRow('l', '1', '1')), null);
  assert.equal(decodeValidation({ id: 'v', session_id: 's', item_ids: ['a'], meaning: 'm' }), null);
  assert.deepEqual(decodeValidation({ id: 'v', session_id: 's', item_ids: ['a', 'b'], meaning: 'm' }), { id: 'v', itemIds: ['a', 'b'], meaning: 'm' });
});

// ============================================================
// (1) عزل القضايا · (15) إعداد اللوحة لكل قضية
// ============================================================
test('1/15. cross-case isolation: a code resolves only against this viewer’s own case data; lanes are per case', () => {
  const sceneViewer = catalog({ caseId: 'scene-17', policy: 'hidden', evidence: [], objects: [] });
  assert.equal(resolveMaterial({ kind: 'evidence', code: 'F-01' }, sceneViewer), null);
  assert.equal(resolveMaterial({ kind: 'object', code: 'GLASS_CUP' }, sceneViewer), null);
  assert.ok(resolveMaterial({ kind: 'evidence', code: 'F-01' }, catalog()));
  assert.deepEqual(getCasePresentation('room-714').boardLanes, []);
  assert.deepEqual(getCasePresentation('scene-17').boardLanes.map((l) => l.id), ['written', 'instructed', 'happened']);
  assert.deepEqual(getCasePresentation('ghost').boardLanes, []);
  // الممر = موضع مكاني فقط (RTL: الأول من اليمين)
  const lanes = getCasePresentation('scene-17').boardLanes;
  assert.equal(laneOf(0.9, lanes)?.id, 'written');
  assert.equal(laneOf(0.5, lanes)?.id, 'instructed');
  assert.equal(laneOf(0.1, lanes)?.id, 'happened');
  assert.equal(laneOf(0.5, []), null);
});

// ============================================================
// (2) المخفي لا يدخل · (3) خاص الزميل لا يُشار إليه · (4) المشاركة تغيّر الأهلية
// ============================================================
test('2. hidden material cannot be pinned (not unlocked / teammate-private / uninspected)', () => {
  const cat = catalog({
    objects: [ROOM, obj('TEAMMATE_PRIVATE', { state: 'HIDDEN', is_shared: false }), obj('LAPTOP', { discovered: false, state: 'UNKNOWN', is_shared: false })],
  });
  assert.deepEqual(pinEligibility('evidence', 'R-99', cat), { status: 'unavailable' });
  assert.deepEqual(pinEligibility('object', 'TEAMMATE_PRIVATE', cat), { status: 'unavailable' });
  assert.deepEqual(pinEligibility('object', 'LAPTOP', cat), { status: 'unavailable' });
  assert.deepEqual(pinEligibility('object', 'NOPE', cat), { status: 'unavailable' });
  // سياسة 'hidden' (توزيع بالقنوات): ما أقرؤه يُعرض للتثبيت والسيرفر وحده يقرر
  // (035: المسار المشترك يُقبل، قناتي الخاصة تُرفض بلا أثر). غير المقروء: لا شيء.
  assert.deepEqual(pinEligibility('evidence', 'F-01', catalog({ policy: 'hidden' })), { status: 'server_decides', ref: { kind: 'evidence', code: 'F-01' } });
  assert.deepEqual(pinEligibility('evidence', 'D-03', catalog({ policy: 'hidden' })), { status: 'unavailable' }, 'unreadable under hidden = absent');
});

test('3. teammate-private material on the board is invisible to me (item and its threads), and cannot be tested', () => {
  const items = [item('a', 'obj:GLASS_CUP'), item('b', 'obj:SECRET'), item('c', 'ev:F-01')];
  const threads = [thread('t1', 'a', 'b'), thread('t2', 'a', 'c')];
  const me = catalog({ objects: [ROOM, obj('GLASS_CUP'), obj('SECRET', { state: 'HIDDEN', is_shared: false })] });
  const v = visibleBoard(items, threads, me);
  assert.deepEqual(v.items.map((e) => e.item.id), ['a', 'c']);
  assert.deepEqual(v.threads.map((t) => t.id), ['t2']);
  assert.ok(!JSON.stringify(v).includes('عنصر SECRET'));
  assert.equal(proposalFromSelection(['a', 'b'], items, me), null, 'no node I cannot see');
});

test('4. sharing changes eligibility; the whole ancestor chain must be team-visible', () => {
  const mine = catalog();
  assert.deepEqual(pinEligibility('object', 'VICTIM_ITEMS', mine), { status: 'share_first', code: 'VICTIM_ITEMS' });
  // الابن مشترك لكن أباه خاص بي → غير متاح (التثبيت سيكشف وجود الأب)
  assert.deepEqual(pinEligibility('object', 'PASSPORT', mine), { status: 'unavailable' });
  const shared = catalog({ objects: [ROOM, obj('VICTIM_ITEMS', { is_shared: true }), obj('PASSPORT', { parent_code: 'VICTIM_ITEMS' })] });
  assert.equal(pinEligibility('object', 'VICTIM_ITEMS', shared).status, 'eligible');
  assert.equal(pinEligibility('object', 'PASSPORT', shared).status, 'eligible');
  // دليل مفتوح (حتى المحجوب بعنوانه) يراه الفريق أصلاً في غرفة 714
  assert.equal(pinEligibility('evidence', 'D-03', mine).status, 'eligible');
  assert.equal(pinEligibility('location', 'GLASS_CUP', mine).status, 'unavailable', 'kind must match');
});

test('moving/removing board pieces never changes authorization (view is recomputed from my data)', () => {
  const items: BoardItem[] = [item('a', 'obj:SECRET', '', 0.1, 0.1)];
  const me = catalog({ objects: [ROOM, obj('SECRET', { state: 'HIDDEN', is_shared: false })] });
  const moved = items.map((i) => ({ ...i, x: 0.9, y: 0.9 }));
  assert.equal(visibleBoard(moved, [], me).items.length, 0);
  assert.equal(visibleBoard([], [], me).items.length, 0);
});

// ============================================================
// (5) السحب لا يستدعي المدقق · (6) الاختبار الصريح يفعل · (7)(8) ردود
// ============================================================
function fakeClient(
  rpcReply: (fn: string) => { data: unknown; error: { message?: string } | null } = () => ({ data: null, error: null }),
  rows: Partial<Record<string, unknown[]>> = {},
) {
  const calls: { op: string; table?: string; fn?: string; args?: unknown }[] = [];
  // قراءة فقط: لا insert/update/delete في واجهة العميل أصلاً (الكتابة RPCs فقط).
  const client: BoardClient = {
    from(table) {
      return { select: () => ({ eq: () => (calls.push({ op: 'select', table }), Promise.resolve({ data: rows[table] ?? [], error: null })) }) };
    },
    rpc(fn, args) {
      calls.push({ op: 'rpc', fn, args });
      return Promise.resolve(rpcReply(fn));
    },
  };
  return { client, calls };
}

const VALIDATORS = ['test_board_selection', 'propose_connection'];

test('5. arranging the board (pin / write / edit / move / link / unlink / remove) never calls the validator', async () => {
  const { client, calls } = fakeClient();
  const store = createBoardStore(client, 's');
  await store.load();
  await store.pinMaterial({ kind: 'evidence', code: 'F-01' }, 0.4, 0.4);
  await store.addReasoning('hypothesis', 'كريم نقل رامي', 0.5, 0.5);
  await store.editReasoning('h', 'نص أوضح');
  await store.move('x', 0.6, 0.6);
  await store.link('x', 'y', 'tentative');
  await store.link('x', 'y', 'support');
  await store.unlink('l');
  await store.remove('x');
  assert.equal(calls.filter((c) => c.op === 'rpc' && VALIDATORS.includes(c.fn!)).length, 0);
  assert.deepEqual(
    calls.filter((c) => c.op === 'rpc').map((c) => c.fn),
    ['pin_board_material', 'add_board_reasoning', 'edit_board_reasoning', 'move_board_item', 'link_board_items', 'link_board_items', 'unlink_board_thread', 'remove_board_item'],
  );
  // الواجهة: السحب/لوحة المفاتيح تنقل فقط
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  const drag = ui.slice(ui.indexOf('function onStagePointerUp'), ui.indexOf('// ---------- Escape'));
  assert.match(drag, /store\.move\(/);
  assert.ok(!/testSelection|store\.test/.test(drag), 'drag / keyboard move never validates');
});

test('6/10. the explicit test action calls test_board_selection exactly once with the selected board items', async () => {
  const { client, calls } = fakeClient(() => ({ data: { status: 'not_established' }, error: null }));
  const store = createBoardStore(client, 's');
  await store.testSelection(['i1', 'i2', 'i1']);
  const rpcs = calls.filter((c) => c.op === 'rpc');
  assert.equal(rpcs.length, 1);
  assert.deepEqual(rpcs[0], { op: 'rpc', fn: 'test_board_selection', args: { p_session: 's', p_items: ['i1', 'i2'] } });
  // والواجهة: الطريق الوحيد إلى testSelection زر "اختبر الرابط"
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  assert.equal((ui.match(/store\.testSelection\(/g) ?? []).length, 1);
  assert.match(ui, /onClick=\{\(\) => void testSelection\(\)\}>\s*اختبر الرابط/);
  assert.ok(!/propose_connection|test_board_selection/.test(ui), 'the UI never calls the RPC directly');
  // 027 مباشرة لم يعد طريق اللوحة: test_board_selection يمرّ به كالمستدعي على السيرفر
  assert.ok(!/propose_connection/.test(readFileSync('src/app/case/[code]/board/boardStore.ts', 'utf8').replace(/\/\/[^\n]*/g, '')));
});

test('7/8. neutral miss for anything not validated; success exposes only the meaning', async () => {
  const reply = (data: unknown) => createBoardStore(fakeClient(() => ({ data, error: null })).client, 's');
  const ids = ['a', 'b'];
  for (const data of [{ status: 'not_established' }, { status: 'not_established', reason: 'node 2 hidden' }, {}, null, { status: 'validated' }]) {
    assert.deepEqual(await reply(data).testSelection(ids), { status: 'not_established' }, JSON.stringify(data));
  }
  const ok = await reply({ status: 'validated', meaning: 'معنى', rule: 'R714_SECRET', evidence: ['X-99'] }).testSelection(ids);
  assert.deepEqual(ok, { status: 'validated', meaning: 'معنى' });
  assert.deepEqual(await reply({ status: 'throttled' }).testSelection(ids), { status: 'throttled' });
  const failing = createBoardStore(fakeClient(() => ({ data: null, error: { message: 'INVALID_REQUEST' } })).client, 's');
  assert.deepEqual(await failing.testSelection(ids), { status: 'unavailable' });
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  assert.match(ui, /const NEUTRAL = 'لم يثبت هذا الرابط بعد\.';/);
});

test('selection → proposal: materials only, 2–5, all visible to me', () => {
  const items = [item('a', 'ev:F-01'), item('b', 'obj:GLASS_CUP'), item('h', 'hypothesis', 'x')];
  const cat = catalog();
  assert.deepEqual(proposalFromSelection(['a', 'b'], items, cat), [{ kind: 'evidence', id: 'F-01' }, { kind: 'object', id: 'GLASS_CUP' }]);
  assert.equal(proposalFromSelection(['a'], items, cat), null);
  assert.equal(proposalFromSelection(['a', 'h'], items, cat), null, 'team reasoning is never a node');
  assert.equal(proposalFromSelection(['a', 'a'], items, cat), null);
});

// ============================================================
// (16)(17) تسوية هادئة ومتكررة بأمان
// ============================================================
test('16/17. settlement: quiet (no reward detail), throttled, always after a validation', async () => {
  const { client, calls } = fakeClient(() => ({ data: { pending: ['E15'], spec: 'forensics' }, error: null }));
  const store = createBoardStore(client, 's');
  const out = await store.settle();
  assert.equal(out, undefined, 'settle reveals nothing to the caller');
  assert.deepEqual(calls.at(-1), { op: 'rpc', fn: 'settle_connection_effects', args: { p_session: 's' } });
  assert.equal(shouldSettle('open', null, 1000), true);
  assert.equal(shouldSettle('knowledge_changed', 1000, 1000 + SETTLE_MIN_GAP_MS - 1), false);
  assert.equal(shouldSettle('knowledge_changed', 1000, 1000 + SETTLE_MIN_GAP_MS), true);
  assert.equal(shouldSettle('validated', 1000, 1001), true);
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  assert.ok(!/pending/i.test(ui.replace(/\/\/[^\n]*/g, '')), 'the UI never mentions pending rewards');
});

// ============================================================
// التركيز، أثر المصدر، المواضع
// ============================================================
test('focus corridor shows only what the team attached explicitly — no inferred relevance', () => {
  const threads: BoardThread[] = [
    { id: 't1', kind: 'support', from: 'h', to: 'a', authorId: 'x' },
    { id: 't2', kind: 'tension', from: 'h', to: 'b', authorId: 'x' },
    { id: 't3', kind: 'tentative', from: 'a', to: 'b', authorId: 'x' },
    { id: 't4', kind: 'tentative', from: 'c', to: 'd', authorId: 'x' },
  ];
  const f = focusCorridor('h', threads);
  assert.deepEqual([...f.items].sort(), ['a', 'b', 'h']);
  assert.deepEqual([...f.threads].sort(), ['t1', 't2', 't3']);
});

test('origin trace uses authorized provenance and known ancestors only — never invented, never hidden', () => {
  const cat = catalog({ objects: [ROOM, obj('LAPTOP', { category: 'device' }), obj('SECRET_PARENT', { state: 'HIDDEN' }), obj('CHILD', { parent_code: 'SECRET_PARENT' })] });
  const d = resolveMaterial({ kind: 'evidence', code: 'F-01' }, cat)!;
  assert.deepEqual(
    originTrace(d, cat, [{ evidence_code: 'F-01', object_code: 'LAPTOP', object_title: 'لابتوب', object_category: 'device' }]).map((s) => s.code),
    ['ROOM_714', 'LAPTOP', 'F-01'],
  );
  assert.deepEqual(originTrace(d, cat, []), [], 'no provenance → no invented trail');
  const child = resolveMaterial({ kind: 'object', code: 'CHILD' }, cat)!;
  assert.deepEqual(originTrace(child, cat, []).map((s) => s.code), ['CHILD'], 'a hidden ancestor ends the trail');
});

test('new pieces land in a deterministic spiral (no randomness, no auto-grouping)', () => {
  assert.deepEqual(nextSpot(3), nextSpot(3));
  for (let n = 0; n < 40; n += 1) {
    const p = nextSpot(n);
    assert.ok(p.x >= 0.1 && p.x <= 0.9 && p.y >= 0.12 && p.y <= 0.88);
  }
  // QA: القطع كانت تتراكب فتخفي الخيوط — أول ثماني مواضع متباعدة بقدر عرض قطعة تقريباً.
  const pts = Array.from({ length: 8 }, (_, n) => nextSpot(n));
  for (let i = 0; i < pts.length; i += 1)
    for (let j = i + 1; j < pts.length; j += 1) assert.ok(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y) >= 0.14, `${i}/${j}`);
});

// ============================================================
// (18) الهاتف بلا سحب دقيق · (19) حركة مخفّضة · (20) لا حقيقة سيرفر بالعميل
// ============================================================
test('18. mobile: every board action is reachable by tap — no drag required', () => {
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  const piece = readFileSync('src/app/case/[code]/board/BoardPiece.tsx', 'utf8');
  assert.match(ui, /onPointerDown=\{mobile \? undefined :/, 'no drag handler in stack mode');
  assert.match(piece, /onClick: layout === 'stack' \? onActivate : undefined/, 'tap selects in stack mode');
  assert.match(ui, /role="toolbar" aria-label="أفعال على المواد المختارة"/);
  assert.match(ui, /ArrowUp: \[0, -step\]/, 'keyboard can move pieces without a pointer');
  const css = readFileSync('src/app/case/[code]/board/board.module.css', 'utf8');
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.stack \.context \{\s*position: fixed;/);
  assert.match(readFileSync('src/app/case/[code]/ui/ui.module.css', 'utf8'), /min-block-size: 2\.75rem;/, 'touch-safe controls (44px)');
});

test('19. reduced motion: board, shell and interrogation all disable their motion', () => {
  for (const f of ['src/app/case/[code]/board/board.module.css', 'src/app/case/[code]/ui/ui.module.css', 'src/app/case/[code]/interrogation.module.css']) {
    const css = readFileSync(f, 'utf8');
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.ok(block.length > 0 && /animation: none/.test(block), f);
  }
});

test('connection states are never color-only (pattern + text) and the board is keyboard/screen-reader legible', () => {
  const css = readFileSync('src/app/case/[code]/board/board.module.css', 'utf8');
  assert.match(css, /\.thread\[data-kind='tentative'\][^}]*stroke-dasharray: 6 5/);
  assert.match(css, /\.thread\[data-kind='tension'\][^}]*stroke-dasharray: 1\.5 4/);
  assert.match(css, /\.thread\[data-validated='true'\][^}]*stroke-dasharray: none/);
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  assert.match(ui, /aria-label="الخيوط على اللوحة"/);
  assert.match(ui, /متقطع = مؤقت · رفيع = إسناد · نقطي = توتر · نحاسي = مثبت/);
  assert.match(ui, /if \(e\.key !== 'Escape'/);
});

test('20. board modules never import server-only case truth', () => {
  for (const f of ['boardModel.ts', 'boardStore.ts', 'InvestigationBoard.tsx', 'BoardPiece.tsx', 'HypothesisSheet.tsx']) {
    const src = readFileSync(`src/app/case/[code]/board/${f}`, 'utf8');
    assert.ok(!/@\/server\/|sceneMedia/.test(src), f);
  }
});

// ============================================================
// سياسة العنوان فقط: مرئي للفريق ≠ مقروء/صالح للاستدلال
// ============================================================
test('title-only evidence: pinnable (team knows it exists) but never a test node, support, or AI material for a non-reader', async () => {
  const { canReason } = await import('../../src/app/case/[code]/board/boardModel');
  const cat = catalog(); // D-03 مقروء؟ لا — محجوب بعنوانه لهذا اللاعب
  assert.equal(pinEligibility('evidence', 'D-03', cat).status, 'eligible', 'visible to the team by title');
  const view = resolveMaterial({ kind: 'evidence', code: 'D-03' }, cat)!;
  assert.equal(view.kind === 'evidence' && view.access, 'restricted');
  assert.equal(canReason(view), false);
  assert.equal(canReason(resolveMaterial({ kind: 'evidence', code: 'F-01' }, cat)), true);
  assert.equal(canReason(resolveMaterial({ kind: 'object', code: 'GLASS_CUP' }, cat)), true);
  const items = [item('r', 'ev:D-03'), item('f', 'ev:F-01')];
  assert.equal(proposalFromSelection(['r', 'f'], items, cat), null, 'cannot test what I cannot read');
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  assert.match(ui, /if \(e\.item\.kind === 'material' && !canReason\(e\.view\)\) continue;/, 'no support/tension from a title');
  assert.match(ui, /!!e && !!e\.view && canReason\(e\.view\)/, 'stress-test attachments: readable only');
  assert.match(ui, /المادة المحجوبة يختبرها من يقرؤها/);
});

test('QA regression: closing a panel returns focus to its opener or to the examined piece — never lost', () => {
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  assert.match(ui, /if \(el && document\.contains\(el\) && el !== document\.body\) el\.focus\(\);\s*else if \(examined\) document\.querySelector<HTMLElement>\(`\[data-item-id="\$\{examined\}"\]`\)\?\.focus\(\);/);
  assert.match(ui, /function restoreFocus\(fallbackItemId\?: string \| null\)/);
});

// ============================================================
// Board V2 الحية (031): مخزن واحد، RPCs فقط، لا كتابة مزدوجة
// ============================================================
test('L1–3. no production code touches the legacy board tables, and nothing writes board tables directly (no dual write)', () => {
  const files = sourceFiles('src');
  assert.ok(files.length > 50);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/board_notes|board_links/.test(src), `${f} references a legacy board table`);
    assert.ok(!/from\(\s*['"]board_(items|threads|validations)['"]\s*\)\s*\.(insert|update|upsert|delete)\(/.test(src), `${f} writes a board table directly`);
  }
  const store = readFileSync('src/app/case/[code]/board/boardStore.ts', 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/\.(insert|update|upsert|delete)\(/.test(store), 'the store has no table-write path at all');
  // الأنواع القديمة وترميزها لم تعد موجودة
  assert.ok(!/BoardNote|BoardLink/.test(readFileSync('src/types/case.ts', 'utf8')));
  assert.ok(!/encodeMaterial|encodeReasoning|decodeNote|decodeLink|'@hypothesis'|ev:|obj:/.test(readFileSync('src/app/case/[code]/board/boardModel.ts', 'utf8')));
});

test('L4. every board operation uses the exact live 031 RPC and its exact parameter names', async () => {
  const sql = readFileSync('sql/031_board_v2.sql', 'utf8');
  const params = (fn: string) => {
    const m = new RegExp(`create or replace function public\\.${fn}\\(([^)]*)\\)`).exec(sql);
    assert.ok(m, fn);
    return m![1]!.split(',').map((p) => p.trim().split(/\s+/)[0]!).sort();
  };
  const { client, calls } = fakeClient(() => ({ data: { status: 'not_established' }, error: null }));
  const store = createBoardStore(client, 's');
  await store.pinMaterial({ kind: 'object', code: 'GLASS_CUP' }, 0.2, 0.3);
  await store.addReasoning('question', 'من فتح الشباك؟', 0.5, 0.5);
  await store.editReasoning('i', 'من فتح الشباك أولاً؟');
  await store.move('i', 0.1, 0.1);
  await store.remove('i');
  await store.link('a', 'b', 'tension');
  await store.unlink('t');
  await store.testSelection(['a', 'b']);
  const rpcs = calls.filter((c) => c.op === 'rpc');
  assert.equal(rpcs.length, 8);
  for (const c of rpcs) assert.deepEqual(Object.keys(c.args as object).sort(), params(c.fn!), c.fn);
  // القراءة: الجداول الثلاثة فقط، وفشل أي منها خطأ ظاهر لا لوحة جزئية صامتة
  await store.load();
  assert.deepEqual(calls.filter((c) => c.op === 'select').map((c) => c.table), [...BOARD_TABLES]);
  const broken: BoardClient = {
    from: (table) => ({ select: () => ({ eq: () => Promise.resolve({ data: null, error: table === 'board_threads' ? { code: 'x' } : null }) }) }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
  await assert.rejects(createBoardStore(broken, 's').load());
});

test('L6. Scene 17 private-channel evidence is absent from a non-holder’s board — no title, no placeholder, no count', () => {
  const nonHolder = catalog({ caseId: 'scene-17', policy: 'hidden', evidence: [ev('S17-PRIV', false)], objects: [] });
  const items = [item('x', 'ev:S17-PRIV'), item('q', 'question', 'سؤال')];
  const v = visibleBoard(items, [thread('t', 'x', 'q')], nonHolder);
  assert.deepEqual(v.items.map((e) => e.item.id), ['q']);
  assert.deepEqual(v.threads, [], 'its threads vanish with it');
  assert.ok(!JSON.stringify(v).includes('S17-PRIV') && !JSON.stringify(v).includes('عنوان'));
  assert.deepEqual(pinEligibility('evidence', 'S17-PRIV', nonHolder), { status: 'unavailable' });
  // والسيرفر: لا صف سياسة لـ scene-17 → كل دليل فيه NOT_PINNABLE
  assert.ok(!/'scene-17'/.test(readFileSync('sql/031_board_v2.sql', 'utf8').replace(/--[^\n]*/g, '')));
});

test('L7/8. a private object cannot be pinned; a shared one (shared chain) can — and the server has the last word', async () => {
  const cat = catalog();
  assert.equal(pinEligibility('object', 'VICTIM_ITEMS', cat).status, 'share_first', 'private find: share first');
  assert.equal(pinEligibility('object', 'GLASS_CUP', cat).status, 'eligible', 'shared, chain shared');
  const refused = createBoardStore(fakeClient(() => ({ data: null, error: { message: 'NOT_PINNABLE' } })).client, 's');
  assert.equal(await refused.pinMaterial({ kind: 'object', code: 'VICTIM_ITEMS' }, 0.5, 0.5), 'not_pinnable');
  const flaky = createBoardStore(fakeClient(() => ({ data: null, error: { message: 'network' } })).client, 's');
  assert.equal(await flaky.pinMaterial({ kind: 'object', code: 'GLASS_CUP' }, 0.5, 0.5), 'failed');
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  assert.match(ui, /if \(outcome === 'not_pinnable'\) note\('هذه المادة غير متاحة للوحة\.'\);/);
});

test('L11/12. the validated lock is server state for the whole team — never assumed or forged by a client', async () => {
  const { client } = fakeClient(undefined, {
    board_items: [row('a', 'ev:F-01'), row('b', 'obj:GLASS_CUP'), row('c', 'obj:LAPTOP')],
    board_threads: [threadRow('t1', 'a', 'b'), threadRow('t2', 'b', 'c'), threadRow('t3', 'a', 'c', 'validated')],
    board_validations: [{ id: 'v1', session_id: 's', item_ids: ['a', 'b'], meaning: 'معنى مثبت' }],
  });
  const snap = await createBoardStore(client, 's').load();
  assert.deepEqual(snap.threads.map((t) => t.id), ['t1', 't2'], 'a client-written "validated" thread is dropped');
  assert.deepEqual(snap.threads.map((t) => threadValidated(t, snap.validations)), [true, false]);
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  assert.ok(!/setValidatedGroups|validatedGroups/.test(ui), 'no local "validated" state');
  assert.match(ui, /const isValidated = \(t: BoardThread\) => threadValidated\(t, validations\);/);
  const onSuccess = ui.slice(ui.indexOf("if (outcome.status === 'validated')"), ui.indexOf("} else if (outcome.status === 'throttled')"));
  assert.match(onSuccess, /void loadBoard\(\);/, 'the lock is re-read from board_validations');
  assert.ok(!/setValidations/.test(onSuccess));
});

test('L13. realtime listens to the 031 tables (deletes matched by id), not the legacy ones', () => {
  assert.deepEqual([...BOARD_TABLES], ['board_items', 'board_threads', 'board_validations']);
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  assert.match(ui, /for \(const table of BOARD_TABLES\)/);
  assert.match(ui, /\{ event: 'INSERT', schema: 'public', table, filter \}/);
  assert.match(ui, /\{ event: 'DELETE', schema: 'public', table \}, onDelete/);
  assert.match(ui, /knownIdsRef\.current\.has\(id\)\) void loadBoard\(\)/);
  assert.match(ui, /if \(table === 'board_validations'\) void loadLedger\(\);/, 'a new team lock refreshes the ledger too');
  const caseFile = readFileSync('src/app/case/[code]/casefile/CaseFile.tsx', 'utf8');
  assert.match(caseFile, /table: 'board_items', filter \}, refreshPins/);
});

test('L14. AI material is unchanged: the stress test still receives readable attachments only', () => {
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  assert.match(ui, /attached=\{attachedIds\}/);
  assert.match(ui, /!!e && !!e\.view && canReason\(e\.view\)/);
  const sheet = readFileSync('src/app/case/[code]/board/HypothesisSheet.tsx', 'utf8');
  assert.ok(!/boardStore|board_items|board_threads/.test(sheet), 'the AI sheet never reads board storage');
});
