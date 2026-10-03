// ============================================================
// tests/ai/foundation.test.ts
// عقد الذكاء الاصطناعي: وجود الدليل = نفس سطح اللاعب بالضبط (ونفس قاعدة
// البحث المؤسَّس)، المخفي غائب كلياً، اختبار الفرضية لا يستشهد إلا بما
// يملكه اللاعب، والأشخاص التدريجيون لا يتسرّب تعريفهم من زميل.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthorizedKnowledge,
  knowledgeView,
  loadAuthorizedKnowledge,
  type AuthorizedInput,
  type AuthorizedKnowledge,
  type AuthorizedKnowledgeSource,
} from '../../src/lib/ai/knowledge';
import { buildStressTestContext, validateStressTestResult, MAX_HYPOTHESIS_CHARS } from '../../src/lib/ai/hypothesis';
import { buildCorpus, type EvidenceRow, type ObjectRow } from '../../src/lib/inquiry/search';
import type { RestrictedEvidencePolicy } from '../../src/lib/evidenceVisibility';
import { getCaseContract } from '../../src/cases/registry';
import { entityViewFor, renderEntityRefs, UNKNOWN_ENTITY_LABEL, type AuthoredEntity } from '../../src/lib/entities/progressive';
import type { Specialization } from '../../src/types/database';

// ------------------------------------------------------------
// محاكي evidence_index الحي (sql/017): صفوف للأدلة المفتوحة بالجلسة فقط؛
// لغير حامل التخصص: الكود، العنوان، النوع، التخصص، الوقت — بلا نص.
// ------------------------------------------------------------
interface WorldEvidence {
  code: string;
  title: string;
  owner: Specialization;
  body: string;
  clock: string | null;
  unlocked: boolean;
}
const WORLD: WorldEvidence[] = [
  { code: 'F-06', title: 'تقرير جنائي مقروء', owner: 'forensics', body: 'نص جنائي', clock: '00:10', unlocked: true },
  { code: 'D-03', title: 'سجل رقمي لتخصص آخر', owner: 'digital', body: 'نص رقمي سري', clock: '00:20', unlocked: true },
  { code: 'R-99', title: 'دليل لم يُفتح بعد', owner: 'forensics', body: 'نص لم يُفتح', clock: '01:00', unlocked: false },
];
function evidenceIndexFor(specs: Specialization[], world = WORLD): EvidenceRow[] {
  return world
    .filter((e) => e.unlocked)
    .map((e) => {
      const readable = specs.includes(e.owner);
      return { code: e.code, title: e.title, kind: 'document', owner_spec: e.owner, clock_label: e.clock, body: readable ? e.body : null, readable };
    });
}

const obj = (code: string, over: Partial<ObjectRow> = {}): ObjectRow => ({
  code,
  category: 'object',
  parent_code: 'ROOM',
  title: `عنوان ${code}`,
  description: `وصف ${code}`,
  state: 'DISCOVERED',
  discovered: true,
  is_shared: true,
  ...over,
});

const base = (over: Partial<AuthorizedInput> = {}): AuthorizedInput => ({
  caseId: 'room-714',
  restrictedEvidence: 'title',
  evidence: evidenceIndexFor(['forensics']),
  objects: [obj('ROOM', { category: 'location', parent_code: null, state: 'KNOWN' })],
  subjects: [{ code: 'KAREEM', name: 'كريم', role: null }],
  log: [
    { id: 'l1', character_code: 'KAREEM', speaker: 'character', content: 'ما شفت شي' },
    { id: 'l2', character_code: 'KAREEM', speaker: 'player', content: 'سؤال اللاعب' },
  ],
  validatedConnections: [],
  interrogationLayers: [],
  tools: ['RECORDS'],
  challengeCodes: ['GUEST_FILE_LOOKUP'],
  connectionsEnabled: false,
  ...over,
});

const json = (x: unknown) => JSON.stringify(x);

// ============================================================
// (A) وجود الدليل
// ============================================================

test('fully hidden evidence (never unlocked) is absent: no code, no title, no count', () => {
  const k = buildAuthorizedKnowledge(base());
  for (const leak of ['R-99', 'دليل لم يُفتح بعد', 'نص لم يُفتح']) assert.ok(!json(k).includes(leak), leak);
  assert.equal(k.facts.filter((f) => f.kind === 'evidence').length, 2, 'only the two unlocked items exist');
});

test('restricted evidence follows the player-visible surface exactly — and never its body', () => {
  const k = buildAuthorizedKnowledge(base());
  const d = k.facts.find((f) => f.id === 'evidence:D-03')!;
  assert.deepEqual(
    { visibility: d.visibility, title: d.title, text: d.text, clock: d.clock, ownerSpec: d.ownerSpec },
    { visibility: 'restricted', title: 'سجل رقمي لتخصص آخر', text: null, clock: '00:20', ownerSpec: 'digital' },
  );
  assert.ok(!json(k).includes('نص رقمي سري'));
  const f = k.facts.find((x) => x.id === 'evidence:F-06')!;
  assert.equal(f.visibility, 'readable');
  assert.equal(f.text, 'نص جنائي');
});

test('a case whose policy is "hidden" (private channels) omits teammate-private evidence entirely', () => {
  // حتى لو وصلت صفوف غير مقروءة (قناة زميل)، سياسة القضية تمحوها بلا أثر.
  const k = buildAuthorizedKnowledge(base({ caseId: 'scene-17', restrictedEvidence: 'hidden' }));
  assert.deepEqual(k.facts.filter((f) => f.kind === 'evidence').map((f) => f.id), ['evidence:F-06']);
  for (const leak of ['D-03', 'سجل رقمي لتخصص آخر', 'نص رقمي سري']) assert.ok(!json(k).includes(leak), leak);
  // سياسة مفقودة/مشوّهة = مخفي (مغلق عند الشك)
  const k2 = buildAuthorizedKnowledge(base({ restrictedEvidence: 'whatever' as RestrictedEvidencePolicy }));
  assert.ok(!json(k2).includes('D-03'));
});

test('case contracts declare the policy explicitly (Room 714 title, Scene 17 hidden)', () => {
  assert.equal(getCaseContract('room-714')!.restrictedEvidence, 'title');
  assert.equal(getCaseContract('scene-17')!.restrictedEvidence, 'hidden');
});

test('teammate-private and uninspected objects are absent', () => {
  const k = buildAuthorizedKnowledge(
    base({
      objects: [
        obj('GLASS_CUP'),
        obj('VICTIM_ITEMS', { state: 'HIDDEN', is_shared: false }),
        obj('LAPTOP', { state: 'UNKNOWN', discovered: false, is_shared: false }),
      ],
    }),
  );
  assert.ok(k.facts.some((f) => f.id === 'object:GLASS_CUP'));
  for (const leak of ['VICTIM_ITEMS', 'LAPTOP', 'عنوان VICTIM_ITEMS', 'وصف LAPTOP']) assert.ok(!json(k).includes(leak), leak);
});

test('Grounded Search and AuthorizedKnowledge agree on existence and access, for both policies', () => {
  for (const policy of ['title', 'hidden'] as const) {
    for (const specs of [['forensics'], ['digital'], ['field'], ['forensics', 'digital']] as Specialization[][]) {
      const rows = evidenceIndexFor(specs);
      const corpus = buildCorpus({ evidence: rows, objects: [], subjects: [], log: [] }, policy);
      const k = buildAuthorizedKnowledge(base({ evidence: rows, restrictedEvidence: policy }));
      const fromSearch = corpus
        .filter((d) => d.ref.type === 'evidence')
        .map((d) => `${d.ref.code}:${d.access === 'full' ? 'readable' : 'restricted'}`)
        .sort();
      const fromAi = k.facts
        .filter((f) => f.kind === 'evidence')
        .map((f) => `${f.id.slice('evidence:'.length)}:${f.visibility}`)
        .sort();
      assert.deepEqual(fromAi, fromSearch, `${policy} ${specs.join('+')}`);
    }
  }
});

test('AI-facing context (knowledge + stress context) never carries hidden codes/titles or rule ids', () => {
  const k = buildAuthorizedKnowledge(
    base({ validatedConnections: [{ ruleId: 'S17_SECRET_RULE_NAME', meaning: 'معنى الرابط' }] }),
  );
  const ctx = buildStressTestContext(k, 'فرضية');
  if (!ctx.ok) throw new Error('ctx');
  for (const blob of [json(k), json(ctx.context)]) {
    for (const leak of ['R-99', 'دليل لم يُفتح بعد', 'نص رقمي سري', 'S17_SECRET_RULE_NAME']) assert.ok(!blob.includes(leak), leak);
  }
  assert.ok(json(k).includes('connection:1'), 'connections are cited by ordinal');
  // restricted يظهر كعنوان غير قابل للاستشهاد فقط
  assert.ok(!ctx.context.facts.some((f) => f.id === 'evidence:D-03'));
  assert.deepEqual(ctx.context.titleOnly, ['سجل رقمي لتخصص آخر']);
});

test('knowledge view for connections: only content I hold counts as known', () => {
  const v = knowledgeView(buildAuthorizedKnowledge(base({ objects: [obj('GLASS_CUP'), obj('VICTIM_ITEMS', { state: 'HIDDEN', is_shared: false })] })));
  assert.equal(v.knows({ kind: 'evidence', id: 'F-06' }), true);
  assert.equal(v.knows({ kind: 'evidence', id: 'D-03' }), false, 'restricted (title only) is not knowledge');
  assert.equal(v.knows({ kind: 'evidence', id: 'R-99' }), false);
  assert.equal(v.knows({ kind: 'object', id: 'GLASS_CUP' }), true);
  assert.equal(v.knows({ kind: 'object', id: 'VICTIM_ITEMS' }), false);
  assert.equal(v.knows({ kind: 'claim', id: 'ANY' }), false, 'unmodelled kinds fail closed');
});

test('loading knowledge requires membership first — no reads for a non-member', async () => {
  let reads = 0;
  const r = <T,>(v: T) => async () => {
    reads++;
    return v;
  };
  const src: AuthorizedKnowledgeSource = {
    isMember: async () => false,
    caseIdOf: r('room-714'),
    restrictedEvidence: () => 'title',
    evidenceIndex: r([]),
    objectIndex: r([]),
    subjects: r([]),
    interrogationLog: r([]),
    validatedConnections: r([]),
    interrogationLayers: r([]),
    entities: () => null,
    tools: r([]),
    challengeCodes: r([]),
  };
  await assert.rejects(loadAuthorizedKnowledge('s', src, { connectionsEnabled: false }), /NOT_A_MEMBER/);
  assert.equal(reads, 0);
});

// ============================================================
// اختبار الفرضية
// ============================================================

test('stress-test context: readable facts only; hypothesis bounded', () => {
  const k = buildAuthorizedKnowledge(base());
  const r = buildStressTestContext(k, '  كريم أخذ رامي إلى M1   بعد منتصف الليل ');
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.context.hypothesis, 'كريم أخذ رامي إلى M1 بعد منتصف الليل');
  assert.ok(r.context.facts.every((f) => f.visibility === 'readable'));
  assert.deepEqual(buildStressTestContext(k, '   '), { ok: false, reason: 'EMPTY' });
  assert.deepEqual(buildStressTestContext(k, 'x'.repeat(MAX_HYPOTHESIS_CHARS + 1)), { ok: false, reason: 'TOO_LONG' });
});

test('stress-test output: only citations of context facts; no verdict/solution fields', () => {
  const k = buildAuthorizedKnowledge(base({ objects: [obj('VICTIM_ITEMS', { state: 'HIDDEN', is_shared: false })] }));
  const r = buildStressTestContext(k, 'فرضية');
  if (!r.ok) throw new Error('ctx');
  const ok = {
    supporting: [{ factId: 'evidence:F-06', note: 'يدعم التوقيت' }],
    contradicting: [],
    unsupportedAssumptions: ['أن الباب فُتح من الداخل'],
    missingEvidenceQuestions: ['من استخدم بطاقة الخدمات؟'],
    timelineIssues: [],
  };
  assert.equal(validateStressTestResult(ok, r.context).ok, true);
  const bad = (x: unknown) => validateStressTestResult(x, r.context);
  assert.deepEqual(bad({ ...ok, verdict: 'correct' }), { ok: false, reason: 'UNKNOWN_FIELD' });
  assert.deepEqual(bad({ ...ok, solution: 'x' }), { ok: false, reason: 'UNKNOWN_FIELD' });
  for (const factId of ['evidence:D-03', 'evidence:R-99', 'object:VICTIM_ITEMS', 'evidence:HIDDEN-99']) {
    assert.deepEqual(bad({ ...ok, contradicting: [{ factId, note: 'x' }] }), { ok: false, reason: 'UNCITED_FACT' }, factId);
  }
  assert.deepEqual(bad({ ...ok, supporting: [{ factId: 'evidence:F-06', note: 'x', confidence: 0.9 }] }), { ok: false, reason: 'UNKNOWN_FIELD' });
  assert.deepEqual(bad({ ...ok, timelineIssues: 'none' }), { ok: false, reason: 'BAD_SHAPE' });
  assert.deepEqual(bad('correct'), { ok: false, reason: 'NOT_OBJECT' });
});

// ============================================================
// (B) الأشخاص التدريجيون — المعرفة الخاصة تبقى خاصة
// ============================================================

// كيان اختباري (ليس محتوى قضية). الأوصاف تُكسب من حقائق لعب قائمة.
const MAN: AuthoredEntity = {
  id: 'ENTITY_X',
  descriptors: [
    { id: 'd1', label: 'رجل مجهول', level: 1, earnedBy: [{ kind: 'object_state', code: 'CORRIDOR_CAM', state: 'DISCOVERED' }] },
    { id: 'd2', label: 'رجل بشعر رمادي', level: 2, earnedBy: [{ kind: 'object_state', code: 'FRAME_CLOSEUP', state: 'DISCOVERED' }] },
    { id: 'd3', label: 'طبيب محتمل', level: 3, earnedBy: [{ kind: 'connection', ruleId: 'R_DOCTOR' }] },
    { id: 'd4', label: 'د. فلان', level: 4, identity: true, earnedBy: [{ kind: 'evidence', code: 'F-06' }] },
    { id: 'd5', label: 'لا يُكتسب', level: 9, earnedBy: [] },
  ],
};
const ENTITIES = { authored: [MAN], handleOf: (id: string) => `h_${id.length}_opaque` };
const A_SPECS: Specialization[] = ['forensics'];
const B_SPECS: Specialization[] = ['digital'];

/** معرفة كل لاعب من صفوفه هو فقط — كما ترجعها RPCs بجلسته. */
function knowledgeFor(specs: Specialization[], objects: ObjectRow[], over: Partial<AuthorizedInput> = {}): AuthorizedKnowledge {
  return buildAuthorizedKnowledge(base({ evidence: evidenceIndexFor(specs), objects, entities: ENTITIES, ...over }));
}
const labelOf = (k: AuthorizedKnowledge) => k.entities[0]?.label ?? null;

const SHARED_CAM = obj('CORRIDOR_CAM');
// A فحص اللقطة القريبة سراً: عند A مكتشفة له، وعند B محجوبة (HIDDEN).
const CLOSEUP_A_PRIVATE_FOR_A = obj('FRAME_CLOSEUP', { is_shared: false });
const CLOSEUP_A_PRIVATE_FOR_B = obj('FRAME_CLOSEUP', { is_shared: false, state: 'HIDDEN' });
const CLOSEUP_SHARED = obj('FRAME_CLOSEUP', { is_shared: true });

test('1. A privately knows "grey-haired man"; B stays at "unknown man"', () => {
  const a = knowledgeFor(A_SPECS.filter((s) => s !== 'forensics'), [SHARED_CAM, CLOSEUP_A_PRIVATE_FOR_A]);
  const b = knowledgeFor(B_SPECS, [SHARED_CAM, CLOSEUP_A_PRIVATE_FOR_B]);
  assert.equal(labelOf(a), 'رجل بشعر رمادي');
  assert.equal(labelOf(b), 'رجل مجهول');
});

test('2. once A shares the discovery, B may advance to the earned descriptor', () => {
  const b = knowledgeFor(B_SPECS, [SHARED_CAM, CLOSEUP_SHARED]);
  assert.equal(labelOf(b), 'رجل بشعر رمادي');
});

test('3. full identity known privately by A (A\'s own readable evidence) never reaches B', () => {
  const a = knowledgeFor(A_SPECS, [SHARED_CAM, CLOSEUP_A_PRIVATE_FOR_A]);
  // B يرى F-06 "محجوباً" بعنوانه (قاعدة المنتج) — العنوان لا يكسب أي وصف.
  const b = knowledgeFor(B_SPECS, [SHARED_CAM, CLOSEUP_A_PRIVATE_FOR_B]);
  assert.equal(labelOf(a), 'د. فلان');
  assert.equal(a.entities[0]!.identified, true);
  assert.equal(labelOf(b), 'رجل مجهول');
  assert.equal(b.entities[0]!.identified, false);
  assert.ok(!json(b).includes('د. فلان'));
});

test('4. B\'s AI context cannot infer A\'s stronger identity (knowledge, stress context, entity refs)', () => {
  const b = knowledgeFor(B_SPECS, [SHARED_CAM, CLOSEUP_A_PRIVATE_FOR_B]);
  const ctx = buildStressTestContext(b, 'من هو الرجل؟');
  if (!ctx.ok) throw new Error('ctx');
  for (const blob of [json(b), json(ctx.context)]) {
    for (const leak of ['رجل بشعر رمادي', 'طبيب محتمل', 'د. فلان', 'ENTITY_X', 'FRAME_CLOSEUP']) assert.ok(!blob.includes(leak), leak);
  }
  // ولا مقبض مختلف/إضافي يميّز "يعرفه زميل أكثر"
  assert.equal(b.entities.length, 1);
  assert.equal(b.entities[0]!.handle, ENTITIES.handleOf('ENTITY_X'));
});

test('team-visible authored events (validated connection) can grant a descriptor to everyone', () => {
  const b = knowledgeFor(B_SPECS, [SHARED_CAM], { validatedConnections: [{ ruleId: 'R_DOCTOR', meaning: 'm' }] });
  assert.equal(labelOf(b), 'طبيب محتمل');
  assert.ok(!json(b).includes('R_DOCTOR'), 'rule id used server-side only');
});

test('an entity with nothing earned is not even "unknown man"; empty earnedBy never unlocks', () => {
  assert.equal(knowledgeFor(B_SPECS, []).entities.length, 0);
  assert.equal(entityViewFor(MAN, new Set(), ENTITIES.handleOf), null);
  const all = knowledgeFor(A_SPECS, [SHARED_CAM, CLOSEUP_SHARED], { validatedConnections: [{ ruleId: 'R_DOCTOR', meaning: 'm' }] });
  assert.ok(!json(all).includes('لا يُكتسب'));
});

test('evidence text referencing an entity renders at the reader\'s level, never the name', () => {
  const text = 'شوهد {{entity:ENTITY_X}} قرب المصعد. {{entity:NOBODY}} غادر.';
  const entities = { ENTITY_X: MAN };
  assert.equal(renderEntityRefs(text, entities, new Set()), `شوهد ${UNKNOWN_ENTITY_LABEL} قرب المصعد. ${UNKNOWN_ENTITY_LABEL} غادر.`);
  assert.equal(
    renderEntityRefs(text, entities, new Set(['object:FRAME_CLOSEUP@DISCOVERED'])),
    `شوهد رجل بشعر رمادي قرب المصعد. ${UNKNOWN_ENTITY_LABEL} غادر.`,
  );
  assert.equal(renderEntityRefs('{{entity:constructor}}', entities, new Set()), UNKNOWN_ENTITY_LABEL);
});
