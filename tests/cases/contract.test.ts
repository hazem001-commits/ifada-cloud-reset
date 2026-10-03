// ============================================================
// tests/cases/contract.test.ts
// عقد القضية + قابلية اللعب + نموذج القنوات (القناة ليست تخصصاً).
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { channelPlanFor } from '../../src/cases/contract';
import { getCaseContract, isCaseOpenForPlay, NO_DEV_ACCESS } from '../../src/cases/registry';
import { devCaseAccess } from '../../src/server/cases/devAccess';
import { SCENE_17_CHANNELS, SCENE_17_SHARED_EVIDENCE, evidenceForChannels } from '../../src/server/cases/scene-17/channels';
import { SPECIALIZATIONS } from '../../src/types/database';

const room = getCaseContract('room-714')!;
const scene = getCaseContract('scene-17')!;

test('Room 714 is playable with the systems it really has; Scene 17 is in development with ONLY the vertical-slice systems', () => {
  assert.equal(room.status, 'playable');
  assert.equal(room.distribution.kind, 'specialization');
  assert.ok(room.systems.objects && room.systems.scene && room.systems.interrogation && room.systems.hearing);
  assert.equal(room.systems.connections, false, 'foundation only until 027 + authored rules');
  assert.equal(scene.status, 'development', 'never generally playable');
  // sql/036 dev slice: evidence + board/connections + search + stress test — nothing whose content is not ready
  const on = (o: Record<string, boolean>) => Object.entries(o).filter(([, v]) => v).map(([k]) => k).sort();
  assert.deepEqual(on(scene.systems as unknown as Record<string, boolean>), ['connections', 'evidence', 'evidenceMedia']);
  assert.deepEqual(on(scene.ai as unknown as Record<string, boolean>), ['groundedSearch', 'hypothesisStressTest']);
});

test('availability: playable open; development only with explicit dev access; unknown never', () => {
  assert.equal(isCaseOpenForPlay('room-714'), true);
  assert.equal(isCaseOpenForPlay('scene-17'), false);
  assert.equal(isCaseOpenForPlay('scene-17', NO_DEV_ACCESS), false);
  assert.equal(isCaseOpenForPlay('scene-17', { all: true, cases: new Set() }), true);
  assert.equal(isCaseOpenForPlay('scene-17', { all: false, cases: new Set(['scene-17']) }), true);
  assert.equal(isCaseOpenForPlay('scene-17', { all: false, cases: new Set(['room-714']) }), false);
  assert.equal(isCaseOpenForPlay('ghost-case', { all: true, cases: new Set(['ghost-case']) }), false);
});

test('dev access comes only from next dev or an explicit IFADA_DEV_CASES list', () => {
  assert.deepEqual(devCaseAccess({ NODE_ENV: 'production' }), { all: false, cases: new Set() });
  assert.equal(devCaseAccess({ NODE_ENV: 'development' }).all, true);
  assert.deepEqual([...devCaseAccess({ NODE_ENV: 'production', IFADA_DEV_CASES: ' scene-17, ,x ' }).cases], ['scene-17', 'x']);
});

test('player-facing pages gate on the registry, not on a hardcoded case list', () => {
  const archive = readFileSync('src/app/ArchiveActions.tsx', 'utf8');
  assert.ok(!/room-714|scene-17/.test(archive), 'no hardcoded case ids in the create form');
  for (const f of ['src/app/page.tsx', 'src/app/case/[code]/page.tsx', 'src/app/lobby/[code]/page.tsx']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /isCaseOpenForPlay\(/, f);
    assert.match(src, /devCaseAccess\(\)/, f);
  }
});

test('Scene 17 channel plan: every player count 2–8 assigns each of A–H exactly once', () => {
  for (let n = 2; n <= 8; n += 1) {
    const plan = channelPlanFor(scene.distribution, n);
    assert.ok(plan, `plan for ${n}`);
    assert.equal(plan!.length, n);
    assert.deepEqual([...plan!.flat()].sort(), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  }
  // 2 لاعبين: أربع قنوات لكل واحد؛ 8 لاعبين: قناة لكل واحد.
  assert.deepEqual(channelPlanFor(scene.distribution, 2)!.map((p) => p.length), [4, 4]);
  assert.ok(channelPlanFor(scene.distribution, 8)!.every((p) => p.length === 1));
  for (const n of [0, 1, 9]) assert.equal(channelPlanFor(scene.distribution, n), null);
  assert.equal(channelPlanFor(room.distribution, 4), null);
});

test('a corrupted plan fails closed', () => {
  const bad = { kind: 'channels' as const, channels: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], plan: { 2: [['A'], ['A']], 3: [['A'], ['B'], ['Z']] } };
  assert.equal(channelPlanFor(bad, 2), null, 'duplicate channel');
  assert.equal(channelPlanFor(bad, 3), null, 'unknown channel / wrong total');
});

test('channels are information lanes, never specializations', () => {
  const specs = SPECIALIZATIONS.map((s) => s.id as string);
  assert.deepEqual([...specs].sort(), ['digital', 'field', 'forensics', 'records']);
  if (scene.distribution.kind !== 'channels') throw new Error('expected channels');
  for (const c of scene.distribution.channels) assert.ok(!specs.includes(c.id));
});

test('authored channel map (server): 36 private + 4 shared = 40 unique items; ids match the public plan', () => {
  if (scene.distribution.kind !== 'channels') throw new Error('expected channels');
  assert.deepEqual(SCENE_17_CHANNELS.map((c) => c.id), scene.distribution.channels.map((c) => c.id));
  const all = [...SCENE_17_SHARED_EVIDENCE, ...SCENE_17_CHANNELS.flatMap((c) => c.evidence)];
  assert.equal(all.length, 40);
  assert.equal(new Set(all).size, 40);
  assert.deepEqual(new Set(all), new Set(Array.from({ length: 40 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`)));
  // لاعبان: كل لاعب يحمل أدلة قنواته فقط، ومعاً كل الخاصة، بلا تكرار.
  const [p1, p2] = channelPlanFor(scene.distribution, 2)!;
  const a = evidenceForChannels(p1!);
  const b = evidenceForChannels(p2!);
  assert.equal(a.filter((x) => b.includes(x)).length, 0);
  assert.equal(a.length + b.length, 36);
  assert.deepEqual(evidenceForChannels(['Z']), []);
});

test('public contracts carry no authored truth (no evidence codes, no channel titles)', () => {
  const json = JSON.stringify([room, scene]);
  assert.ok(!/\bE\d{2}\b/.test(json), 'no Scene 17 evidence codes');
  for (const c of SCENE_17_CHANNELS) assert.ok(!json.includes(c.title), c.title);
});
