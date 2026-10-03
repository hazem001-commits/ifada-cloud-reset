// ============================================================
// tests/connections/validate.test.ts
// مدقق الروابط: حتمي، مكتوب، يحفظ الخصوصية، ولا يشرح سبب الخطأ.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_NODES, newlySatisfiedConditions, ruleSetProblems, toPlayerResponse, validateProposal } from '../../src/lib/connections/validate';
import type { ConnectionRuleSet, KnowledgeView, NodeRef } from '../../src/lib/connections/types';
import { SCENE_17_CONNECTIONS } from '../../src/server/cases/scene-17/connections';
import { getCaseServerModule } from '../../src/server/cases/registry';
import { readFileSync } from 'node:fs';

const ev = (id: string): NodeRef => ({ kind: 'evidence', id });
const knows = (...ids: string[]): KnowledgeView => {
  const s = new Set(ids);
  return { knows: (n) => s.has(`${n.kind}:${n.id}`) };
};

// مجموعة قواعد اختبارية (ليست محتوى قضية).
const RULES: ConnectionRuleSet = {
  caseId: 'test-case',
  status: 'approved',
  rules: [
    { id: 'R_PAIR', requires: [ev('X1'), ev('X2')], relation: 'contradicts', meaning: 'm1', effects: [{ kind: 'mark_contradiction', id: 'C1' }] },
    { id: 'R_ROUTE', requires: [ev('Y1'), { kind: 'event', id: 'DOOR_0012' }, { kind: 'location', id: 'M1' }], meaning: 'm2', effects: [] },
    { id: 'R_LOOSE', requires: [ev('Z1'), ev('Z2')], allowExtra: 1, meaning: 'm3', effects: [{ kind: 'unlock_evidence', evidence: 'Z9' }] },
  ],
  conditions: [
    { id: 'C_ALL', all: ['R_PAIR', 'R_LOOSE'], effects: [{ kind: 'unlock_chapter', chapter: '2' }] },
    { id: 'C_ANY', anyOf: { ids: ['R_PAIR', 'R_ROUTE', 'R_LOOSE'], min: 2 }, effects: [{ kind: 'unlock_chapter', chapter: 'x' }] },
  ],
};
const ALL_KNOWN = knows('evidence:X1', 'evidence:X2', 'evidence:Z1', 'evidence:Z2', 'evidence:Z3', 'evidence:Z4', 'evidence:W1');

test('an authored connection validates deterministically, order-independent', () => {
  const a = validateProposal({ nodes: [ev('X1'), ev('X2')] }, RULES, ALL_KNOWN);
  const b = validateProposal({ nodes: [ev('X2'), ev('X1')], relation: 'contradicts' }, RULES, ALL_KNOWN);
  assert.deepEqual(a, { status: 'validated', ruleId: 'R_PAIR', meaning: 'm1', effects: [{ kind: 'mark_contradiction', id: 'C1' }] });
  assert.deepEqual(a, b);
});

test('wrong, unknown-to-me, nonexistent and draft are indistinguishable (no oracle, no reason)', () => {
  const NOT = { status: 'not_established' };
  // خاطئ
  assert.deepEqual(validateProposal({ nodes: [ev('X1'), ev('W1')] }, RULES, ALL_KNOWN), NOT);
  // عقدة لا أملكها (دليل زميل خاص) — حتى لو كان الرابط صحيحاً فعلاً
  assert.deepEqual(validateProposal({ nodes: [ev('X1'), ev('X2')] }, RULES, knows('evidence:X1')), NOT);
  // عقدة غير موجودة أصلاً
  assert.deepEqual(validateProposal({ nodes: [ev('X1'), ev('GHOST')] }, RULES, ALL_KNOWN), NOT);
  // علاقة معاكسة لما هو مكتوب
  assert.deepEqual(validateProposal({ nodes: [ev('X1'), ev('X2')], relation: 'supports' }, RULES, ALL_KNOWN), NOT);
  // قواعد مسودة
  assert.deepEqual(validateProposal({ nodes: [ev('X1'), ev('X2')] }, { ...RULES, status: 'draft' }, ALL_KNOWN), NOT);
  // لا يوجد أي حقل سبب/تلميح بالرد
  const r = validateProposal({ nodes: [ev('X1'), ev('W1')] }, RULES, ALL_KNOWN);
  assert.deepEqual(Object.keys(r), ['status']);
});

test('privacy is checked before matching: an unauthorized node never reaches the rules', () => {
  let touched = false;
  const spy: ConnectionRuleSet = {
    ...RULES,
    get rules() {
      touched = true;
      return RULES.rules;
    },
  };
  validateProposal({ nodes: [ev('X1'), ev('SECRET')] }, spy, knows('evidence:X1'));
  assert.equal(touched, false);
});

test('anti-shotgun: extra nodes invalidate exact rules; allowExtra is bounded', () => {
  assert.equal(validateProposal({ nodes: [ev('X1'), ev('X2'), ev('W1')] }, RULES, ALL_KNOWN).status, 'not_established');
  assert.equal(validateProposal({ nodes: [ev('Z1'), ev('Z2'), ev('W1')] }, RULES, ALL_KNOWN).status, 'validated');
  assert.equal(validateProposal({ nodes: [ev('Z1'), ev('Z2'), ev('W1'), ev('Z3')] }, RULES, ALL_KNOWN).status, 'not_established');
});

test('request-shape errors only (never about truth)', () => {
  const shape = (nodes: NodeRef[], relation?: string) =>
    validateProposal({ nodes, relation: relation as never }, RULES, ALL_KNOWN);
  assert.deepEqual(shape([ev('X1')]), { status: 'invalid_request', reason: 'too_few_nodes' });
  assert.deepEqual(shape(Array.from({ length: MAX_NODES + 1 }, (_, i) => ev(`N${i}`))), { status: 'invalid_request', reason: 'too_many_nodes' });
  assert.deepEqual(shape([ev('X1'), ev('x1')]), { status: 'invalid_request', reason: 'duplicate_nodes' });
  assert.deepEqual(shape([ev('X1'), { kind: 'weapon' as never, id: 'K' }]), { status: 'invalid_request', reason: 'bad_node' });
  assert.deepEqual(shape([ev('X1'), ev('bad id!')]), { status: 'invalid_request', reason: 'bad_node' });
  assert.deepEqual(shape([ev('X1'), ev('X2')], 'proves_guilt'), { status: 'invalid_request', reason: 'bad_relation' });
});

test('non-evidence node kinds (event, location) take part in authored rules', () => {
  const k = knows('evidence:Y1', 'event:DOOR_0012', 'location:M1');
  const r = validateProposal({ nodes: [{ kind: 'location', id: 'M1' }, ev('Y1'), { kind: 'event', id: 'DOOR_0012' }] }, RULES, k);
  assert.equal(r.status, 'validated');
});

test('derived unlock conditions: all / anyOf, idempotent, draft never fires', () => {
  const v = new Set(['R_PAIR']);
  assert.deepEqual(newlySatisfiedConditions(RULES, v, new Set()), []);
  v.add('R_LOOSE');
  assert.deepEqual(newlySatisfiedConditions(RULES, v, new Set()).map((c) => c.conditionId), ['C_ALL', 'C_ANY']);
  assert.deepEqual(newlySatisfiedConditions(RULES, v, new Set(['C_ALL'])).map((c) => c.conditionId), ['C_ANY']);
  assert.deepEqual(newlySatisfiedConditions({ ...RULES, status: 'draft' }, v, new Set()), []);
  assert.deepEqual(newlySatisfiedConditions({ ...RULES, conditions: [{ id: 'EMPTY', effects: [] }] }, v, new Set()), []);
});

test('Scene 17 authored rules are well-formed and stay draft (not playable before seeding)', () => {
  assert.deepEqual(ruleSetProblems(SCENE_17_CONNECTIONS), []);
  assert.equal(SCENE_17_CONNECTIONS.status, 'draft');
  const everyone = knows(...Array.from({ length: 40 }, (_, i) => `evidence:E${String(i + 1).padStart(2, '0')}`));
  assert.equal(validateProposal({ nodes: [ev('E06'), ev('E07')] }, SCENE_17_CONNECTIONS, everyone).status, 'not_established');
  // بعد الاعتماد (محاكاة): الروابط المكتوبة صراحةً فقط تتحقق، وشرط الفصل الثالث يتطلب الاثنين.
  const approved = { ...SCENE_17_CONNECTIONS, status: 'approved' as const };
  assert.equal(validateProposal({ nodes: [ev('E06'), ev('E07')] }, approved, everyone).status, 'validated');
  assert.equal(validateProposal({ nodes: [ev('E17'), ev('E18'), ev('E28')] }, approved, everyone).status, 'validated');
  assert.equal(validateProposal({ nodes: [ev('E17'), ev('E18')] }, approved, everyone).status, 'not_established');
  assert.deepEqual(newlySatisfiedConditions(approved, new Set(['S17_RECORDED_VOICE']), new Set()), []);
  assert.deepEqual(
    newlySatisfiedConditions(approved, new Set(['S17_RECORDED_VOICE', 'S17_KNIFE_FROM_ARCHIVE']), new Set()).map((c) => c.effects),
    [[{ kind: 'unlock_chapter', chapter: '3' }]],
  );
});

test('player-facing response never carries rule ids, effects/unlock targets or reasons', () => {
  const hit = validateProposal({ nodes: [ev('Z1'), ev('Z2')] }, RULES, ALL_KNOWN);
  assert.equal(hit.status, 'validated');
  assert.deepEqual(toPlayerResponse(hit), { status: 'validated', meaning: 'm3' });
  const blob = JSON.stringify(toPlayerResponse(hit));
  for (const leak of ['R_LOOSE', 'Z9', 'unlock_evidence', 'ruleId', 'effects']) assert.ok(!blob.includes(leak), leak);
  // كل حالات الرفض المتعلقة بالحقيقة تتطابق حرفياً
  const misses = [
    validateProposal({ nodes: [ev('X1'), ev('W1')] }, RULES, ALL_KNOWN), // خاطئ
    validateProposal({ nodes: [ev('X1'), ev('X2')] }, RULES, knows('evidence:X1')), // عقدة غير مصرّح بها
    validateProposal({ nodes: [ev('X1'), ev('X2')] }, { ...RULES, status: 'draft' }, ALL_KNOWN), // مسودة
    validateProposal({ nodes: [ev('X1'), ev('X2')] }, { ...RULES, caseId: 'other', rules: [] }, ALL_KNOWN), // قضية أخرى
  ].map(toPlayerResponse);
  for (const m of misses) assert.deepEqual(m, { status: 'not_established' });
  assert.deepEqual(toPlayerResponse(validateProposal({ nodes: [ev('X1')] }, RULES, ALL_KNOWN)), { status: 'invalid_request' });
});

test('Room 714 candidate rules: draft, no HOLD nodes, single-specialization, mirror sql/032 exactly', () => {
  const room = getCaseServerModule('room-714')!.connectionRules;
  assert.equal(room.status, 'draft', 'inert until Hazem approves');
  assert.deepEqual(ruleSetProblems(room), []);
  assert.deepEqual(room.conditions, []);
  const HOLD = new Set(['D-06', 'D-02', 'D-07', 'R-02', 'R-06', 'R-07', 'R-09', 'F-03', 'F-04', 'F-07', 'V-02', 'V-04', 'V-05', 'V-06', 'V-09', 'GLASS_CUP', 'OPEN_WINDOW']);
  for (const r of room.rules) {
    for (const n of r.requires) assert.ok(!HOLD.has(n.id), `${r.id} uses HOLD ${n.id}`);
    // كل العقد من تخصص واحد (بادئة الكود: F/D/R/V) — 027 يشترط أن يقرأ المقترِح كل عقدة
    assert.equal(new Set(r.requires.map((n) => n.id[0])).size, 1, r.id);
    assert.ok(!r.effects.some((e) => e.kind === 'unlock_evidence'), `${r.id}: meaning-only first set`);
  }
  // مرآة حرفية لمسودة SQL (معرّفات، عقد، معانٍ)
  const sql = readFileSync('sql/032_room714_connection_rules_DRAFT.sql', 'utf8');
  for (const r of room.rules) {
    const at = sql.indexOf(`'${r.id}'`);
    assert.ok(at > 0, r.id);
    const row = sql.slice(at, sql.indexOf("'draft'", at));
    for (const n of r.requires) assert.ok(row.includes(`"id":"${n.id}"`), `${r.id} ${n.id}`);
    assert.ok(row.includes(r.meaning), `${r.id} meaning`);
  }
  assert.equal((sql.match(/'draft', \d+\)/g) ?? []).length, room.rules.length);
  assert.match(sql, /-- update public\.case_connection_rules\n-- set status = 'approved'/, 'approval step stays commented');
  // حارس الأصل: لا معنى يكشف حقيقة من دليل محجوز أو نتيجة لاحقة أو الحل.
  // F-03 (المحجوز): الهوية/الجنس/آلية الجرح. F-04/F-05: الإصابة والسقوط. D-06/R-06/R-07: الحادث القديم.
  // V-0x المحجوزة: الأشخاص. R-09: علاقة س.م برامي.
  const FORBIDDEN = ['سارة', 'أنثى', 'زجاج', 'جرح', 'إصابة', 'سقوط', 'M1', 'حادث', 'يوسف', 'نبيل', 'كريم', 'يارا', 'آدم', 'ابتزاز', 'يملك رامي', 'نسخ رامي', 'الفيديو نفسه'];
  for (const r of room.rules) for (const w of FORBIDDEN) assert.ok(!r.meaning.includes(w), `${r.id} reveals «${w}»`);

  // قبل الاعتماد: كل اقتراح "غير مثبت" حتى لو كان صحيحاً
  const all = knows('evidence:F-01', 'evidence:F-02');
  assert.equal(validateProposal({ nodes: [ev('F-01'), ev('F-02')] }, room, all).status, 'not_established');
  assert.equal(validateProposal({ nodes: [ev('F-01'), ev('F-02')] }, { ...room, status: 'approved' }, all).status, 'validated');
});
