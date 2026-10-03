// ============================================================
// tests/cases/dualCase.test.ts
// تمرير التحقق المزدوج: المحرك المشترك نفسه يخدم نموذجين —
//   غرفة 714: توزيع بالتخصص + محجوب بالعنوان (title)
//   المشهد 17: توزيع بالقنوات + مخفي كلياً (hidden)
//
// قاعدة ثابتة: توزيع القضية (بالسيرفر) يقرّر القابلية للقراءة؛ الأنظمة
// المشتركة تستهلك readable ولا تستنتجها من تخصص ولا من قناة.
//
// ⚠ بيانات المشهد 17 هنا اصطناعية: TEST ONLY · NON-CANON · NEVER SEED.
//   (S17-TEST-A / S17-TEST-F وكل نص فيها مخترع للاختبار فقط.)
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { evidenceVisibility, visibleEvidenceRows } from '../../src/lib/evidenceVisibility';
import { buildCorpus, searchCorpus, type EvidenceRow, type ObjectRow } from '../../src/lib/inquiry/search';
import { buildAuthorizedKnowledge, knowledgeView, loadAuthorizedKnowledge, type AuthorizedInput, type AuthorizedKnowledgeSource } from '../../src/lib/ai/knowledge';
import { runStressTest, type StressTestDeps } from '../../src/lib/ai/stressTest';
import type { ChatMessage } from '../../src/lib/ai/provider';
import { earnedFromAuthorized, entityViewFor, type AuthoredEntity } from '../../src/lib/entities/progressive';
import { canReason, pinEligibility, resolveMaterial, visibleBoard, type BoardItem, type ViewerCatalog } from '../../src/app/case/[code]/board/boardModel';
import { canContribute, canTestJoint, contributionLabel, decodeJointProposals } from '../../src/app/case/[code]/board/jointModel';
import { createBoardStore, type BoardClient } from '../../src/app/case/[code]/board/boardStore';
import { getCaseContract, getCasePresentation } from '../../src/cases/registry';
import { getCaseServerModule } from '../../src/server/cases/registry';
import { resolveObjectView, sceneImagePath } from '../../src/lib/sceneMedia';
import type { EvidenceItem } from '../../src/types/case';
import type { InvestigationObject } from '../../src/types/investigationObjects';

// ============================================================
// نموذج سيرفر اصطناعي للمشهد 17 (TEST ONLY · NON-CANON · NEVER SEED)
// اللاعبان بنفس التخصص (digital) عمداً — القراءة تحددها القناة فقط.
// ============================================================
type Player = 'A' | 'F';
const PLAYERS = {
  A: { userId: 'user-a', specialization: 'digital', channels: ['A'] },
  F: { userId: 'user-f', specialization: 'digital', channels: ['F'] },
} as const;
const S17_TEST = [
  { code: 'S17-TEST-A', channel: 'A', title: 'ورقة اختبار ألف', body: 'كلمةسريةألف تظهر لحامل القناة A فقط', owner_spec: 'digital' as const },
  { code: 'S17-TEST-F', channel: 'F', title: 'ورقة اختبار فاء', body: 'كلمةسريةفاء تظهر لحامل القناة F فقط', owner_spec: 'digital' as const },
];

/**
 * ما يُرجعه evidence_index اليوم (الحي) لعضو: كل دليل مفتوح، readable حسب
 * توزيع القضية، والعنوان يُرسل حتى لغير القارئ — المستهلكون المشتركون
 * يجب أن يحذفوه تحت 'hidden'. (عيب سيرفر مُبلَّغ عنه — انظر التقرير.)
 */
function s17Index(p: Player): (EvidenceRow & EvidenceItem)[] {
  return S17_TEST.map((e) => {
    const readable = (PLAYERS[p].channels as readonly string[]).includes(e.channel);
    return { code: e.code, title: e.title, kind: 'document', owner_spec: e.owner_spec, clock_label: null, body: readable ? e.body : null, has_media: false, readable, unlocked_at: '2026-10-01T00:00:00Z' } as EvidenceRow & EvidenceItem;
  });
}
const otherOf = (p: Player): Player => (p === 'A' ? 'F' : 'A');
const mineOf = (p: Player) => S17_TEST.find((e) => e.channel === p)!;
const S17_POLICY = getCaseContract('scene-17')!.restrictedEvidence;
const R714_POLICY = getCaseContract('room-714')!.restrictedEvidence;

const s17Catalog = (p: Player): ViewerCatalog => ({ caseId: 'scene-17', policy: S17_POLICY, evidence: s17Index(p), objects: [] });
const leaks = (value: unknown, e: (typeof S17_TEST)[number]) => {
  const json = JSON.stringify(value);
  return [e.code, e.title, e.body, 'كلمةسرية' + (e.channel === 'A' ? 'ألف' : 'فاء')].filter((x) => json.includes(x));
};

// ============================================================
// B/C — نموذج التفويض: القراءة من التوزيع، لا من التخصص
// ============================================================
test('contracts: Room 714 = specialization + title; Scene 17 = channels + hidden + development (not playable)', () => {
  const r = getCaseContract('room-714')!;
  const s = getCaseContract('scene-17')!;
  assert.equal(r.distribution.kind, 'specialization');
  assert.equal(r.restrictedEvidence, 'title');
  assert.equal(s.distribution.kind, 'channels');
  assert.equal(s.restrictedEvidence, 'hidden');
  assert.equal(s.status, 'development');
});

test('the shared readability consumers never infer readability from specialization or channel', () => {
  const shared = [
    'src/lib/evidenceVisibility.ts',
    'src/app/case/[code]/board/jointModel.ts',
  ];
  for (const f of shared) {
    const code = readFileSync(f, 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/owner_spec|ownerSpec|specializ|channel|has_specialization/i.test(code), f);
  }
  // boardModel/knowledge/search carry owner_spec only as display data; the decision is readable + policy
  for (const f of ['src/app/case/[code]/board/boardModel.ts', 'src/lib/ai/knowledge.ts', 'src/lib/inquiry/search.ts']) {
    const code = readFileSync(f, 'utf8');
    assert.match(code, /evidenceVisibility\(/, `${f} decides through the one shared rule`);
    assert.ok(!/owner_spec\s*===|ownerSpec\s*===|specialization\s*===/.test(code), `${f} never compares specializations`);
  }
});

test('E. channel ≠ specialization: two Digital players read different Scene 17 material', () => {
  assert.equal(PLAYERS.A.specialization, PLAYERS.F.specialization);
  const a = visibleEvidenceRows(s17Index('A'), S17_POLICY).map((e) => e.code);
  const f = visibleEvidenceRows(s17Index('F'), S17_POLICY).map((e) => e.code);
  assert.deepEqual(a, ['S17-TEST-A']);
  assert.deepEqual(f, ['S17-TEST-F']);
});

// ============================================================
// D/F — سياستان، نفس المستهلكين: محجوب (714) مقابل غائب (17)
// ============================================================
test('D. same consumer, two policies: Room 714 restricted is title-only; Scene 17 hidden is ABSENT', () => {
  const unreadable: EvidenceRow = { code: 'X-1', title: 'عنوان', kind: 'document', owner_spec: 'records', clock_label: null, body: null, readable: false };
  assert.equal(evidenceVisibility(unreadable, R714_POLICY), 'restricted');
  assert.equal(evidenceVisibility(unreadable, S17_POLICY), null);
  assert.deepEqual(visibleEvidenceRows([unreadable], R714_POLICY).length, 1);
  assert.deepEqual(visibleEvidenceRows([unreadable], S17_POLICY), []);
  assert.equal(evidenceVisibility({ ...unreadable, readable: undefined as unknown as boolean }, R714_POLICY), null, 'malformed fails closed');
});

for (const viewer of ['A', 'F'] as const) {
  const hidden = mineOf(otherOf(viewer));
  test(`F. Scene 17 non-holder (${viewer}) has ZERO representation of ${hidden.code} on every shared surface`, async () => {
    const rows = s17Index(viewer);
    const cat = s17Catalog(viewer);
    // evidence source (CaseWorkspace / TeamCard / scene)
    assert.deepEqual(leaks(visibleEvidenceRows(rows, S17_POLICY), hidden), [], 'source list');
    assert.equal(visibleEvidenceRows(rows, S17_POLICY).length, 1, 'no count leak');
    // board: no material, no title-only marker, no pin, no contribute, threads vanish
    assert.equal(resolveMaterial({ kind: 'evidence', code: hidden.code }, cat), null);
    assert.deepEqual(pinEligibility('evidence', hidden.code, cat), { status: 'unavailable' });
    assert.equal(canContribute(resolveMaterial({ kind: 'evidence', code: hidden.code }, cat)), false);
    const item = (id: string, code: string): BoardItem => ({ id, kind: 'material', ref: { kind: 'evidence', code }, x: 0.5, y: 0.5, authorId: 'x', createdAt: '' });
    const v = visibleBoard([item('h', hidden.code), { id: 'q', kind: 'question', text: 'سؤال', x: 0.5, y: 0.5, authorId: 'x', createdAt: '' }], [{ id: 't', kind: 'tentative', from: 'h', to: 'q', authorId: 'x' }], cat);
    assert.deepEqual(v.items.map((e) => e.item.id), ['q']);
    assert.deepEqual(v.threads, []);
    assert.deepEqual(leaks(v, hidden), []);
    // grounded search: no hit for its title, code or a keyword from its body
    const corpus = buildCorpus({ evidence: rows, objects: [], subjects: [], log: [] }, S17_POLICY);
    assert.deepEqual(leaks(corpus, hidden), []);
    for (const term of [hidden.code, hidden.title, 'كلمةسرية' + (hidden.channel === 'A' ? 'ألف' : 'فاء')]) assert.deepEqual(searchCorpus(corpus, [term]), [], term);
    // authorized knowledge + AI
    const k = buildAuthorizedKnowledge(knowledgeInput(viewer));
    assert.deepEqual(leaks(k.facts, hidden), []);
    assert.equal(knowledgeView(k).knows({ kind: 'evidence', id: hidden.code }), false);
    // joint: even if a ref somehow arrived, it resolves to nothing → masked
    const masked = contributionLabel({ contributor: 'x', mine: false, ref: { kind: 'evidence', id: hidden.code } }, cat, () => 'زميل-اختبار');
    assert.equal(masked.primary, 'مساهمة من زميل');
    assert.deepEqual(leaks(masked, hidden), []);
  });
}

test('F. Scene 17 holder works with their own private material: readable, reasoning-capable, contributable — but not pinnable (hidden policy)', () => {
  const cat = s17Catalog('A');
  const view = resolveMaterial({ kind: 'evidence', code: 'S17-TEST-A' }, cat)!;
  assert.ok(view && view.kind === 'evidence' && view.access === 'readable');
  assert.equal(canReason(view), true);
  assert.equal(canContribute(view), true, 'contribute privately without sharing/pinning');
  // the client cannot know the lane; the server decides at pin time and refuses a channel item (035)
  assert.deepEqual(pinEligibility('evidence', 'S17-TEST-A', cat), { status: 'server_decides', ref: { kind: 'evidence', code: 'S17-TEST-A' } });
  assert.match(readFileSync('sql/035_case_distribution_channels.sql', 'utf8'), /not exists \(select 1 from public\.case_evidence_channels ec where ec\.evidence_id = v_eid\)/, 'a channel item is never put on the shared board');
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  assert.match(ui, /موادك المقروءة/, 'the tray offers private contribution (and server-decided pinning)');
  // no Scene 17 view is ever "restricted" — hidden is not represented as restricted
  for (const p of ['A', 'F'] as const) {
    for (const e of S17_TEST) {
      const v = resolveMaterial({ kind: 'evidence', code: e.code }, s17Catalog(p));
      assert.ok(v === null || (v.kind === 'evidence' && v.access === 'readable'));
    }
  }
});

// ============================================================
// G — الربط المشترك على المشهد 17 (عقد مشترك، بلا SQL)
// ============================================================
test('G. joint connection across two Digital players with different channels: masked both ways, testable, one explicit RPC', async () => {
  // what the masked joint_proposals() view returns to each player (033: ref only for mine or team-visible)
  const view = (me: Player) => decodeJointProposals([{
    id: 'p1', created_by: 'user-a', status: 'open', meaning: null,
    contributions: [
      { contributor: 'user-a', mine: me === 'A', ref: me === 'A' ? { kind: 'evidence', id: 'S17-TEST-A' } : null },
      { contributor: 'user-f', mine: me === 'F', ref: me === 'F' ? { kind: 'evidence', id: 'S17-TEST-F' } : null },
    ],
  }])[0]!;
  const nameOf = (id: string) => (id === 'user-a' ? 'لاعب ألف' : 'لاعب فاء');
  for (const me of ['A', 'F'] as const) {
    const p = view(me);
    const labels = p.contributions.map((c) => contributionLabel(c, s17Catalog(me), nameOf));
    const mine = labels.find((l) => l.mine)!;
    const theirs = labels.find((l) => !l.mine)!;
    assert.equal(mine.primary, mineOf(me).title, 'I see my own material');
    assert.equal(theirs.primary, 'مساهمة من زميل', 'teammate private material is masked');
    assert.deepEqual(leaks(labels, mineOf(otherOf(me))), []);
    assert.equal(canTestJoint(p, PLAYERS[me].userId), true, 'both are participants; testing is explicit');
  }
  const calls: { fn: string; args: unknown }[] = [];
  const client: BoardClient = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }), rpc: (fn, args) => (calls.push({ fn, args }), Promise.resolve({ data: { status: 'not_established' }, error: null })) };
  assert.deepEqual(await createBoardStore(client, 's17-session').testJoint('p1'), { status: 'not_established' });
  assert.deepEqual(calls, [{ fn: 'test_joint_proposal', args: { p_proposal: 'p1' } }]);
});

test('G. the live 033 authorization is case-generic: contributor = auth.uid() + that contributor’s readability, nothing else', () => {
  const s33 = readFileSync('sql/033_joint_connections.sql', 'utf8').replace(/--[^\n]*/g, '');
  const body = (fn: string) => s33.slice(s33.indexOf(`function public.${fn}(`), s33.indexOf('$$;', s33.indexOf(`function public.${fn}(`)));
  assert.match(body('contribute_to_joint'), /public\._connection_node_known\(v_p\.session_id, v_kind, v_id\)/);
  assert.match(body('contribute_to_joint'), /auth\.uid\(\)\)/);
  for (const fn of ['contribute_to_joint', 'test_joint_proposal', 'joint_proposals', '_connection_match']) {
    assert.ok(!/specializ|channel|'room-714'|'scene-17'|title/i.test(body(fn)), `${fn} has no case- or distribution-specific logic`);
  }
  // readability itself is 027's: the caller's evidence_index row with readable = true (case distribution decides)
  const s27 = readFileSync('sql/027_validated_connections.sql', 'utf8');
  assert.match(s27, /from public\.evidence_index\(p_session\) e\s+where upper\(e\.code\) = p_id and e\.readable/);
});

// ============================================================
// H — المعرفة المصرّحة + اختبار الفرضية + الموجّه
// ============================================================
function knowledgeInput(p: Player, over: Partial<AuthorizedInput> = {}): AuthorizedInput {
  return { caseId: 'scene-17', restrictedEvidence: S17_POLICY, evidence: s17Index(p), objects: [], subjects: [], log: [], validatedConnections: [], interrogationLayers: [], tools: [], challengeCodes: [], connectionsEnabled: true, ...over };
}

test('H. AI: a holder may reason from their own channel material; the non-holder’s model never receives it — even if attached', async () => {
  for (const me of ['A', 'F'] as const) {
    const k = buildAuthorizedKnowledge(knowledgeInput(me));
    assert.ok(k.facts.some((f) => f.id === `evidence:${mineOf(me).code}` && f.visibility === 'readable'));
    const prompts: ChatMessage[][] = [];
    const deps: StressTestDeps = {
      getUserId: async () => PLAYERS[me].userId,
      isMember: async () => true,
      loadKnowledge: async () => k,
      complete: async (m) => (prompts.push(m), JSON.stringify({ supporting: [], contradicting: [], unsupportedAssumptions: [], missingEvidenceQuestions: ['؟'], timelineIssues: [] })),
    };
    const other = mineOf(otherOf(me));
    // a teammate's joint contribution does NOT make its body AI-readable for me
    await runStressTest({ sessionId: '11111111-2222-3333-4444-555555555555', hypothesis: 'فرضية اختبار', attached: [`evidence:${other.code}`] }, deps);
    const sent = prompts.map((p) => p.map((m) => m.content).join('\n')).join('\n');
    assert.deepEqual(leaks(sent, other), [], `prompt for ${me}`);
  }
});

test('H/I. knowledge loading takes the policy and entities from the SESSION’s case — never a default case', async () => {
  const seen: string[] = [];
  const source = (caseId: string): AuthorizedKnowledgeSource => ({
    isMember: async () => true,
    caseIdOf: async () => caseId,
    restrictedEvidence: (c) => (seen.push(`policy:${c}`), getCaseContract(c)!.restrictedEvidence),
    evidenceIndex: async () => s17Index('A'),
    objectIndex: async () => [],
    subjects: async () => [],
    interrogationLog: async () => [],
    validatedConnections: async () => [],
    interrogationLayers: async () => [],
    entities: (c) => (seen.push(`entities:${c}`), null),
    tools: async () => [],
    challengeCodes: async () => [],
  });
  const s17 = await loadAuthorizedKnowledge('sess', source('scene-17'), { connectionsEnabled: true });
  assert.deepEqual(seen, ['policy:scene-17', 'entities:scene-17']);
  assert.ok(!s17.facts.some((f) => f.id === 'evidence:S17-TEST-F'), 'hidden under the scene-17 policy');
  seen.length = 0;
  const r714 = await loadAuthorizedKnowledge('sess', source('room-714'), { connectionsEnabled: true });
  assert.deepEqual(seen, ['policy:room-714', 'entities:room-714']);
  assert.ok(r714.facts.some((f) => f.id === 'evidence:S17-TEST-F' && f.visibility === 'restricted'), 'same rows under the title policy');
});

test('H. intent router tools are data-driven per case (no Room 714 tool appears unless the case authors it)', () => {
  const tools = readFileSync('src/lib/inquiry/tools.ts', 'utf8');
  assert.match(tools, /export function allowedTools\(catalog: ToolCatalog\): InquiryTool\[\] \{\s*const out: InquiryTool\[\] = \['CASE_SEARCH'\];\s*for \(const h of catalog\.hosts\)/);
});

// ============================================================
// I — مجموعة التصادم: معرّفات متطابقة عبر القضيتين
// ============================================================
const DUP_EV = (title: string, readable: boolean) =>
  ({ code: 'DUP-01', title, kind: 'document', owner_spec: 'records', clock_label: null, body: readable ? `نص ${title}` : null, has_media: false, readable, unlocked_at: '' }) as EvidenceItem;
const DUP_OBJ = (title: string, category = 'object'): InvestigationObject =>
  ({ code: 'DUP_OBJ', category, parent_code: null, title, description: '', state: 'DISCOVERED', discovered: true, is_shared: true, processing: false, actions: [] }) as InvestigationObject;

test('I1–I4. identical evidence / object / location codes resolve only against the viewer’s own case data', () => {
  const room: ViewerCatalog = { caseId: 'room-714', policy: R714_POLICY, evidence: [DUP_EV('غرفة', false)], objects: [DUP_OBJ('عنصر الغرفة'), { ...DUP_OBJ('مكان الغرفة', 'location'), code: 'DUP_LOC' }] };
  const scene: ViewerCatalog = { caseId: 'scene-17', policy: S17_POLICY, evidence: [DUP_EV('مشهد', false)], objects: [DUP_OBJ('عنصر المشهد')] };
  assert.equal(resolveMaterial({ kind: 'evidence', code: 'DUP-01' }, room)?.title, 'غرفة', 'title-only in Room 714');
  assert.equal(resolveMaterial({ kind: 'evidence', code: 'DUP-01' }, scene), null, 'absent in Scene 17 — same code, other case, other policy');
  assert.equal(resolveMaterial({ kind: 'object', code: 'DUP_OBJ' }, room)?.title, 'عنصر الغرفة');
  assert.equal(resolveMaterial({ kind: 'object', code: 'DUP_OBJ' }, scene)?.title, 'عنصر المشهد');
  assert.equal(resolveMaterial({ kind: 'location', code: 'DUP_LOC' }, scene), null);
  // I3: same entity id, per-case authored descriptors
  const roomEntity: AuthoredEntity = { id: 'DUP_PERSON', descriptors: [{ id: 'd1', label: 'وصف غرفة', level: 1, earnedBy: [{ kind: 'evidence', code: 'DUP-01' }] }] };
  const sceneEntity: AuthoredEntity = { id: 'DUP_PERSON', descriptors: [{ id: 'd1', label: 'وصف مشهد', level: 1, earnedBy: [{ kind: 'evidence', code: 'OTHER' }] }] };
  const earned = earnedFromAuthorized({ readableEvidence: ['DUP-01'], visibleObjectStates: [], teamConnections: [], teamLayers: [] });
  assert.equal(entityViewFor(roomEntity, earned, () => 'h')?.label, 'وصف غرفة');
  assert.equal(entityViewFor(sceneEntity, earned, () => 'h'), null, 'I13: progressive identity is per case — no cross-case earning');
});

test('I5–I6. authored connection rules are per case: the SQL matcher reads the session’s case only; registry rule sets never mix', () => {
  const r = getCaseServerModule('room-714')!.connectionRules;
  const s = getCaseServerModule('scene-17')!.connectionRules;
  assert.equal(r.caseId, 'room-714');
  assert.equal(s.caseId, 'scene-17');
  const rIds = new Set(r.rules.map((x) => x.id));
  assert.ok(s.rules.every((x) => !rIds.has(x.id)));
  const s33 = readFileSync('sql/033_joint_connections.sql', 'utf8');
  assert.match(s33, /where r\.case_id = p_case and r\.status = 'approved' and r\.team_safe/);
  assert.match(s33, /select s\.case_id into v_case from public\.sessions s where s\.id = p_session;/);
  assert.match(s33, /select s\.case_id into v_case from public\.sessions s where s\.id = v_p\.session_id;/);
  assert.equal(getCaseServerModule('ghost'), null);
  assert.equal(getCaseServerModule('__proto__'), null);
});

test('I7–I9. presentation, scene media and case-file profiles never cross cases', () => {
  const room = getCasePresentation('room-714');
  const scene = getCasePresentation('scene-17');
  assert.ok(room.objectProfiles.PASSPORT, 'Room 714 authored its own profile');
  assert.equal(scene.objectProfiles.PASSPORT, undefined, 'I9: no Room 714 case-file profile in Scene 17');
  assert.deepEqual(room.boardLanes, []);
  assert.deepEqual(scene.boardLanes.map((l) => l.id), ['written', 'instructed', 'happened']);
  assert.deepEqual(getCasePresentation('ghost').boardLanes, []);
  assert.ok(sceneImagePath('room-714', 'ROOM_714'));
  assert.equal(sceneImagePath('scene-17', 'ROOM_714'), null, 'I8');
  const visible = [{ code: 'PASSPORT', parent_code: null, discovered: true, state: 'DISCOVERED' }] as unknown as Parameters<typeof resolveObjectView>[3];
  assert.equal(resolveObjectView('scene-17', 'PASSPORT', 'passport', visible), null, 'I8: object view is case-keyed');
  for (const label of [...scene.boardLanes.map((l) => l.label), JSON.stringify(scene)]) {
    assert.ok(!/غرفة 714|فندق|نزيل|رامي/.test(label), 'no Room 714 labels in Scene 17 presentation');
  }
});

test('I10–I12. search, knowledge and joint/realtime read only the caller’s session (and therefore its case)', () => {
  const inquiry = readFileSync('src/app/api/case-inquiry/route.ts', 'utf8');
  assert.match(inquiry, /getCaseContract\(session\?\.case_id as string \| undefined\)\?\.restrictedEvidence \?\? 'hidden'/);
  const hyp = readFileSync('src/app/api/hypothesis-test/route.ts', 'utf8');
  assert.match(hyp, /restrictedEvidence: \(caseId\) => getCaseContract\(caseId\)\?\.restrictedEvidence \?\? 'hidden'/);
  const store = readFileSync('src/app/case/[code]/board/boardStore.ts', 'utf8');
  assert.match(store, /client\.rpc\('joint_proposals', \{ p_session: sessionId \}\)/);
  const ui = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  assert.match(ui, /table: 'session_joint_proposals', filter \}/);
  assert.match(ui, /const filter = `session_id=eq\.\$\{sessionId\}`;/);
});

// ============================================================
// J — تدقيق الاشتراكات اللحظية
// ============================================================
test('J. every realtime subscription is session-filtered; only board DELETEs are unfiltered and matched by the board’s own ids', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : /\.(ts|tsx)$/.test(n) ? [join(d, n)] : []));
  let subs = 0;
  for (const f of walk('src/app')) {
    const s = readFileSync(f, 'utf8');
    const blocks = s.split("'postgres_changes'").slice(1).concat(s.split('"postgres_changes"').slice(1));
    for (const b of blocks) {
      const head = b.slice(0, 260);
      subs += 1;
      const filtered = /filter(:|\s*\})|filter,/.test(head.slice(0, head.indexOf('}') + 2));
      const deleteById = /event: 'DELETE'/.test(head) && /onDelete|pinIdsRef/.test(head);
      assert.ok(filtered || deleteById, `${f}: unfiltered subscription → ${head.slice(0, 120)}`);
    }
    assert.ok(!/session_joint_contributions/.test(s), `${f} subscribes to raw contributions`);
  }
  assert.ok(subs >= 15, `found ${subs} subscriptions`);
});

// ============================================================
// إصلاح هذا التمرير: سياسة القضية من مصدر الأدلة لكل سطح عميل
// ============================================================
test('fix: every client surface that reads evidence_index applies the case policy at the source', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : /\.(ts|tsx)$/.test(n) ? [join(d, n)] : []));
  const readers = walk('src/app/case').filter((f) => /rpc\(\s*['"]evidence_index['"]/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(readers.map((f) => f.replace(/\\/g, '/')).sort(), [
    'src/app/case/[code]/CaseWorkspace.tsx',
    'src/app/case/[code]/TeamCard.tsx',
    'src/app/case/[code]/investigation/InvestigationEngine.tsx',
  ]);
  for (const f of readers) assert.match(readFileSync(f, 'utf8'), /visibleEvidenceRows\(/, f);
  const engine = readFileSync('src/app/case/[code]/investigation/InvestigationEngine.tsx', 'utf8');
  assert.match(engine, /if \(!item\) return flashError\('هذا المصدر لم يعد متاحاً لك\.'\);/, 'a hidden item answers exactly like a missing one');
});

test('Room 714 behaviour is preserved by the fix: title-only rows still reach the UI', () => {
  const rows = [DUP_EV('مقروء', true), { ...DUP_EV('محجوب', false), code: 'DUP-02' }];
  assert.deepEqual(visibleEvidenceRows(rows, R714_POLICY).map((e) => e.code), ['DUP-01', 'DUP-02']);
  assert.deepEqual(visibleEvidenceRows(rows, S17_POLICY).map((e) => e.code), ['DUP-01']);
  const cat: ViewerCatalog = { caseId: 'room-714', policy: R714_POLICY, evidence: rows, objects: [] as ObjectRow[] as unknown as InvestigationObject[] };
  assert.equal(resolveMaterial({ kind: 'evidence', code: 'DUP-02' }, cat)?.kind, 'evidence');
  assert.equal(pinEligibility('evidence', 'DUP-02', cat).status, 'eligible', 'Room 714: title-only remains pinnable (team knows it exists)');
});
