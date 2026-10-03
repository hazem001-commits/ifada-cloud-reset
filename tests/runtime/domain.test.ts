// ============================================================
// tests/runtime/domain.test.ts
// RESET-1 domain: parsing, condition evaluation (team vs actor
// perspective), lifecycles, world-state causality lint, projections.
// ⚠ fixtures are TEST ONLY · NON-CANON.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conditionHolds, objectTeamKnown, parseCondition, parseEffect, type RuntimeSnapshot } from '../../src/lib/runtime/conditions';
import { applyLeadEvent, discoveryPhaseOf, discoveryTransition, isLeadError, leadPhase, reachWorldState, type LeadRecord } from '../../src/lib/runtime/lifecycle';
import { isProgressCondition, lintRuleSet, parseRule, validateApprovedRule, type AuthoringCatalogue, type RawRule } from '../../src/lib/runtime/authoring';
import { EMPTY_RUNTIME, isRuntimeNotInstalled, objectDiscoveries, parseRuntimeState, processingJobs, runtimeKnowledgeInput, timelineEvents } from '../../src/lib/runtime/projection';
import { NODE_BACKING, RUNTIME_NODE_KINDS, nodeRef, type RuntimeRule } from '../../src/lib/runtime/types';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';

function snap(): RuntimeSnapshot {
  return {
    objects: new Map([
      ['ROOT', { parent: null, state: 'KNOWN', discovered: true, discoveredBy: null, shared: true, gated: false, initialState: 'KNOWN' }],
      ['MINE', { parent: 'ROOT', state: 'DISCOVERED', discovered: true, discoveredBy: A, shared: false, gated: false, initialState: 'UNKNOWN' }],
      ['TEAM', { parent: 'ROOT', state: 'OPEN', discovered: true, discoveredBy: B, shared: true, gated: false, initialState: 'UNKNOWN' }],
      ['UNDER_MINE', { parent: 'MINE', state: 'X', discovered: true, discoveredBy: B, shared: true, gated: false, initialState: 'X' }],
    ]),
    catalogueParents: new Map([['ROOT', null], ['MINE', 'ROOT'], ['TEAM', 'ROOT'], ['UNDER_MINE', 'MINE']]),
    evidence: new Map([
      ['T-01', { unlocked: true, teamVisible: true, readers: new Set([A]) }],
      ['T-02', { unlocked: true, teamVisible: false, readers: new Set([B]) }],
    ]),
    connections: new Set(['CONN_OK']),
    world: new Set(['W1']),
    leads: new Map([
      ['L_MINE', { holder: A, shared: false, status: 'open', followed: false }],
      ['L_TEAM', { holder: null, shared: true, status: 'followed', followed: true }],
    ]),
  };
}

test('node model covers every required runtime concept, each backed by existing storage', () => {
  for (const k of ['place', 'object', 'material', 'statement', 'result', 'lead', 'person', 'event', 'action', 'processing_job', 'timeline_event', 'unknown_entity', 'world_state'] as const) {
    assert.ok(RUNTIME_NODE_KINDS.includes(k), k);
    assert.ok(NODE_BACKING[k].length > 0, k);
  }
  assert.deepEqual(nodeRef('material', ' f-02 '), { kind: 'material', code: 'F-02' });
  assert.equal(nodeRef('object', 'bad code!'), null);
});

test('parsers fail closed on any unknown shape', () => {
  assert.deepEqual(parseCondition({ kind: 'object_state', object: 'X', states: ['A'] }), { kind: 'object_state', object: 'X', states: ['A'] });
  for (const bad of [null, [], { kind: 'telepathy' }, { kind: 'object_state', object: 'X', states: [] }, { kind: 'lead', lead: 'L', status: 'maybe' }, { kind: 'object_discovered', object: 'lower' }]) {
    assert.equal(parseCondition(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseEffect({ kind: 'advance_object_state', object: 'X', from: 'A', to: 'A' }), null, 'from == to refused');
  assert.equal(parseEffect({ kind: 'unlock_everything' }), null);
});

test('team perspective sees only team-known state; a private find never counts for the team', () => {
  const s = snap();
  const team = { kind: 'team' } as const;
  assert.equal(conditionHolds(s, { kind: 'object_discovered', object: 'MINE' }, team), false);
  assert.equal(conditionHolds(s, { kind: 'object_state', object: 'TEAM', states: ['OPEN'] }, team), true);
  assert.equal(objectTeamKnown(s, 'UNDER_MINE'), false, 'shared child under a private ancestor is not team-known');
  assert.equal(conditionHolds(s, { kind: 'evidence_unlocked', evidence: 'T-02' }, team), false, 'channel-private unlock');
  assert.equal(conditionHolds(s, { kind: 'lead', lead: 'L_MINE', status: 'open' }, team), false);
  assert.equal(conditionHolds(s, { kind: 'lead', lead: 'L_TEAM', status: 'followed' }, team), true);
});

test('actor perspective = that player’s own authorized view only', () => {
  const s = snap();
  const a = { kind: 'actor', userId: A } as const;
  const b = { kind: 'actor', userId: B } as const;
  assert.equal(conditionHolds(s, { kind: 'object_discovered', object: 'MINE' }, a), true);
  assert.equal(conditionHolds(s, { kind: 'object_discovered', object: 'MINE' }, b), false);
  assert.equal(conditionHolds(s, { kind: 'object_discovered', object: 'UNDER_MINE' }, b), false, 'B lacks the private ancestor');
  assert.equal(conditionHolds(s, { kind: 'evidence_unlocked', evidence: 'T-01' }, a), true);
  assert.equal(conditionHolds(s, { kind: 'evidence_unlocked', evidence: 'T-01' }, b), false, 'unlocked ≠ readable');
  assert.equal(conditionHolds(s, { kind: 'lead', lead: 'L_MINE', status: 'open' }, b), false);
  assert.equal(conditionHolds(s, { kind: 'connection_validated', rule: 'CONN_OK' }, b), true);
  assert.equal(conditionHolds(s, { kind: 'world_state', state: 'W1' }, b), true);
});

test('discovery lifecycle: latent → private → shared (or latent → shared); no way back', () => {
  assert.equal(discoveryTransition('latent', 'discover_private'), 'private');
  assert.equal(discoveryTransition('private', 'share'), 'shared');
  assert.equal(discoveryTransition('latent', 'discover_team'), 'shared');
  assert.deepEqual(discoveryTransition('latent', 'share'), { error: 'INVALID_DISCOVERY_TRANSITION:latent:share' });
  assert.equal(discoveryPhaseOf({ discovered: true, is_shared: false, state: 'HIDDEN' }), 'latent', 'a teammate’s private find is not mine');
});

test('lead lifecycle: latent → open_private|open_team → shared → followed → closed', () => {
  let l: LeadRecord | null = null;
  assert.equal(leadPhase(l), 'latent');
  const opened = applyLeadEvent(l, { kind: 'open', scope: 'actor', actor: A });
  assert.ok(!isLeadError(opened));
  l = opened;
  assert.equal(leadPhase(l), 'open_private');
  assert.deepEqual(applyLeadEvent(l, { kind: 'share', by: B }), { error: 'LEAD_NOT_FOUND' }, 'only the holder shares');
  l = applyLeadEvent(l, { kind: 'share', by: A }) as LeadRecord;
  assert.equal(leadPhase(l), 'shared');
  l = applyLeadEvent(l, { kind: 'follow', scope: 'team' }) as LeadRecord;
  assert.equal(leadPhase(l), 'followed');
  l = applyLeadEvent(l, { kind: 'close', scope: 'team' }) as LeadRecord;
  assert.equal(leadPhase(l), 'closed');
  const team = applyLeadEvent(null, { kind: 'open', scope: 'team' }) as LeadRecord;
  assert.equal(leadPhase(team), 'open_team');
  // a team rule cannot touch someone's private lead; a stale lead may close without being followed
  const priv = applyLeadEvent(null, { kind: 'open', scope: 'actor', actor: A }) as LeadRecord;
  assert.equal(leadPhase(applyLeadEvent(priv, { kind: 'follow', scope: 'team' }) as LeadRecord), 'open_private');
  // an actor (private) rule can never change a TEAM-visible lead — not even its own once shared
  const sharedMine = applyLeadEvent(priv, { kind: 'share', by: A }) as LeadRecord;
  assert.equal(leadPhase(applyLeadEvent(sharedMine, { kind: 'follow', scope: 'actor', actor: A }) as LeadRecord), 'shared');
  assert.equal(leadPhase(applyLeadEvent(team, { kind: 'close', scope: 'actor', actor: A }) as LeadRecord), 'open_team');
  assert.equal(leadPhase(applyLeadEvent(priv, { kind: 'follow', scope: 'actor', actor: A }) as LeadRecord), 'followed');
  assert.equal(leadPhase(applyLeadEvent(team, { kind: 'close', scope: 'team' }) as LeadRecord), 'closed');
});

test('world states are reached once and never un-reached', () => {
  const r1 = reachWorldState(new Set(), 'W');
  assert.ok(r1.changed);
  assert.equal(reachWorldState(r1.reached, 'W').changed, false);
});

// ------------------------------------------------------------
// WORLD-STATE CAUSALITY INVARIANT
// ------------------------------------------------------------
const CAT: AuthoringCatalogue = {
  objects: new Map([['SEARCH_AREA', { gated: false, initialState: 'UNKNOWN' }], ['HIDDEN_LEVEL', { gated: true, initialState: 'KNOWN' }]]),
  evidence: new Map([['T-MED', { requires: ['@RUNTIME'] }], ['T-OLD', { requires: ['T-MED'] }], ['T-CLUE', { requires: [] }]]),
  leads: new Map([['L_ROUTE', { label: 'someone used another route' }]]),
  worldStates: new Map([['W_FOUND', { major: true }], ['W_MINOR', { major: false }]]),
  approvedConnections: new Set(['CONN_A']),
};
const approved = (r: Omit<RuntimeRule, 'status' | 'sortOrder'>): RuntimeRule => ({ ...r, status: 'approved', sortOrder: 0 });
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

test('causality: a MAJOR world state is never reached by evidence alone', () => {
  const evidenceOnly = approved({ id: 'X', scope: 'team', conditions: [{ kind: 'evidence_unlocked', evidence: 'T-CLUE' }], effects: [{ kind: 'reach_world_state', state: 'W_FOUND' }] });
  assert.deepEqual(codes(validateApprovedRule(evidenceOnly, CAT, [])), ['RUNTIME_RULE_CAUSALITY']);
  const merelyHoldingLead = approved({ id: 'X', scope: 'team', conditions: [{ kind: 'lead', lead: 'L_ROUTE', status: 'open' }], effects: [{ kind: 'reach_world_state', state: 'W_FOUND' }] });
  assert.deepEqual(codes(validateApprovedRule(merelyHoldingLead, CAT, [])), ['RUNTIME_RULE_CAUSALITY'], 'holding a lead is not progression');
  const searched = approved({ id: 'X', scope: 'team', conditions: [{ kind: 'object_state', object: 'SEARCH_AREA', states: ['SEARCHED'] }, { kind: 'evidence_unlocked', evidence: 'T-CLUE' }], effects: [{ kind: 'reach_world_state', state: 'W_FOUND' }] });
  assert.deepEqual(validateApprovedRule(searched, CAT, []), [], 'evidence may contribute alongside real progression');
  const minor = approved({ id: 'X', scope: 'team', conditions: [{ kind: 'evidence_unlocked', evidence: 'T-CLUE' }], effects: [{ kind: 'reach_world_state', state: 'W_MINOR' }] });
  assert.deepEqual(validateApprovedRule(minor, CAT, []), [], 'a minor world state may follow evidence');
  assert.equal(isProgressCondition({ kind: 'evidence_unlocked', evidence: 'T-CLUE' }, CAT), false);
});

test('causality is inductive: evidence cannot be laundered through a reveal, a follow, an advance or a minor world state', () => {
  // (1) evidence → follow_lead is itself refused …
  const follow = approved({ id: 'F', scope: 'team', conditions: [{ kind: 'evidence_unlocked', evidence: 'T-CLUE' }], effects: [{ kind: 'follow_lead', lead: 'L_ROUTE' }] });
  assert.deepEqual(codes(validateApprovedRule(follow, CAT, [])), ['RUNTIME_RULE_CAUSALITY']);
  const advance = approved({ id: 'A', scope: 'team', conditions: [{ kind: 'evidence_unlocked', evidence: 'T-CLUE' }], effects: [{ kind: 'advance_object_state', object: 'SEARCH_AREA', from: 'UNKNOWN', to: 'SEARCHED' }] });
  assert.deepEqual(codes(validateApprovedRule(advance, CAT, [])), ['RUNTIME_RULE_CAUSALITY']);
  // (2) … a revealed (gated) object is not progress (a reveal is not an act)
  const viaReveal = approved({ id: 'R', scope: 'team', conditions: [{ kind: 'object_discovered', object: 'HIDDEN_LEVEL' }], effects: [{ kind: 'reach_world_state', state: 'W_FOUND' }] });
  assert.deepEqual(codes(validateApprovedRule(viaReveal, CAT, [])), ['RUNTIME_RULE_CAUSALITY']);
  // (3) … a state list that admits the initial state is not progress
  const viaInitial = approved({ id: 'I', scope: 'team', conditions: [{ kind: 'object_state', object: 'SEARCH_AREA', states: ['UNKNOWN', 'SEARCHED'] }], effects: [{ kind: 'reach_world_state', state: 'W_FOUND' }] });
  assert.deepEqual(codes(validateApprovedRule(viaInitial, CAT, [])), ['RUNTIME_RULE_CAUSALITY']);
  // (4) … a MINOR world state (reachable from evidence) is not progress
  const viaMinor = approved({ id: 'M', scope: 'team', conditions: [{ kind: 'world_state', state: 'W_MINOR' }], effects: [{ kind: 'reach_world_state', state: 'W_FOUND' }] });
  assert.deepEqual(codes(validateApprovedRule(viaMinor, CAT, [])), ['RUNTIME_RULE_CAUSALITY']);
  // but evidence may still open a small lead or reveal a place
  const small = approved({ id: 'S', scope: 'team', conditions: [{ kind: 'evidence_unlocked', evidence: 'T-CLUE' }], effects: [{ kind: 'open_lead', lead: 'L_ROUTE' }, { kind: 'reveal_object', object: 'HIDDEN_LEVEL' }] });
  assert.deepEqual(validateApprovedRule(small, CAT, []), []);
});

test('delivered material must be runtime-only (requires = {@RUNTIME}) so no player path can fetch it early', () => {
  const ok = approved({ id: 'D', scope: 'team', conditions: [{ kind: 'world_state', state: 'W_FOUND' }], effects: [{ kind: 'deliver_evidence', evidence: 'T-MED' }] });
  assert.deepEqual(validateApprovedRule(ok, CAT, []), []);
  const playerUnlockable = approved({ id: 'D2', scope: 'team', conditions: [{ kind: 'world_state', state: 'W_FOUND' }], effects: [{ kind: 'deliver_evidence', evidence: 'T-CLUE' }] });
  assert.deepEqual(codes(validateApprovedRule(playerUnlockable, CAT, [])), ['RUNTIME_RULE_CAUSALITY']);
});

test('causality: aftermath material can never cause the world state it follows (both directions)', () => {
  const aftermath = approved({ id: 'AFTER', scope: 'team', conditions: [{ kind: 'world_state', state: 'W_FOUND' }], effects: [{ kind: 'deliver_evidence', evidence: 'T-MED' }] });
  const inverted = approved({ id: 'INV', scope: 'team', conditions: [{ kind: 'object_discovered', object: 'SEARCH_AREA' }, { kind: 'evidence_unlocked', evidence: 'T-MED' }], effects: [{ kind: 'reach_world_state', state: 'W_FOUND' }] });
  assert.ok(codes(validateApprovedRule(inverted, CAT, [aftermath])).includes('RUNTIME_RULE_CAUSALITY'));
  assert.ok(codes(validateApprovedRule(aftermath, CAT, [inverted])).includes('RUNTIME_RULE_CAUSALITY'));
  const selfRef = approved({ id: 'SELF', scope: 'team', conditions: [{ kind: 'world_state', state: 'W_FOUND' }], effects: [{ kind: 'reach_world_state', state: 'W_FOUND' }] });
  assert.ok(codes(validateApprovedRule(selfRef, CAT, [])).includes('RUNTIME_RULE_CAUSALITY'));
});

test('scope: an actor (private) rule can never change the world or deliver material', () => {
  const raw: RawRule = { id: 'P', status: 'draft', scope: 'actor', conditions: [{ kind: 'object_discovered', object: 'SEARCH_AREA' }], effects: [{ kind: 'reach_world_state', state: 'W_FOUND' }, { kind: 'deliver_evidence', evidence: 'T-MED' }] };
  assert.deepEqual(codes(parseRule(raw).issues), ['RUNTIME_RULE_SCOPE', 'RUNTIME_RULE_SCOPE']);
});

test('references: reveal only gated objects; delivered material never on the legacy requires chain', () => {
  const r = approved({ id: 'R', scope: 'team', conditions: [{ kind: 'object_discovered', object: 'SEARCH_AREA' }], effects: [{ kind: 'reveal_object', object: 'SEARCH_AREA' }, { kind: 'deliver_evidence', evidence: 'T-OLD' }, { kind: 'open_lead', lead: 'L_NOPE' }] });
  assert.deepEqual(codes(validateApprovedRule(r, CAT, [])).sort(), ['RUNTIME_RULE_CAUSALITY', 'RUNTIME_RULE_REFERENCE', 'RUNTIME_RULE_REFERENCE']);
  // T-OLD sits on the legacy chain → not runtime-only
});

test('lint: a lead label must not name a node code (a lead points, it does not answer)', () => {
  const cat = { ...CAT, leads: new Map([['L_BAD', { label: 'check F-04 now' }]]) };
  assert.deepEqual(codes(lintRuleSet([], cat)), ['RUNTIME_LEAD_LABEL']);
});

// ------------------------------------------------------------
// projections
// ------------------------------------------------------------
test('runtime_state parsing is strict and fail-closed; pulses never reach the knowledge input', () => {
  const raw = {
    leads: [
      { lead: 'L_A', label: 'direction', status: 'open', shared: false, mine: true, opened_at: '2026-10-03T10:00:00Z' },
      { lead: 'L_LEAK', label: 'teammate private', status: 'open', shared: false, mine: false, opened_at: '2026-10-03T10:00:00Z' },
      { lead: 'bad code', label: 'x', status: 'open', shared: true, mine: false },
    ],
    world: [{ state: 'W1', headline: 'changed', reached_at: '2026-10-03T10:00:00Z' }, { state: 'W2' }],
    places: [{ code: 'P1', title: 'place', category: 'location', shared: true }],
    pulses: [{ id: '11111111-1111-4111-8111-111111111111', actor: null, category: 'RECORD', at: '2026-10-03T10:00:00Z' }],
    extra: 'ignored',
  };
  const m = parseRuntimeState(raw)!;
  assert.deepEqual(m.leads.map((l) => l.code), ['L_A'], 'a teammate’s private lead is dropped even if it arrived');
  assert.deepEqual(m.world.map((w) => w.code), ['W1']);
  assert.equal(m.pulses.length, 1);
  assert.equal(parseRuntimeState(null), null);
  assert.equal(parseRuntimeState([]), null);
  const k = runtimeKnowledgeInput(m)!;
  assert.ok(!('pulses' in k), 'knowledge input has no pulses');
  assert.equal(runtimeKnowledgeInput(null), null);
  assert.deepEqual(EMPTY_RUNTIME, { leads: [], world: [], places: [], pulses: [] });
});

test('037 absent is detected (not an error): PGRST202 / 42883 only', () => {
  assert.ok(isRuntimeNotInstalled({ code: 'PGRST202' }));
  assert.ok(isRuntimeNotInstalled({ code: '42883' }));
  assert.ok(!isRuntimeNotInstalled({ code: '42501' }));
  assert.ok(!isRuntimeNotInstalled(null));
});

test('existing systems project onto runtime nodes without new storage', () => {
  const rows = [
    { code: 'ROOM', category: 'location', discovered: true, is_shared: true, state: 'KNOWN' },
    { code: 'CUP', category: 'object', discovered: true, is_shared: false, state: 'DISCOVERED', processing: false },
    { code: 'LAB', category: 'object', discovered: true, is_shared: true, state: 'PROCESSING', processing: true },
    { code: 'OTHER', category: 'object', discovered: true, is_shared: false, state: 'HIDDEN' },
  ];
  const d = objectDiscoveries(rows, A);
  assert.deepEqual(d.map((x) => [x.node.kind, x.node.code, x.scope]), [['place', 'ROOM', 'team'], ['object', 'CUP', 'private'], ['object', 'LAB', 'team']]);
  assert.deepEqual(processingJobs(rows), [{ object: 'LAB', running: true }]);
  const t = timelineEvents([{ person_code: 'P', location_code: 'L', start_ck: 1400, end_ck: 1410, evidence_code: 'V-03' }, { person_code: 'P', location_code: 'L', start_ck: 9, end_ck: 1, evidence_code: 'V-03' }]);
  assert.deepEqual(t.map((x) => x.anchor), [{ kind: 'material', code: 'V-03' }]);
});
