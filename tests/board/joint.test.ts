// ============================================================
// tests/board/joint.test.ts
// الربط المشترك على اللوحة (033 حي): مساهمة بما أقرؤه فقط، إخفاء مساهمة
// الزميل الخاصة، اختبار صريح واحد، سحب مساهمتي فقط، المغلق يغادر، وتحديث
// لحظي عبر العرض المقنَّع لا صفوف المساهمات.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveMaterial, type ViewerCatalog } from '../../src/app/case/[code]/board/boardModel';
import {
  activeProposal,
  alreadyMine,
  canContribute,
  canTestJoint,
  contributionLabel,
  decodeJointProposals,
  openProposals,
} from '../../src/app/case/[code]/board/jointModel';
import { createBoardStore, type BoardClient } from '../../src/app/case/[code]/board/boardStore';
import type { EvidenceItem } from '../../src/types/case';
import type { InvestigationObject } from '../../src/types/investigationObjects';

const ev = (code: string, readable: boolean): EvidenceItem =>
  ({ code, title: `عنوان ${code}`, kind: 'document', owner_spec: 'forensics', clock_label: null, body: readable ? `نص سري ${code}` : null, has_media: false, readable, unlocked_at: '2026-10-01T00:00:00Z' }) as EvidenceItem;
const obj = (code: string, over: Partial<InvestigationObject> = {}): InvestigationObject => ({
  code, category: 'object', parent_code: null, title: `عنصر ${code}`, description: '', state: 'DISCOVERED', discovered: true, is_shared: true, processing: false, actions: [], ...over,
});
const cat = (over: Partial<ViewerCatalog> = {}): ViewerCatalog => ({
  caseId: 'room-714', policy: 'title', evidence: [ev('F-01', true), ev('D-01', false)], objects: [obj('ROOM_714', { category: 'location' })], ...over,
});
const names: Record<string, string> = { a: 'حازم', b: 'سارة-اللاعبة' };
const nameOf = (id: string) => names[id] ?? null;

const SQL33 = readFileSync('sql/033_joint_connections.sql', 'utf8');
const UI = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
const STRIP = readFileSync('src/app/case/[code]/board/JointStrip.tsx', 'utf8');
const code = (s: string) => s.replace(/\/\/[^\n]*/g, '');

function fakeClient(reply: (fn: string) => { data: unknown; error: { message?: string } | null } = () => ({ data: null, error: null })) {
  const calls: { fn: string; args: unknown }[] = [];
  const client: BoardClient = {
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve(reply(fn));
    },
  };
  return { client, calls };
}

// ============================================================
// العرض المقنَّع
// ============================================================
test('masked view decode: open/validated only, unknown fields dropped, meaning only when validated, bad refs → null', () => {
  const ps = decodeJointProposals([
    { id: 'p1', created_by: 'a', status: 'open', meaning: 'تسريب؟', rule_id: 'R714_X', contributions: [
      { contributor: 'a', mine: true, ref: { kind: 'evidence', id: 'F-01' }, body: 'نص' },
      { contributor: 'b', mine: false, ref: null },
      { contributor: 'b', mine: false, ref: { kind: 'title', id: 'x' } },
    ] },
    { id: 'p2', status: 'closed', contributions: [] },
    { id: 'p3', status: 'validated', meaning: 'معنى مؤلَّف', contributions: [] },
    'junk',
  ]);
  assert.deepEqual(ps.map((p) => p.id), ['p1', 'p3'], 'closed never enters the board');
  assert.equal(ps[0]!.meaning, null, 'no meaning before validation');
  assert.equal(ps[1]!.meaning, 'معنى مؤلَّف');
  assert.deepEqual(ps[0]!.contributions.map((c) => c.ref), [{ kind: 'evidence', id: 'F-01' }, null, null]);
  const json = JSON.stringify(ps);
  for (const leak of ['R714_X', 'rule_id', 'body', 'نص']) assert.ok(!json.includes(leak), leak);
  assert.deepEqual(decodeJointProposals({ not: 'an array' }), []);
});

test('active area: only open proposals; validated/closed leave it', () => {
  const ps = decodeJointProposals([
    { id: 'old', created_by: 'a', status: 'open', contributions: [] },
    { id: 'done', status: 'validated', meaning: 'm', contributions: [] },
    { id: 'new', created_by: 'b', status: 'open', contributions: [] },
  ]);
  assert.deepEqual(openProposals(ps).map((p) => p.id), ['old', 'new']);
  assert.equal(activeProposal(ps)?.id, 'new', 'new contributions go to the latest open proposal');
  assert.equal(activeProposal([]), null);
  assert.match(STRIP, /const open = proposals\.filter\(\(p\) => p\.status === 'open'\);/);
});

// ============================================================
// المساهمة: ما أقرؤه فقط
// ============================================================
test('title-only / unreadable material has no contribute action; readable evidence and known objects do', () => {
  const c = cat();
  assert.equal(canContribute(resolveMaterial({ kind: 'evidence', code: 'D-01' }, c)), false, 'title-only is not enough');
  assert.equal(canContribute(resolveMaterial({ kind: 'evidence', code: 'F-01' }, c)), true);
  assert.equal(canContribute(resolveMaterial({ kind: 'location', code: 'ROOM_714' }, c)), true);
  assert.equal(canContribute(null), false);
  assert.match(UI, /const contributeRef: JointRef \| null = single\?\.view && canContribute\(single\.view\)/);
  assert.match(UI, /\{offerContribute && \(\s*<button[^>]*onClick=\{\(\) => void contributeSelected\(\)\}>\s*ساهم بهذا الدليل/);
});

test('Scene 17: channel-private material is neither contributable by a non-holder nor titled from a teammate ref', () => {
  const nonHolder = cat({ caseId: 'scene-17', policy: 'hidden', evidence: [ev('S17-PRIV', false)], objects: [] });
  assert.equal(canContribute(resolveMaterial({ kind: 'evidence', code: 'S17-PRIV' }, nonHolder)), false);
  const label = contributionLabel({ contributor: 'b', mine: false, ref: { kind: 'evidence', id: 'S17-PRIV' } }, nonHolder, nameOf);
  assert.equal(label.primary, 'مساهمة من زميل', 'even a ref resolves to nothing for a non-holder');
  assert.ok(!JSON.stringify(label).includes('S17-PRIV'));
});

test('privacy: a teammate’s private contribution is masked; a team-visible one shows only the allowed title; mine stays identifiable', () => {
  const c = cat();
  const priv = contributionLabel({ contributor: 'b', mine: false, ref: null }, c, nameOf);
  assert.deepEqual(priv, { primary: 'مساهمة من زميل', by: 'مساهمة من سارة-اللاعبة', mine: false });
  const visible = contributionLabel({ contributor: 'b', mine: false, ref: { kind: 'evidence', id: 'D-01' } }, c, nameOf);
  assert.equal(visible.primary, 'عنوان D-01', 'title only — Room 714 policy says the team knows it exists');
  const mine = contributionLabel({ contributor: 'a', mine: true, ref: { kind: 'evidence', id: 'F-01' } }, c, nameOf);
  assert.deepEqual(mine, { primary: 'عنوان F-01', by: 'مساهمتك', mine: true });
  const unknownName = contributionLabel({ contributor: 'zzz', mine: false, ref: null }, c, nameOf);
  assert.equal(unknownName.by, 'مساهمة من زميل');
  for (const l of [priv, visible, mine]) assert.ok(!JSON.stringify(l).includes('نص سري'), 'never a body');
  assert.ok(!/\.body|has_media|media/.test(code(STRIP)), 'the strip never renders bodies or media');
  assert.ok(!/تخصص|forensics|digital|records|field|\d+\s*\/\s*\d+|ينقص|missing/i.test(code(STRIP)), 'no specialization badges, no progress');
});

// ============================================================
// المخزن: عقد 033 الحي بأسماء معاملاته الدقيقة
// ============================================================
function sqlParams(fn: string): string[] {
  const m = new RegExp(`create or replace function public\\.${fn}\\(([^)]*)\\)`).exec(SQL33);
  assert.ok(m, fn);
  return m![1]!.split(',').map((p) => p.trim().split(/\s+/)[0]!).sort();
}

test('store uses the exact live 033 RPCs and parameter names; contributing opens a proposal only when none is open', async () => {
  const { client, calls } = fakeClient((fn) => (fn === 'open_joint_proposal' ? { data: 'p-new', error: null } : { data: null, error: null }));
  const store = createBoardStore(client, 's');
  assert.equal(await store.contributeJoint(null, { kind: 'evidence', id: 'F-01' }), 'contributed');
  assert.deepEqual(calls.map((c) => c.fn), ['open_joint_proposal', 'contribute_to_joint']);
  assert.deepEqual(calls[1]!.args, { p_proposal: 'p-new', p_kind: 'evidence', p_id: 'F-01' });
  calls.length = 0;
  await store.contributeJoint('p1', { kind: 'location', id: 'ROOM_714' });
  assert.deepEqual(calls.map((c) => c.fn), ['contribute_to_joint'], 'existing open proposal: contribute only');
  await store.withdrawJoint('p1', { kind: 'location', id: 'ROOM_714' });
  await store.closeJoint('p1');
  await store.testJoint('p1');
  await store.jointProposals();
  calls.unshift({ fn: 'open_joint_proposal', args: { p_session: 's', p_relation: null } });
  for (const c of calls) assert.deepEqual(Object.keys(c.args as object).sort(), sqlParams(c.fn), c.fn);
  const refused = createBoardStore(fakeClient(() => ({ data: null, error: { message: 'NOT_CONTRIBUTABLE' } })).client, 's');
  assert.equal(await refused.contributeJoint('p1', { kind: 'evidence', id: 'D-01' }), 'not_contributable');
});

test('joint test: one RPC, neutral miss, success exposes only the meaning (no rule id / target)', async () => {
  const { client, calls } = fakeClient(() => ({ data: { status: 'not_established' }, error: null }));
  assert.deepEqual(await createBoardStore(client, 's').testJoint('p1'), { status: 'not_established' });
  assert.deepEqual(calls, [{ fn: 'test_joint_proposal', args: { p_proposal: 'p1' } }]);
  const ok = await createBoardStore(fakeClient(() => ({ data: { status: 'validated', meaning: 'معنى', rule_id: 'R714_X', effects: ['E15'] }, error: null })).client, 's').testJoint('p1');
  assert.deepEqual(ok, { status: 'validated', meaning: 'معنى' });
  for (const data of [{}, null, { status: 'validated' }, { status: 'not_established', hint: 'one more' }]) {
    assert.deepEqual(await createBoardStore(fakeClient(() => ({ data, error: null })).client, 's').testJoint('p1'), { status: 'not_established' });
  }
});

test('the test button: participants with ≥2 live contributions only; exactly one explicit call path, never automatic', () => {
  const p = (createdBy: string, n: number, mine = false) =>
    decodeJointProposals([{ id: 'p', created_by: createdBy, status: 'open', contributions: Array.from({ length: n }, (_, i) => ({ contributor: i === 0 && mine ? 'me' : 'x', mine: i === 0 && mine, ref: null })) }])[0]!;
  assert.equal(canTestJoint(p('me', 1), 'me'), false, 'needs two');
  assert.equal(canTestJoint(p('me', 2), 'me'), true);
  assert.equal(canTestJoint(p('x', 2), 'me'), false, 'not a participant');
  assert.equal(canTestJoint(p('x', 2, true), 'me'), true, 'a contributor is a participant');
  const ui = code(UI);
  assert.equal((ui.match(/store\.testJoint\(/g) ?? []).length, 1);
  const testFn = ui.slice(ui.indexOf('async function testJoint('), ui.indexOf('async function pin('));
  assert.match(testFn, /store\.testJoint\(p\.id\)/);
  for (const auto of ['loadJoint', 'contributeSelected', 'withdrawJoint', 'closeJoint', 'onStagePointerUp', 'onPieceKey']) {
    const at = ui.indexOf(`function ${auto}`) >= 0 ? ui.indexOf(`function ${auto}`) : ui.indexOf(`const ${auto}`);
    const body = ui.slice(at, ui.indexOf('\n  }', at));
    assert.ok(!/testJoint|testSelection/.test(body), `${auto} never tests`);
  }
  assert.match(STRIP, /canTestJoint\(p, myId\) && \(\s*<button[^>]*onClick=\{\(\) => onTest\(p\)\}>\s*اختبر الربط المشترك/);
  assert.equal((STRIP.match(/onTest\(/g) ?? []).length, 1);
});

test('withdraw: only on my own contribution; close: participants only', () => {
  assert.match(STRIP, /\{c\.mine && c\.ref && \(\s*<button[^>]*onClick=\{\(\) => onWithdraw\(p, c\.ref!\)\}>\s*اسحب مساهمتي/);
  assert.match(STRIP, /\{isParticipant\(p, myId\) && \(/);
  assert.match(STRIP, /أغلق الربط/);
  const mine = decodeJointProposals([{ id: 'p', created_by: 'x', status: 'open', contributions: [{ contributor: 'me', mine: true, ref: { kind: 'evidence', id: 'F-01' } }] }])[0]!;
  assert.equal(alreadyMine(mine, { kind: 'evidence', id: 'F-01' }), true, 'no duplicate offer for what I already contributed');
  assert.equal(alreadyMine(mine, { kind: 'evidence', id: 'R-01' }), false);
});

// ============================================================
// اللحظي + عدم التسرّب + الهاتف
// ============================================================
test('realtime: proposal-row signal re-reads the masked view; contribution rows are never read or subscribed by any client code', () => {
  assert.match(UI, /\{ event: 'INSERT', schema: 'public', table: 'session_joint_proposals', filter \}, onJoint/);
  assert.match(UI, /\{ event: 'UPDATE', schema: 'public', table: 'session_joint_proposals', filter \}, onJoint/);
  assert.match(UI, /const onJoint = \(\) => \{\s*void loadJoint\(\);\s*void loadLedger\(\);\s*\};/);
  assert.match(code(readFileSync('src/app/case/[code]/board/boardStore.ts', 'utf8')), /client\.rpc\('joint_proposals', \{ p_session: sessionId \}\)/);
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : /\.(ts|tsx)$/.test(n) ? [join(d, n)] : []));
  for (const f of walk('src')) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!/session_joint_contributions/.test(s), `${f} touches raw contribution rows`);
    assert.ok(!/from\(\s*['"]session_joint_proposals['"]\s*\)/.test(s), `${f} reads proposal rows directly instead of the masked view`);
  }
});

test('mobile/keyboard: the joint flow is buttons only (no drag), 44px tool buttons, focus returns to the strip or ledger', () => {
  assert.ok(!/onPointer|draggable/.test(STRIP));
  assert.equal((STRIP.match(/className=\{toolClass\}/g) ?? []).length, 3);
  assert.match(readFileSync('src/app/case/[code]/ui/ui.module.css', 'utf8'), /min-block-size: 2\.75rem;/);
  assert.match(STRIP, /tabIndex=\{-1\}/);
  // QA fix: the focus target is chosen AFTER React commits the new joint state (closed strip gone → ledger)
  assert.match(UI, /if \(!focusJointAfterRenderRef\.current\) return;\s*focusJointAfterRenderRef\.current = false;\s*\(jointRef\.current \?\? ledgerRef\.current\)\?\.focus\(\);\s*\}, \[joint\]\);/);
  assert.ok(!/requestAnimationFrame/.test(UI));
  const css = readFileSync('src/app/case/[code]/board/board.module.css', 'utf8');
  const block = css.slice(css.indexOf('.jointRow {'), css.indexOf('/* ---------- السطح'));
  assert.match(block, /flex-wrap: wrap;/);
  assert.match(block, /overflow-wrap: anywhere;/);
  assert.ok(!/animation|transition/.test(block), 'nothing to reduce');
});

test('private knowledge can be contributed without pinning — only what I read, never title-only, never twice', () => {
  // قسم «موادك المقروءة» (سياسة hidden): السيرفر يقرر التثبيت، والمساهمة الخاصة متاحة دون كشف
  assert.match(UI, /const privateReadable = evidence\s*\.filter\(\(e\) => \{\s*const st = pinEligibility\('evidence', e\.code, catalog\)\.status;\s*return st === 'server_decides' \|\| st === 'private';\s*\}\)/);
  assert.match(UI, /\.filter\(\(v\): v is MaterialView => canContribute\(v\)\);/);
  assert.match(UI, /\{!alreadyMine\(jointActive, \{ kind: 'evidence', id: v\.code \}\) && \(/, 'never contribute the same item twice');
  // server-marked private (any reload): never a pin button. Unguided: the server decides; a refusal is remembered.
  assert.match(UI, /if \(elig\.status === 'private'\) return note\(PRIVATE_NOTE\);/);
  assert.match(UI, /if \(outcome === 'not_pinnable' && elig\.status === 'server_decides'\) \{\s*\/\/[^\n]*\n\s*setRefusedPins/);
  assert.match(UI, /pinEligibility\('evidence', v\.code, catalog\)\.status === 'private' \|\| refusedPins\.has\(v\.code\) \? \(\s*<span className=\{s\.jointBy\}>خاص بك — لا يُثبَّت<\/span>\s*\) : \(\s*!pinnedCodes\.has\(`evidence:\$\{v\.code\}`\) && \(/);
  // اكتشافي الخاص (share_first): أشارك أو أساهم دون كشف — والسيرفر يقنّعه لزملائي
  assert.match(UI, /!alreadyMine\(jointActive, \{ kind, id: o\.code \}\) && canContribute\(resolveMaterial\(\{ kind, code: o\.code \}, catalog\)\)/);
  assert.match(UI, /يرى زملاؤك أنك ساهمت، لا ماذا\./);
  // a Scene 17 holder reads their channel evidence: contributable; a non-holder: not
  const holder = cat({ caseId: 'scene-17', policy: 'hidden', evidence: [ev('S17-PRIV', true)], objects: [] });
  assert.equal(canContribute(resolveMaterial({ kind: 'evidence', code: 'S17-PRIV' }, holder)), true);
  // the masked teammate view of that contribution carries no ref → «مساهمة من زميل»
  assert.equal(contributionLabel({ contributor: 'a', mine: false, ref: null }, holder, nameOf).primary, 'مساهمة من زميل');
});
