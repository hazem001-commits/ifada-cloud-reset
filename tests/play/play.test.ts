// ============================================================
// tests/play/play.test.ts
// RESET-2 — طبقة اللعب الجماعي: الحضور/النبض، التسليم، الخيوط، العهدة،
// ومرآة العرض ↔ sql/038 (لا خريطة عرض تَعِد بخطوة لم تؤلّفها القاعدة).
// ⚠ fixtures TEST ONLY · NON-CANON (أسماء وأكواد اصطناعية حيث لا تلزم القضية).
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshSystemPulses, handoffFor, newPulseIds, presence, producedBy, PULSE_FRESH_MS, sinceLabel, specsOf, threadGroups } from '../../src/lib/play/model';
import { parseRuntimeState } from '../../src/lib/runtime/projection';
import { withCustody, entryFromEvidence, producedSources } from '../../src/app/case/[code]/casefile/caseFileModel';
import { objectStatus, privateAncestors } from '../../src/app/case/[code]/investigation/labels';
import { ROOM_714_PRESENTATION } from '../../src/cases/room-714/presentation';
import { ROOM_714_CONTRACT } from '../../src/cases/room-714/contract';
import { SCENE_17_CONTRACT } from '../../src/cases/scene-17/contract';
import { caseTabEnabled } from '../../src/app/case/[code]/caseTabs';
import type { LobbyMember } from '../../src/types/database';
import type { InvestigationObject } from '../../src/types/investigationObjects';
import type { Lead, Pulse } from '../../src/lib/runtime/types';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const NOW = Date.parse('2026-10-04T23:00:00Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MEMBERS: LobbyMember[] = [
  { userId: A, displayName: 'ليلى', specialization: 'field', isHost: true },
  { userId: B, displayName: 'عمر', specialization: 'digital', isHost: false },
];
const HOLDERS = { field: [A], forensics: [A], digital: [B], records: [B] };
const OPENING = ROOM_714_PRESENTATION.opening!;

// ------------------------------------------------------------
// presence / pulse
// ------------------------------------------------------------
test('presence: me first, real specialization coverage, live pulse = category + time only, never my own', () => {
  const pulses: Pulse[] = [
    { id: '11111111-1111-4111-8111-111111111111', actorId: B, category: 'DEVICE', at: at(20_000) },
    { id: '22222222-2222-4222-8222-222222222222', actorId: A, category: 'PERSON', at: at(5_000) },
  ];
  const p = presence(MEMBERS, HOLDERS, pulses, B, NOW);
  assert.deepEqual(p.map((x) => x.userId), [B, A], 'me first, stable order');
  assert.deepEqual(p[0]!.specs, ['digital', 'records']);
  assert.equal(p[0]!.live, null, 'my own discovery does not ripple on my tag');
  assert.deepEqual(p[1]!.live, { id: '22222222-2222-4222-8222-222222222222', category: 'PERSON', at: at(5_000) });
  assert.deepEqual(Object.keys(p[1]!.live!).sort(), ['at', 'category', 'id'], 'nothing but category and time');
  // a pulse older than the freshness window settles into the trail
  assert.equal(presence(MEMBERS, HOLDERS, [{ ...pulses[1]!, at: at(PULSE_FRESH_MS + 1) }], B, NOW)[1]!.live, null);
  assert.deepEqual(specsOf(A, null, 'field'), ['field'], 'before the server read: primary only');
});

test('system pulses (results arriving) and arrival detection by id only', () => {
  const sys: Pulse = { id: '33333333-3333-4333-8333-333333333333', actorId: null, category: 'PHYSICAL_TRACE', at: at(1000) };
  assert.equal(freshSystemPulses([sys], NOW).length, 1);
  assert.deepEqual(newPulseIds(new Set(), [sys]), [sys.id]);
  assert.deepEqual(newPulseIds(new Set([sys.id]), [sys]), []);
  assert.equal(sinceLabel(at(10_000), NOW), 'الآن');
  assert.match(sinceLabel(at(5 * 60_000), NOW), /^قبل .+ د$/);
});

// ------------------------------------------------------------
// handoff
// ------------------------------------------------------------
test('handoff names the teammate who holds the next capability; none when it is mine', () => {
  const toOmar = handoffFor(OPENING, 'LAPTOP', 'DISCOVERED', ['field', 'forensics'], HOLDERS, MEMBERS, A);
  assert.deepEqual(toOmar, { spec: 'digital', mine: false, teammates: [{ userId: B, name: 'عمر' }] });
  const mine = handoffFor(OPENING, 'LAPTOP', 'DISCOVERED', ['digital', 'records'], HOLDERS, MEMBERS, B);
  assert.equal(mine?.mine, true);
  assert.deepEqual(mine?.teammates, [], 'never lists myself');
  assert.equal(handoffFor(OPENING, 'GLASS_CUP', 'DISCOVERED', ['field'], HOLDERS, MEMBERS, A), null, 'nothing to hand off');
  assert.equal(handoffFor(undefined, 'LAPTOP', 'DISCOVERED', ['field'], HOLDERS, MEMBERS, A), null, 'no opening → no claims');
  assert.equal(producedBy(OPENING, 'BLOOD_STAIN', 'ANALYZED'), 'F-02');
  assert.equal(producedBy(OPENING, 'BLOOD_STAIN', 'PROCESSING'), null);
});

// ------------------------------------------------------------
// threads (leads)
// ------------------------------------------------------------
test('threads: my private insights first (only I know them), then team questions; closed ones settle', () => {
  const L = (code: string, shared: boolean, status: Lead['status'], ms: number): Lead => ({ code, label: code, status, shared, mine: !shared, openedAt: at(ms) });
  const g = threadGroups([L('L_TEAM_OLD', true, 'open', 9000), L('L_MINE', false, 'open', 5000), L('L_TEAM_NEW', true, 'followed', 1000), L('L_DONE', true, 'closed', 100)]);
  assert.deepEqual(g.live.map((l) => l.code), ['L_MINE', 'L_TEAM_NEW', 'L_TEAM_OLD']);
  assert.deepEqual(g.settled.map((l) => l.code), ['L_DONE']);
});

test('runtime_state: a TEAM lead arrives with mine = null (holder is NULL) and is kept; garbage still fails closed', () => {
  const model = parseRuntimeState({
    leads: [
      { lead: 'L714_ROOM', label: 'سؤال', status: 'open', shared: true, mine: null, opened_at: at(0) },
      { lead: 'L_X', label: 'x', status: 'open', shared: false, mine: null, opened_at: at(0) },
      { lead: 'L_Y', label: 'y', status: 'open', shared: true, mine: 'yes', opened_at: at(0) },
    ],
    world: [], places: [], pulses: [],
  });
  assert.deepEqual(model?.leads.map((l) => [l.code, l.mine]), [['L714_ROOM', false]], 'team lead kept as not-mine; unowned private / bad shape dropped');
});

// ------------------------------------------------------------
// sharing a nested private find carries its private parents
// ------------------------------------------------------------
test('sharing a find inside my unshared find shares the parent chain first (top-down), never a teammate’s', () => {
  const o = (code: string, parent: string | null, discovered: boolean, shared: boolean, state = 'DISCOVERED', category = 'object'): InvestigationObject =>
    ({ code, parent_code: parent, category, title: code, description: '', state, discovered, is_shared: shared, processing: false, actions: [] }) as InvestigationObject;
  const objects = [
    o('ROOM', null, true, true, 'KNOWN', 'location'),
    o('ITEMS', 'ROOM', true, false),
    o('PASSPORT', 'ITEMS', true, false),
    o('THEIRS', 'ROOM', true, false, 'HIDDEN'),
    o('KID', 'THEIRS', true, false),
  ];
  assert.deepEqual(privateAncestors(objects, 'PASSPORT').map((x) => x.code), ['ITEMS']);
  assert.deepEqual(privateAncestors(objects, 'ITEMS').map((x) => x.code), [], 'the location is never shared');
  assert.deepEqual(privateAncestors(objects, 'KID').map((x) => x.code), [], 'a teammate’s private find is not mine to share');
});

// ------------------------------------------------------------
// Case File custody
// ------------------------------------------------------------
test('custody: how (authored, wins over the generic source phrase) + who (runtime provenance actor I can see)', () => {
  const ev = (code: string) => ({ code, title: code, kind: 'document' as const, owner_spec: 'forensics' as const, clock_label: null, body: 'b', has_media: false, readable: true, unlocked_at: at(0) });
  const entries = [entryFromEvidence(ev('F-02')), entryFromEvidence(ev('D-01'), { evidence_code: 'D-01', object_code: 'LAPTOP', object_title: 'لابتوب', object_category: 'device' })];
  const out = withCustody(entries, OPENING.custody, [{ node_kind: 'evidence', node_code: 'F-02', actor_id: A }], new Map([[A, 'ليلى']]));
  assert.equal(out[0]!.provenance, OPENING.custody['F-02']);
  assert.equal(out[0]!.custodian, 'ليلى');
  assert.equal(out[1]!.provenance, OPENING.custody['D-01'], 'authored custody wins over "مصدرها: …"');
  assert.equal(out[1]!.custodian, null, 'no provenance row → no claimed custodian');
});

test('produced sources: the material (not the object) becomes the Case File entry — only for objects I can see in that state', () => {
  const o = (code: string, state: string, discovered: boolean, shared: boolean) =>
    ({ code, parent_code: 'ROOM_714', category: 'object', title: code, description: '', state, discovered, is_shared: shared, processing: false, actions: [] }) as InvestigationObject;
  const out = producedSources([o('PASSPORT', 'RECORDS_QUERIED', true, true), o('BLOOD_STAIN', 'HIDDEN', true, false), o('LAPTOP', 'INSPECTED', true, true)], OPENING.produces, []);
  assert.deepEqual(out.map((x) => [x.evidence_code, x.object_code]), [['R-01', 'PASSPORT']], 'teammate-private (HIDDEN) and not-yet-producing states give nothing');
  assert.deepEqual(producedSources([o('LAPTOP', 'DRAFT_RECOVERED', true, true)], OPENING.produces, [{ evidence_code: 'D-01', object_code: 'LAPTOP', object_title: 'x', object_category: 'device' }]), [], 'a recorded source is never duplicated');
});

// ------------------------------------------------------------
// presentation ↔ 038 mirror (no promise the database does not author)
// ------------------------------------------------------------
const S38 = readFileSync('sql/038_room714_opening_runtime.sql', 'utf8').replace(/--.*$/gm, '');
function interactionsOf(code: string): { spec: string; requires_state: string; code: string }[] {
  const m = S38.match(new RegExp(`set interactions = '(\\[[^']*\\])'::jsonb[^;]*?code = '${code}'`));
  return m ? JSON.parse(m[1]!) : [];
}

test('every handoff in the presentation is a real authored next step of that specialization', () => {
  for (const [object, states] of Object.entries(OPENING.handoffs)) {
    for (const [state, spec] of Object.entries(states)) {
      const viaInteraction = interactionsOf(object).some((i) => i.requires_state === state && i.spec === spec);
      // challenges authored before 038 (025): passport → records lookup, door → digital access log
      const viaChallenge = (object === 'PASSPORT' && state === 'DISCOVERED' && spec === 'records') || (object === 'DOOR_714' && state === 'DISCOVERED' && spec === 'digital');
      assert.ok(viaInteraction || viaChallenge, `${object}@${state} → ${spec}`);
    }
  }
});

test('every produced/custody claim matches a 038 delivery rule; leads point only to authored leads', () => {
  for (const [object, states] of Object.entries(OPENING.produces)) {
    for (const [state, evidence] of Object.entries(states)) {
      assert.match(S38, new RegExp(`"object":"${object}","states":\\["${state}"\\]\\}\\]',\\s*'\\[\\{"kind":"deliver_evidence","evidence":"${evidence}"\\}\\]'`), `${object}@${state} → ${evidence}`);
    }
  }
  for (const code of Object.keys(OPENING.custody)) {
    assert.ok(code === 'V-01' || new RegExp(`deliver_evidence","evidence":"${code}"`).test(S38), `custody for ${code} must be world-delivered (or the briefing)`);
  }
  for (const lead of Object.keys(OPENING.leadPointers)) assert.match(S38, new RegExp(`'room-714', '${lead}'`), lead);
});

// ------------------------------------------------------------
// world discovery only (no evidence shop, no advertised future material)
// ------------------------------------------------------------
test('Room 714 retires the legacy unlock list; Scene 17 is unchanged', () => {
  assert.equal(ROOM_714_CONTRACT.worldDiscoveryOnly, true);
  assert.equal(caseTabEnabled('evidence', ROOM_714_CONTRACT), false);
  assert.equal(caseTabEnabled('casefile', ROOM_714_CONTRACT), true);
  assert.notEqual(SCENE_17_CONTRACT.worldDiscoveryOnly, true);
  const automation = readFileSync('src/app/case/[code]/CaseAutomation.tsx', 'utf8');
  assert.match(automation, /expiring=\{worldOnly \? \[\] : expiring\}/, 'no "timed opportunity" names undiscovered material');
  assert.match(automation, /if \(worldOnly\) return;/, 'the expiring list is not even fetched');
  const workspace = readFileSync('src/app/case/[code]/CaseWorkspace.tsx', 'utf8');
  assert.match(workspace, /worldOnly \? Promise\.resolve\(\{ data: \[\], error: null \}\) : supabase\.rpc\("unlockable_evidence"/, 'later-chapter titles never reach the browser');
});

test('everyone investigates: specialization is capability, never sight', () => {
  // the briefing promises the same world to everyone; capability lines describe what you DO
  for (const sp of ['field', 'forensics', 'digital', 'records'] as const) {
    const line = OPENING.capabilities[sp];
    assert.ok(line, sp);
    assert.doesNotMatch(line!, /تلاحظ|ترى|لا ترى/, `${sp}: a capability line never claims exclusive sight`);
  }
  assert.match(readFileSync('src/app/case/[code]/play/CaseBriefing.tsx', 'utf8'), /كلكم ترون الغرفة نفسها/);
  // noticing is never a handoff: hand-offs start only after something is found
  for (const [code, states] of Object.entries(OPENING.handoffs)) assert.ok(!('UNKNOWN' in states), `${code}: nobody needs a teammate to notice it`);
  // an undiscovered thing with no action for me is neutral — never "outside your notice"
  const st = objectStatus({ code: 'X', discovered: false, actions: [] } as unknown as InvestigationObject);
  assert.doesNotMatch(st.label + st.hint, /ملاحظتك|عينك|يفوتك/);
});

test('capability lines are capabilities, not content (no codes, names or facts)', () => {
  for (const line of Object.values(OPENING.capabilities)) {
    assert.ok(!/[A-Z]-\d{2}|رامي|كريم|نبيل|يارا|سارة|23:|00:/.test(line!), line);
  }
  for (const p of Object.values(OPENING.leadPointers)) assert.ok(!/[A-Z]-\d{2}/.test(p.label));
});
