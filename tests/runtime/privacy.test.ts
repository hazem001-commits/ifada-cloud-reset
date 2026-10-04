// ============================================================
// tests/runtime/privacy.test.ts
// Pulse = THAT, never WHAT. PlayerKnowledge / TeamKnowledge boundaries.
// Dual-case: Room 714 title-only / specialization; Scene 17 hidden channels.
// ⚠ fixtures are TEST ONLY · NON-CANON.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PULSE_CATEGORY_LABEL, PULSE_FIELDS, pulseLine, sanitizePulse, sanitizePulses } from '../../src/lib/runtime/pulse';
import { PULSE_CATEGORIES } from '../../src/lib/runtime/types';
import { buildAuthorizedKnowledge, type AuthorizedInput } from '../../src/lib/ai/knowledge';
import { buildTeamKnowledge, isSubsetOfPlayer } from '../../src/lib/runtime/teamKnowledge';
import { getCaseContract } from '../../src/cases/registry';
import { runtimeInspectorEnabled } from '../../src/lib/runtime/devGate';
import { teamReadableEvidence } from '../../src/server/cases/registry';
import { SCENE_17_SHARED_EVIDENCE } from '../../src/server/cases/scene-17/channels';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const PULSE_ID = '11111111-1111-4111-8111-111111111111';

// Anything a pulse must NEVER carry — codes, titles, bodies, filenames,
// places, people, channels, specializations, rules, counts.
const LEAKS = {
  code: 'F-04', object: 'BLOOD_STAIN', title: 'تقرير الوفاة', body: 'سبب الوفاة', description: 'نص', filename: 'room-714/F-06.png',
  media_path: 'cases/x.pdf', place: 'M1', location: 'SERVICE_ELEVATOR', person: 'نبيل', character: 'NABIL', entity: '{{entity:N}}',
  channel: 'A', specialization: 'forensics', owner_spec: 'records', rule: 'R714_N17_PAYMENTS', rule_id: 'R1', source_key: 'object:CUP',
  reason: 'لأنه يثبت', count: 3, progress: '3/34', lead: 'L_ROUTE', label: 'route', clock: '00:06', time: '23:43',
};

test('pulse sanitizer keeps exactly id/actor/category/time — every other field is dropped', () => {
  const p = sanitizePulse({ id: PULSE_ID, actor: A, category: 'PHYSICAL_TRACE', at: '2026-10-03T10:00:00Z', ...LEAKS });
  assert.deepEqual(p, { id: PULSE_ID, actorId: A, category: 'PHYSICAL_TRACE', at: '2026-10-03T10:00:00Z' });
  const json = JSON.stringify(p);
  for (const [k, v] of Object.entries(LEAKS)) {
    assert.ok(!json.includes(String(v)) || ['A', 3].includes(v as never), `pulse leaks ${k}`);
    assert.ok(!(k in (p as object)), `pulse carries ${k}`);
  }
  assert.deepEqual([...PULSE_FIELDS], ['id', 'actor', 'category', 'at']);
});

test('pulse taxonomy is small and fixed; unknown / node-specific categories drop the whole pulse', () => {
  assert.deepEqual([...PULSE_CATEGORIES], ['PERSON', 'PLACE', 'TIME', 'DEVICE', 'MOVEMENT', 'PHYSICAL_TRACE', 'RECORD', 'NEW_ACTION']);
  assert.ok(!(PULSE_CATEGORIES as readonly string[]).includes('CONTRADICTION'), 'RESET-1: a pulse never says why a finding matters');
  for (const bad of ['CONTRADICTION', 'BLOOD', 'F-04', 'RAMI', 'PLACE:M1', '', null, 7]) {
    assert.equal(sanitizePulse({ id: PULSE_ID, actor: A, category: bad, at: '2026-10-03T10:00:00Z' }), null, String(bad));
  }
  assert.equal(sanitizePulse({ id: 'not-a-uuid', actor: A, category: 'TIME', at: '2026-10-03T10:00:00Z' }), null);
  assert.equal(sanitizePulse({ id: PULSE_ID, actor: 'NABIL', category: 'TIME', at: '2026-10-03T10:00:00Z' }), null, 'actor must be an opaque member id');
  assert.equal(sanitizePulses('x').length, 0);
  assert.equal(sanitizePulses([{ id: PULSE_ID, actor: null, category: 'TIME', at: '2026-10-03T10:00:00Z' }, { id: PULSE_ID, actor: null, category: 'TIME', at: '2026-10-03T10:00:00Z' }]).length, 1);
});

test('rendered pulse text contains no code, title, place, person, channel, specialization or count', () => {
  const names = new Map([[A, 'محقق ١']]);
  for (const category of PULSE_CATEGORIES) {
    for (const actorId of [A, null, 'cccccccc-0000-4000-8000-000000000003']) {
      const line = pulseLine({ id: PULSE_ID, actorId, category, at: '2026-10-03T10:00:00Z' }, names, 'dddddddd-0000-4000-8000-000000000004');
      assert.ok(!/[A-Z]{1,3}-\d{2}|\d|M1|714|field|digital|forensics|records|ميداني|رقمي|جنائي|سجلات|قناة/.test(line.replace('محقق ١', '')), line);
      assert.ok(line.includes(PULSE_CATEGORY_LABEL[category]));
    }
  }
});

test('pulses never enter AuthorizedKnowledge, TeamKnowledge, search, connections, entities or AI (structural)', () => {
  const consumers = [
    'src/lib/ai/knowledge.ts', 'src/lib/ai/hypothesis.ts', 'src/lib/ai/stressTest.ts', 'src/lib/runtime/teamKnowledge.ts',
    'src/lib/inquiry/search.ts', 'src/lib/inquiry/runInquiry.ts', 'src/lib/connections/validate.ts', 'src/lib/entities/progressive.ts',
    'src/app/api/hypothesis-test/route.ts', 'src/app/api/case-inquiry/route.ts', 'src/app/api/interrogate/route.ts',
  ];
  for (const f of consumers) {
    const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/pulse/i.test(src), `${f} must not touch pulses`);
  }
  // the knowledge bridge drops them explicitly
  assert.match(readFileSync('src/lib/runtime/projection.ts', 'utf8'), /return \{ leads: model\.leads, world: model\.world, places: model\.places \}/);
});

// ------------------------------------------------------------
// PlayerKnowledge / TeamKnowledge
// ------------------------------------------------------------
function input(over: Partial<AuthorizedInput> = {}): AuthorizedInput {
  return {
    caseId: 'test-case',
    restrictedEvidence: 'title',
    evidence: [
      { code: 'T-01', title: 'readable to me', kind: 'document', owner_spec: 'field', clock_label: null, body: 'my body', readable: true },
      { code: 'T-02', title: 'title only', kind: 'document', owner_spec: 'digital', clock_label: null, body: null, readable: false },
    ],
    objects: [
      { code: 'SHARED_OBJ', category: 'object', parent_code: null, title: 'shared', description: 'd', state: 'S', discovered: true, is_shared: true },
      { code: 'MY_OBJ', category: 'object', parent_code: null, title: 'mine', description: 'd', state: 'S', discovered: true, is_shared: false },
      { code: 'THEIR_OBJ', category: 'object', parent_code: null, title: 'theirs', description: '', state: 'HIDDEN', discovered: true, is_shared: false },
    ],
    subjects: [],
    log: [],
    validatedConnections: [{ ruleId: 'SECRET_RULE', meaning: 'team meaning' }],
    interrogationLayers: [],
    tools: [],
    challengeCodes: [],
    connectionsEnabled: true,
    runtime: {
      leads: [
        { code: 'L_MINE', label: 'my private direction', status: 'open', shared: false, mine: true, openedAt: null },
        { code: 'L_TEAM', label: 'team direction', status: 'followed', shared: true, mine: false, openedAt: null },
        { code: 'L_THEIRS', label: 'should never arrive', status: 'open', shared: false, mine: false, openedAt: null },
      ],
      world: [{ code: 'W_FOUND', headline: 'the case changed', reachedAt: '2026-10-03T10:00:00Z' }],
      places: [{ code: 'SECRET_PLACE', title: 'my private place', category: 'location', shared: false }],
    },
    ...over,
  };
}

test('PlayerKnowledge understands leads, world states and revealed places — only the caller’s', () => {
  const k = buildAuthorizedKnowledge(input());
  const ids = k.facts.map((f) => f.id);
  for (const id of ['lead:L_MINE', 'lead:L_TEAM', 'world:W_FOUND', 'place:SECRET_PLACE']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('lead:L_THEIRS'), 'a teammate’s private lead never enters');
  assert.ok(!JSON.stringify(k).includes('SECRET_RULE'), 'no rule ids');
  assert.ok(!JSON.stringify(k).toLowerCase().includes('pulse'));
});

test('before 037 (no runtime input) knowledge is exactly as before', () => {
  const k = buildAuthorizedKnowledge(input({ runtime: undefined }));
  assert.ok(!k.facts.some((f) => f.kind === 'lead' || f.kind === 'world_state' || f.kind === 'place'));
});

test('TeamKnowledge: Room 714 — shared/team facts in full, evidence title-only, private material absent', () => {
  const player = buildAuthorizedKnowledge(input());
  const team = buildTeamKnowledge(player);
  const byId = new Map(team.facts.map((f) => [f.id, f]));
  assert.ok(byId.has('object:SHARED_OBJ') && !byId.has('object:MY_OBJ') && !byId.has('object:THEIR_OBJ'));
  assert.equal(byId.get('evidence:T-01')?.text, null, 'my readable evidence is title-only for the team (specialization boundary)');
  assert.equal(byId.get('evidence:T-02')?.text, null);
  assert.ok(byId.has('lead:L_TEAM') && !byId.has('lead:L_MINE'));
  assert.ok(byId.has('world:W_FOUND') && byId.has('connection:1'));
  assert.ok(!byId.has('place:SECRET_PLACE'));
  assert.ok(isSubsetOfPlayer(team, player));
});

test('TeamKnowledge: Scene 17 — channel-private material is absent entirely; only the shared lane is team content', () => {
  const shared = SCENE_17_SHARED_EVIDENCE[0]!;
  const rows = [
    { code: shared, title: 'shared lane', kind: 'document', owner_spec: null, clock_label: null, body: 'everyone reads', readable: true },
    { code: 'E06', title: 'my channel', kind: 'document', owner_spec: null, clock_label: null, body: 'only my channel', readable: true },
  ];
  assert.deepEqual(teamReadableEvidence('scene-17', rows), [shared]);
  assert.deepEqual(teamReadableEvidence('room-714', rows), [], 'specialization distribution: no team content');
  const player = buildAuthorizedKnowledge(input({ caseId: 'scene-17', restrictedEvidence: 'hidden', evidence: rows, teamReadableEvidence: teamReadableEvidence('scene-17', rows), runtime: null }));
  const team = buildTeamKnowledge(player);
  assert.deepEqual(team.facts.filter((f) => f.kind === 'evidence').map((f) => [f.id, f.text]), [[`evidence:${shared}`, 'everyone reads']]);
  assert.ok(isSubsetOfPlayer(team, player));
});

test('TeamKnowledge is never a union: built only from one player’s authorized knowledge (no service-role path)', () => {
  const src = readFileSync('src/lib/runtime/teamKnowledge.ts', 'utf8');
  assert.ok(!/createServiceClient|supabase|rpc\(/.test(src));
  assert.match(src, /export function buildTeamKnowledge\(player: PlayerKnowledge\)/);
});

// ------------------------------------------------------------
// contracts / dual case / dev gate / boundaries
// ------------------------------------------------------------
test('contracts: runtime capability metadata — Room 714 engine (inert until rules), Scene 17 none', () => {
  assert.deepEqual(getCaseContract('room-714')?.runtime, { engine: true, pulse: true, gatedPlaces: true });
  assert.deepEqual(getCaseContract('scene-17')?.runtime, { engine: false, pulse: false, gatedPlaces: false });
  assert.equal(getCaseContract('scene-17')?.restrictedEvidence, 'hidden', 'Scene 17 channel privacy unchanged');
  assert.equal(getCaseContract('scene-17')?.distribution.kind, 'channels');
});

test('dev inspector is dev-gated and contract-gated', () => {
  const room = getCaseContract('room-714');
  assert.equal(runtimeInspectorEnabled(room, { NODE_ENV: 'production' }), false);
  assert.equal(runtimeInspectorEnabled(room, { NODE_ENV: 'development' }), true);
  assert.equal(runtimeInspectorEnabled(room, { NODE_ENV: 'production', NEXT_PUBLIC_IFADA_RUNTIME_INSPECTOR: '1' }), true);
  assert.equal(runtimeInspectorEnabled(getCaseContract('scene-17'), { NODE_ENV: 'development' }), false);
  assert.equal(runtimeInspectorEnabled(null, { NODE_ENV: 'development' }), false);
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p.replaceAll('\\', '/')];
  });
}

test('no second live rule source in TypeScript: no case runtime rule data anywhere under src/', () => {
  for (const f of walk('src').filter((x) => /\.(ts|tsx)$/.test(x))) {
    const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/case_runtime_rules/.test(src), `${f} reads or writes case_runtime_rules (DB is the only live rule source)`);
    assert.ok(!/reach_world_state['"]\s*,\s*state:\s*['"](RAMI_FOUND|RAMI_DIED|M1_DISCOVERED)/.test(src), `${f} authors a live world rule`);
  }
  assert.ok(!walk('src/server/cases').some((f) => /runtime/i.test(path.basename(f))), 'no src/server/cases/*/runtime.ts rule module');
});
