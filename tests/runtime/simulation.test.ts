// ============================================================
// tests/runtime/simulation.test.ts
// ⚠ TEST ONLY · NON-CANON · NEVER SEED.
// الحلقة كاملة على نموذج 037 التنفيذي، بدلالات "تشبه" غرفة 714 دون أي
// حقيقة قضية:
//   اكتشاف خاص → نبضة آمنة → خيط → كشف مكان مغلق → فعل → حالة عالم → مادة لاحقة
// + الخصوصية (المغلق غير موجود)، النظام لا اللاعب القارئ، السلسلة المقيّدة.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeRule } from '../../src/lib/runtime/types';
import {
  cascade,
  createWorld,
  indexFor,
  interact,
  openInvestigation,
  runtimeSettle,
  settleProcessing,
  shareLead,
  shareObject,
  type ModelCatalogueObject,
  type ModelWorld,
} from './runtimeModel';

const A = 'player-a';
const B = 'player-b';

const OBJECTS: ModelCatalogueObject[] = [
  { code: 'ROOM_A', parent: null, category: 'location', title: 'TEST ROOM', initialState: 'KNOWN', gated: false },
  { code: 'TRACE', parent: 'ROOM_A', category: 'object', title: 'TEST TRACE', initialState: 'UNKNOWN', gated: false, autoAdvance: { PROCESSING: 'RESULT' } },
  { code: 'LOWER_LEVEL', parent: null, category: 'location', title: 'TEST HIDDEN LEVEL', initialState: 'KNOWN', gated: true },
  { code: 'BARRIER', parent: 'LOWER_LEVEL', category: 'object', title: 'TEST BARRIER', initialState: 'UNKNOWN', gated: false },
  { code: 'NOTE', parent: 'ROOM_A', category: 'object', title: 'TEST PRIVATE NOTE', initialState: 'NOTICED', gated: true },
];

const RULES: RuntimeRule[] = [
  { id: 'R1', status: 'approved', scope: 'actor', sortOrder: 1,
    conditions: [{ kind: 'object_discovered', object: 'TRACE' }],
    effects: [{ kind: 'open_lead', lead: 'L_ROUTE' }, { kind: 'reveal_object', object: 'NOTE' }] },
  { id: 'R2', status: 'approved', scope: 'team', sortOrder: 2,
    conditions: [{ kind: 'lead', lead: 'L_ROUTE', status: 'open' }],
    effects: [{ kind: 'reveal_object', object: 'LOWER_LEVEL' }] },
  { id: 'R3', status: 'approved', scope: 'team', sortOrder: 3,
    conditions: [{ kind: 'object_state', object: 'BARRIER', states: ['SEARCHED'] }],
    effects: [{ kind: 'follow_lead', lead: 'L_ROUTE' }, { kind: 'reach_world_state', state: 'W_PERSON_FOUND' }] },
  { id: 'R4', status: 'approved', scope: 'team', sortOrder: 4,
    conditions: [{ kind: 'world_state', state: 'W_PERSON_FOUND' }],
    effects: [{ kind: 'deliver_evidence', evidence: 'T-AFTER' }] },
  { id: 'R5', status: 'approved', scope: 'team', sortOrder: 5,
    conditions: [{ kind: 'object_state', object: 'TRACE', states: ['RESULT'] }],
    effects: [{ kind: 'open_lead', lead: 'L_LAB' }] },
];

function world(): ModelWorld {
  const w = createWorld(OBJECTS, RULES, [A, B]);
  w.pulseCategories.set('object:TRACE', 'PHYSICAL_TRACE');
  w.pulseCategories.set('object:NOTE', 'PLACE');
  w.pulseCategories.set('lead:L_ROUTE', 'MOVEMENT');
  w.evidenceOwner.set('T-AFTER', A);
  openInvestigation(w);
  return w;
}

const codes = (w: ModelWorld, viewer: string) => indexFor(w, viewer).map((r) => r.code);

test('gated objects are never seeded and are absent for everyone before reveal (no code, child, breadcrumb or count)', () => {
  const w = world();
  assert.ok(!w.snapshot.objects.has('LOWER_LEVEL') && !w.snapshot.objects.has('NOTE'));
  for (const v of [A, B]) {
    const rows = indexFor(w, v);
    assert.deepEqual(rows.map((r) => r.code).sort(), ['ROOM_A', 'TRACE']);
    assert.ok(!rows.some((r) => r.parent === 'LOWER_LEVEL'), 'no breadcrumb into the gated place');
    assert.ok(!JSON.stringify(rows).includes('HIDDEN LEVEL'));
  }
});

test('the full loop: private discovery → safe pulse → lead → gated reveal → action → world state → aftermath', () => {
  const w = world();

  // OBSERVE → ACT → DISCOVER (private to A)
  interact(w, A, 'TRACE', 'DISCOVERED', { discover: true });
  // PULSE: B learns THAT, never WHAT
  assert.deepEqual(w.pulses.map((p) => [p.actorId, p.category]), [[A, 'PHYSICAL_TRACE'], [A, 'MOVEMENT'], [A, 'PLACE']]);
  // the private lead + private note stay A's
  assert.equal(w.snapshot.leads.get('L_ROUTE')?.holder, A);
  assert.ok(codes(w, A).includes('NOTE'));
  assert.ok(!codes(w, B).includes('NOTE'), 'a private gated reveal is not even listed as redacted for B');
  assert.equal(indexFor(w, B).find((r) => r.code === 'TRACE')?.state, 'HIDDEN', 'non-gated private finds keep the existing redacted semantics');
  // a PRIVATE lead never opens a TEAM place
  assert.ok(!w.snapshot.objects.has('LOWER_LEVEL'));

  // FOLLOW: A shares the lead → team rule reveals the place for both
  shareLead(w, A, 'L_ROUTE');
  assert.ok(codes(w, B).includes('LOWER_LEVEL') && codes(w, B).includes('BARRIER'));
  assert.equal(w.pulses.length, 3, 'a team reveal emits no asymmetry pulse');

  // ACT at the new place (B), share it, search → WORLD REACTS
  interact(w, B, 'BARRIER', 'DISCOVERED', { discover: true });
  shareObject(w, B, 'BARRIER');
  interact(w, B, 'BARRIER', 'SEARCHED');
  assert.ok(w.snapshot.world.has('W_PERSON_FOUND'));
  assert.equal(w.snapshot.leads.get('L_ROUTE')?.status, 'followed');

  // aftermath: B cannot read it → pending; A settles → delivered AFTER the world changed
  assert.ok(w.pending.has('T-AFTER'));
  runtimeSettle(w, A);
  assert.deepEqual(w.log, ['world:W_PERSON_FOUND', 'deliver:T-AFTER'], 'world → aftermath, never aftermath → world');
});

test('read-time processing completion is SYSTEM: the reader is never credited', () => {
  const w = world();
  interact(w, A, 'TRACE', 'DISCOVERED', { discover: true });
  shareObject(w, A, 'TRACE');
  interact(w, A, 'TRACE', 'PROCESSING');
  settleProcessing(w, B); // B's read settles the job
  assert.equal(w.snapshot.objects.get('TRACE')?.state, 'RESULT');
  assert.equal(w.firings.get('R5|'), null, 'team rule fired by the system cascade, not by B');
});

test('a private processing result emits one SYSTEM pulse and never a team effect', () => {
  const w = world();
  interact(w, A, 'TRACE', 'DISCOVERED', { discover: true });
  interact(w, A, 'TRACE', 'PROCESSING');
  settleProcessing(w, B);
  assert.equal(w.pulses.filter((p) => p.actorId === null).length, 1);
  assert.ok(!w.snapshot.leads.has('L_LAB'), 'private result cannot cause a team lead');
  shareObject(w, A, 'TRACE');
  assert.ok(w.snapshot.leads.has('L_LAB'));
  assert.equal(w.firings.get('R5|'), A, 'attributed to the player who shared');
});

test('idempotent: repeating every action fires nothing twice', () => {
  const w = world();
  interact(w, A, 'TRACE', 'DISCOVERED', { discover: true });
  shareLead(w, A, 'L_ROUTE');
  const before = { pulses: w.pulses.length, firings: w.firings.size };
  cascade(w, A);
  cascade(w, B);
  shareLead(w, A, 'L_ROUTE');
  runtimeSettle(w, B);
  assert.deepEqual({ pulses: w.pulses.length, firings: w.firings.size }, before);
});

test('cascade bound: a runaway rule set throws RUNTIME_CASCADE_LIMIT (the transaction rolls back)', () => {
  const flood: RuntimeRule[] = Array.from({ length: 40 }, (_, i) => ({
    id: `F${String(i).padStart(2, '0')}`, status: 'approved', scope: 'team', sortOrder: i,
    conditions: [{ kind: 'world_state', state: 'W_X' }], effects: [{ kind: 'open_lead', lead: `L${i}` }],
  }));
  const w = createWorld(OBJECTS, flood, [A]);
  w.snapshot.world.add('W_X');
  assert.throws(() => cascade(w, A), /RUNTIME_CASCADE_LIMIT/);
});

test('cycle protection: rules that re-enable each other still terminate (once-only ledger)', () => {
  const loop: RuntimeRule[] = [
    { id: 'C1', status: 'approved', scope: 'team', sortOrder: 1, conditions: [{ kind: 'world_state', state: 'W_A' }], effects: [{ kind: 'reach_world_state', state: 'W_B' }] },
    { id: 'C2', status: 'approved', scope: 'team', sortOrder: 2, conditions: [{ kind: 'world_state', state: 'W_B' }], effects: [{ kind: 'reach_world_state', state: 'W_A' }] },
  ];
  const w = createWorld(OBJECTS, loop, [A]);
  w.snapshot.world.add('W_A');
  cascade(w, A);
  assert.equal(w.firings.size, 2);
  cascade(w, A);
  assert.equal(w.firings.size, 2);
});

test('draft rules are inert', () => {
  const w = createWorld(OBJECTS, RULES.map((r) => ({ ...r, status: 'draft' as const })), [A, B]);
  openInvestigation(w);
  interact(w, A, 'TRACE', 'DISCOVERED', { discover: true });
  assert.equal(w.firings.size, 0);
  assert.equal(w.snapshot.leads.size, 0);
});
