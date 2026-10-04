// ============================================================
// tests/connections/sql038.test.ts
// 038 — Room 714 opening content (REVIEW ONLY — NOT APPLIED).
// Structural proofs on the SQL text + the TS authoring lint run over the
// very rules 038 approves (the TS mirror and the 037 validator agree).
// Live behaviour: tests/sql-local/038_room714_opening.sql (opt-in).
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lintRuleSet, type AuthoringCatalogue, type RawRule } from '../../src/lib/runtime/authoring';
import { PULSE_CATEGORIES } from '../../src/lib/runtime/types';

const S38 = readFileSync('sql/038_room714_opening_runtime.sql', 'utf8');
const CODE = S38.replace(/--.*$/gm, '');
const PRE = readFileSync('sql/verify_038_preapply.sql', 'utf8');
const POST = readFileSync('sql/verify_038_postapply.sql', 'utf8');
const MIG = readFileSync('sql/MIGRATIONS.md', 'utf8');

test('038 is REVIEW ONLY, atomic, and content-only (no architecture)', () => {
  assert.match(S38, /STATUS: REVIEW ONLY — NOT APPLIED/);
  const lines = CODE.split('\n').map((l) => l.trim()).filter(Boolean);
  assert.equal(lines[0], 'begin;');
  assert.equal(lines[lines.length - 1], 'commit;');
  for (const banned of [/create\s+(table|function|or replace|trigger|policy|index|type|view)/i, /\balter\s+(table|function|publication|type)/i, /\bdrop\s/i, /\bgrant\s/i, /\brevoke\s/i, /\btruncate\b/i, /security definer/i]) {
    assert.ok(!banned.test(CODE), String(banned));
  }
  // only Room 714 rows are written
  for (const m of CODE.matchAll(/case_id = '([a-z0-9-]+)'/g)) assert.equal(m[1], 'room-714');
  for (const m of CODE.matchAll(/\('([a-z0-9-]+)', '(?:object|L714_|R714_)/g)) assert.equal(m[1], 'room-714');
  assert.ok(!/scene-17|'M1'|RAMI_FOUND|RAMI_DIED|reach_world_state|reveal_object/.test(CODE), 'no M1 / world event / reveal in the opening');
});

test('037 is never re-run or redefined by 038', () => {
  assert.ok(!/_runtime_|open_investigation|investigation_object_index/.test(CODE.replace(/case_runtime_(rules|nodes)/g, '')));
});

// ---- the TS authoring lint over the rules 038 approves ----
function rulesFromSql(): RawRule[] {
  const block = CODE.slice(CODE.indexOf('insert into public.case_runtime_rules'));
  const re = /\('room-714', '(R714_[A-Z_]+)', '(approved|draft)', '(team|actor)',\s*'(\[[^']*\])',\s*'(\[[^']*\])', (\d+)/g;
  return [...block.matchAll(re)].map((m) => ({
    id: m[1]!, status: m[2] as 'approved', scope: m[3] as 'team' | 'actor',
    conditions: JSON.parse(m[4]!), effects: JSON.parse(m[5]!), sortOrder: Number(m[6]),
  }));
}

// Room 714 catalogue as authored (019/025 + 038). parent = null → root.
const CAT: AuthoringCatalogue = {
  objects: new Map([
    ['ROOM_714', { gated: false, initialState: 'KNOWN', parent: null }],
    ['GLASS_CUP', { gated: false, initialState: 'UNKNOWN', parent: 'ROOM_714' }],
    ['BLOOD_STAIN', { gated: false, initialState: 'UNKNOWN', parent: 'GLASS_CUP' }],
    ['OPEN_WINDOW', { gated: false, initialState: 'UNKNOWN', parent: 'ROOM_714' }],
    ['VICTIM_ITEMS', { gated: false, initialState: 'UNKNOWN', parent: 'ROOM_714' }],
    ['PASSPORT', { gated: false, initialState: 'UNKNOWN', parent: 'VICTIM_ITEMS' }],
    ['LAPTOP', { gated: false, initialState: 'UNKNOWN', parent: 'ROOM_714' }],
    ['DOOR_714', { gated: false, initialState: 'UNKNOWN', parent: 'ROOM_714' }],
    ['SECURITY_OFFICE', { gated: true, initialState: 'KNOWN', parent: null }],
  ]),
  evidence: new Map([
    ['D-01', { requires: ['@RUNTIME'] }], ['R-01', { requires: ['@RUNTIME'] }], ['F-01', { requires: ['@RUNTIME'] }],
    ['F-02', { requires: ['@RUNTIME'] }], ['D-02', { requires: ['D-01'] }], ['V-01', { requires: [], initial: true }],
  ]),
  leads: new Map(
    [...CODE.matchAll(/\('room-714', '(L714_[A-Z_]+)',\s*'([^']+)'/g)].map((m) => [m[1]!, { label: m[2]! }] as const),
  ),
  worldStates: new Map(),
  approvedConnections: new Set(),
};

test('every 038 rule passes the TS authoring lint (mirror of the 037 validator); labels name no code', () => {
  const rules = rulesFromSql();
  assert.equal(rules.length, 11);
  assert.ok(rules.every((r) => r.status === 'approved'));
  assert.deepEqual(lintRuleSet(rules, CAT), []);
  assert.equal(CAT.leads.size, 5);
});

test('design invariants of the opening rules', () => {
  const rules = rulesFromSql();
  const deliveries = rules.flatMap((r) => (r.effects as { kind: string; evidence?: string }[]).filter((e) => e.kind === 'deliver_evidence').map((e) => [r.scope, e.evidence]));
  assert.deepEqual(deliveries.map((d) => d[1]).sort(), ['D-01', 'F-01', 'F-02', 'R-01']);
  assert.ok(deliveries.every((d) => d[0] === 'team'), 'material reaches the record only through team-known finds');
  for (const r of rules.filter((x) => x.scope === 'actor')) {
    for (const e of r.effects as { kind: string }[]) assert.ok(['open_lead', 'follow_lead'].includes(e.kind), `${r.id}: actor rules only touch the holder's lead`);
  }
  // the scene report needs every thing F-01 lists, all discovered (team-known) — no shortcut
  const scene = rules.find((r) => r.id === 'R714_SCENE_DOCUMENTED')!;
  assert.deepEqual((scene.conditions as { object: string }[]).map((c) => c.object).sort(), ['BLOOD_STAIN', 'GLASS_CUP', 'LAPTOP', 'OPEN_WINDOW', 'PASSPORT', 'VICTIM_ITEMS']);
});

// EVERYONE INVESTIGATES · SPECIALIZATION = CAPABILITY, NOT SIGHT.
// The wrong specialization can notice the ordinary object, but cannot perform
// the specialist transformation (and cannot read its restricted result — 035).
const ALL_SPECS = ['digital', 'field', 'forensics', 'records'];
const ORDINARY = ['GLASS_CUP', 'BLOOD_STAIN', 'OPEN_WINDOW', 'VICTIM_ITEMS', 'PASSPORT', 'LAPTOP', 'DOOR_714'];
type Interaction = { spec: string; label: string; requires_state: string; produces_state: string; code: string };
const interactionsOf = (code: string): Interaction[] => {
  const blocks = CODE.split('update public.investigation_objects\n');
  const blk = blocks.find((b) => b.includes(`and code = '${code}';`) && b.startsWith('set interactions'));
  assert.ok(blk, code);
  return JSON.parse(blk!.match(/set interactions = '(\[[^']*\])'::jsonb/)![1]!) as Interaction[];
};

test('everyone can notice every ordinary object in the room — one gesture, one label, distinct codes', () => {
  for (const code of ORDINARY) {
    const notices = interactionsOf(code).filter((i) => i.requires_state === 'UNKNOWN');
    assert.deepEqual([...new Set(notices.map((i) => i.spec))].sort(), ALL_SPECS, `${code}: no specialization is blind to it`);
    assert.equal(new Set(notices.map((i) => i.label)).size, 1, `${code}: one gesture`);
    assert.equal(new Set(notices.map((i) => i.code)).size, notices.length, `${code}: distinct codes`);
    for (const n of notices) assert.equal(n.produces_state, 'DISCOVERED', `${code}: noticing only discovers`);
  }
});

test('transformations stay specialist-only: noticing never grants the specialist action', () => {
  const transforms = (code: string) => interactionsOf(code).filter((i) => i.requires_state !== 'UNKNOWN');
  assert.deepEqual(transforms('BLOOD_STAIN').map((i) => [i.code, i.spec]), [['COLLECT_SAMPLE', 'forensics'], ['REQUEST_LAB', 'forensics']]);
  assert.deepEqual(transforms('LAPTOP').map((i) => [i.code, i.spec]), [['INSPECT_DEVICE', 'digital'], ['RECOVER_DRAFT', 'digital']]);
  for (const code of ['GLASS_CUP', 'OPEN_WINDOW', 'VICTIM_ITEMS', 'PASSPORT', 'DOOR_714']) assert.equal(transforms(code).length, 0, code);
  // records lookup and the door-log query are untouched specialist challenges (025)
  assert.doesNotMatch(CODE, /update public\.investigation_challenges\s+set (spec|input_kind|solution)/);
});

test('no artificial mutual dependency: no rule demands an input from another specialization', () => {
  const rulesBlock = CODE.slice(CODE.indexOf('insert into public.case_runtime_rules'));
  assert.doesNotMatch(rulesBlock, /"(spec|specialization|from_spec|other_spec)"/);
});

test('door log keeps the player-supplied ≤90-minute window and never exposes the authored range', () => {
  assert.doesNotMatch(CODE, /DOOR_LOG_QUERY'[^;]*(max_width|targets|1423|1446)/);
  assert.match(POST, /DOOR_LOG_QUERY[\s\S]*max_width'\)::int = 90|max_width'\)::int = 90[\s\S]*DOOR_LOG_QUERY/);
});

test('pulse categories are the fixed RESET-1 taxonomy', () => {
  const block = CODE.slice(CODE.indexOf('insert into public.case_runtime_nodes'), CODE.indexOf('insert into public.case_leads'));
  const cats = [...block.matchAll(/'(PHYSICAL_TRACE|PLACE|PERSON|DEVICE|MOVEMENT|TIME|RECORD|NEW_ACTION|[A-Z_]+)'\)/g)].map((m) => m[1]!);
  assert.equal(cats.length, 7);
  for (const c of cats) assert.ok((PULSE_CATEGORIES as readonly string[]).includes(c), c);
});

test('chapter boundary: held material is runtime-only and nothing delivers it', () => {
  assert.match(CODE, /code in \('D-01', 'R-01', 'F-01', 'F-02',\s+'F-03', 'F-04', 'F-06', 'F-07', 'R-03'\)/);
  for (const held of ['F-03', 'F-04', 'F-06', 'F-07', 'R-03']) {
    assert.ok(!new RegExp(`deliver_evidence","evidence":"${held}"`).test(CODE), held);
  }
  assert.match(CODE, /set gated = true\s+where case_id = 'room-714' and code = 'SECURITY_OFFICE'/);
});

test('verifiers are read-only; MIGRATIONS lists 038 as REVIEW ONLY — NOT APPLIED', () => {
  for (const sql of [PRE, POST]) {
    const c = sql.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''");
    assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b\s/i.test(c));
  }
  const row = MIG.split('\n').find((l) => l.startsWith('| 38 |'));
  assert.ok(row, '038 row present');
  assert.match(row!, /REVIEW ONLY — NOT APPLIED/);
});
