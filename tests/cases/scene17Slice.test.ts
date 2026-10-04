// ============================================================
// tests/cases/scene17Slice.test.ts
// شريحة التطوير الحقيقية للمشهد 17 (sql/036 — قيد المراجعة).
//
// قسمان منفصلان عمداً:
//   REAL REVIEWED SLICE CONFIG — يُقرأ من الملفات الحقيقية: 036، عقد
//     القضية، قنوات السيرفر، ربط الوسائط، وملفا التحقق.
//   NON-CANON TEST MODEL — لا Postgres محلي: نموذج لقاعدة 035 فوق إعداد
//     الشريحة الحقيقي + طبقة المستهلكين الحقيقية (بحث/معرفة/لوحة).
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getCaseContract, getCasePresentation } from '../../src/cases/registry';
import { channelPlanFor } from '../../src/cases/contract';
import { SCENE_17_CHANNELS, SCENE_17_SHARED_EVIDENCE } from '../../src/server/cases/scene-17/channels';
import { readablePrivateEvidence } from '../../src/server/cases/registry';
import { buildEntries } from '../../src/app/case/[code]/casefile/caseFileModel';
import { caseTabEnabled, investigationTabLabel } from '../../src/app/case/[code]/caseTabs';
import { devSessionGuard } from '../../src/server/cases/devSession';
import { visibleEvidenceRows } from '../../src/lib/evidenceVisibility';
import { buildCorpus, searchCorpus, type EvidenceRow } from '../../src/lib/inquiry/search';
import { queryTerms } from '../../src/lib/inquiry/normalize';
import { buildAuthorizedKnowledge } from '../../src/lib/ai/knowledge';
import { pinEligibility, resolveMaterial, type ViewerCatalog } from '../../src/app/case/[code]/board/boardModel';
import { canContribute, contributionLabel } from '../../src/app/case/[code]/board/jointModel';
import type { EvidenceItem } from '../../src/types/case';

const S36 = readFileSync('sql/036_scene17_vertical_slice_DEV.sql', 'utf8').replace(/\r\n/g, '\n');
const PRE = readFileSync('sql/verify_036_preapply.sql', 'utf8');
const POST = readFileSync('sql/verify_036_postapply.sql', 'utf8');
const LIVE = readFileSync('sql/verify_036_live_slice.sql', 'utf8');
const code = (s: string) => s.replace(/--[^\n]*/g, '');
const body = (tag: string) => {
  const open = `$${tag}$`;
  const a = S36.indexOf(open) + open.length;
  return S36.slice(a, S36.indexOf(open, a));
};
const SLICE = { E05: body('e05'), E06: body('e06'), E07: body('e07'), E10: body('e10') } as const;
// 036 §0b: the open_case replacement, from its header to its grant (comments stripped)
const OPEN_CASE_BLOCK = (() => {
  const c = code(S36);
  const a = c.indexOf('create or replace function public.open_case(p_session uuid)');
  const end = 'grant execute on function public.open_case(uuid) to authenticated;';
  return c.slice(a, c.indexOf(end, a) + end.length);
})();
// media-mapping.mjs is untyped JS: read its entries as text (same approach as the existing mapping tests)
const MAPPINGS = [...readFileSync('scripts/lib/media-mapping.mjs', 'utf8').matchAll(/caseId: '([^']+)',\s*evidenceCode: '([^']+)',\s*sourceFile: '([^']+)',\s*targetPath: '([^']+)'/g)]
  .map((m) => ({ caseId: m[1]!, evidenceCode: m[2]!, sourceFile: m[3]!, targetPath: m[4]! }));
type Code = keyof typeof SLICE;
const LANE: Record<Code, string | null> = { E05: null, E06: 'A', E07: 'A', E10: 'B' };

// ============================================================
// REAL REVIEWED SLICE CONFIG
// ============================================================
test('REAL: 036 seeds exactly E05 (shared) + E06/E07 (A) + E10 (B) — and the server channel map agrees', () => {
  const inserted = [...code(S36).matchAll(/\('scene-17', '(E\d\d)', '/g)].map((m) => m[1]);
  assert.deepEqual(inserted, ['E05', 'E06', 'E07', 'E10']);
  assert.match(S36, /from \(values \('E06', 'A'\), \('E07', 'A'\), \('E10', 'B'\)\) m\(code, channel\)/);
  assert.ok((SCENE_17_SHARED_EVIDENCE as readonly string[]).includes('E05'), 'E05 is shared in the authored distribution');
  for (const [c, lane] of Object.entries(LANE)) {
    if (lane) assert.ok(SCENE_17_CHANNELS.find((ch) => ch.id === lane)!.evidence.includes(c), `${c} ∈ ${lane}`);
  }
});

test('REAL: canon gate — no conflicted/HOLD/missing item, chapter-1 only, no Room 714 contamination, no IFADA branding', () => {
  for (const bad of ['E01', 'E03', 'E04', 'E13', 'E16', 'E18', 'E19', 'E20', 'E22', 'E30', 'E31', 'E32', 'E33', 'E34', 'E35', 'E36', 'E37', 'E38']) {
    assert.ok(!new RegExp(`'${bad}'`).test(code(S36)), `${bad} must not be seeded`);
  }
  for (const [c, b] of Object.entries(SLICE)) {
    for (const contamination of ['الخطيب', 'M1', '714', 'IFADA', 'فندق', 'رامي', '2025', '2026', '2024']) {
      assert.ok(!b.includes(contamination), `${c} body contains ${contamination}`);
    }
  }
  assert.match(S36, /'E10', 'سجل أحداث نظام الصوت', 'record'/);
});

test('REAL: no invented capability owner — owner_spec NULL on all four rows; all initial; no requires', () => {
  const rows = [...code(S36).matchAll(/\('scene-17', '(E\d\d)', '[^']+', '(\w+)', (null|'\w+'), ([^,]+), (true|false), '\{\}', (\d+),/g)];
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r[3] === 'null'), 'owner_spec NULL: canon assigns no capability owner');
  assert.ok(rows.every((r) => r[5] === 'true'), 'chapter-1 slice: unlocked at open');
  assert.ok(!/'field'|'digital'|'forensics'|'records'/.test(code(S36)), 'no specialization literal anywhere in 036');
  // the one generic schema step that allows it — and its verification
  assert.match(code(S36), /alter table public\.evidence alter column owner_spec drop not null;/);
  assert.match(POST, /e\.owner_spec is null and e\.is_initial/);
  assert.match(POST, /R6 room-714 every evidence row keeps its owner_spec/);
  assert.match(POST, /V11 NULL owner_spec only in channel-distributed cases/);
  assert.match(PRE, /P3e room-714 every evidence row has an owner_spec/);
  // NULL fails closed only while has_specialization can never return NULL — proven on live before apply
  assert.match(PRE, /P1f has_specialization is non-STRICT \+ EXISTS-based/);
  assert.match(PRE, /not p\.proisstrict/);
  // the ALTER never queues behind a long reader on live
  assert.ok(code(S36).indexOf("set lock_timeout = '5s';") >= 0 && code(S36).indexOf("set lock_timeout = '5s';") < code(S36).indexOf('alter table public.evidence'));
});

test('REAL: exact 2-player seat plan = the case contract plan = 036 seats', () => {
  const plan = channelPlanFor(getCaseContract('scene-17')!.distribution, 2);
  assert.deepEqual(plan, [['A', 'C', 'E', 'H'], ['B', 'D', 'F', 'G']]);
  const seats = [...S36.matchAll(/\('scene-17', 2, (\d), '([A-H])'\)/g)].map((m) => `${m[1]}:${m[2]}`).sort();
  assert.deepEqual(seats, ['1:A', '1:C', '1:E', '1:H', '2:B', '2:D', '2:F', '2:G']);
  assert.ok(!/\('scene-17', [3-8], /.test(S36), 'no other player count → CHANNEL_PLAN_MISSING (fail closed)');
  assert.match(S36, /insert into public\.case_engine_policy \(case_id, restricted_evidence, distribution\)\s*values \('scene-17', 'hidden', 'channels'\)/);
});

test('REAL: data + one nullability relaxation + open_case hardening only, idempotent, guarded; no rules / objects / entities / 029-030 / Room 714', () => {
  // the only DDL: owner_spec DROP NOT NULL (+ its column comment) and the §0b open_case block — cut out before the scan
  assert.equal((code(S36).toLowerCase().match(/alter table|comment on/g) ?? []).length, 2, 'exactly one ALTER + one COMMENT');
  assert.equal((code(S36).toLowerCase().match(/create or replace function/g) ?? []).length, 1, 'exactly one function: open_case');
  const c = code(S36)
    .toLowerCase()
    .replace(OPEN_CASE_BLOCK.toLowerCase(), '')
    .replace('alter table public.evidence alter column owner_spec drop not null;', '')
    .replace(/comment on column public\.evidence\.owner_spec is\s*'[^']*';/, '');
  for (const bad of ['create function', 'create or replace', 'grant ', 'revoke ', 'create policy', 'alter ', 'drop ', 'comment on', 'set not null', 'delete from', 'update ',
    'case_connection_rules', 'investigation_objects', 'investigation_challenges', 'case_entities', 'case_channel_plans', "'room-714'"]) {
    assert.ok(!c.includes(bad), bad);
  }
  assert.ok(!/(?<!case_)evidence_channels/.test(c), '029 table never referenced (035 uses case_evidence_channels)');
  assert.equal((c.match(/insert into/g) ?? []).length, 5);
  assert.equal((c.match(/on conflict/g) ?? []).length, 5, 'every insert is idempotent');
  assert.match(S36, /raise exception 'SCENE17_NOT_EMPTY'/);
  assert.match(S36, /raise exception 'SCENE17_POLICY_CONFLICT'/);
});

test('REAL: 036 parses — every dollar-quote tag is paired, and no lone $ delimiter exists', () => {
  const tags = [...S36.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)?\$/g)].map((m) => m[0]);
  const counts = new Map<string, number>();
  for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  assert.deepEqual([...counts.entries()].filter(([, n]) => n % 2 !== 0), [], 'unpaired dollar-quote tag');
  assert.deepEqual([...counts.keys()].sort(), ['$$', '$e05$', '$e06$', '$e07$', '$e10$']);
  assert.equal(counts.get('$$'), 4, 'guard DO block + open_case body');
  // outside dollar-quoted bodies, a $ may only be part of a tag
  const outside = S36.replace(/\$([A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, '');
  assert.ok(!outside.includes('$'), 'lone $ outside any dollar-quoted body');
});

test('REAL: verifiers — single read-only SELECT; post-apply text hashes are the reviewed 036 bodies', () => {
  for (const [name, sql] of [['pre', PRE], ['post', POST], ['live', LIVE]] as const) {
    const stmt = sql.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''").toLowerCase();
    assert.equal((stmt.match(/;/g) ?? []).length, 1, name);
    assert.match(stmt.trim(), /^with[\s\S]*order by ord, check_name;$/, name);
    for (const bad of ['insert ', 'update ', 'delete ', 'drop ', 'alter ', 'create ', 'grant ', 'revoke ', 'truncate', 'perform ']) assert.ok(!stmt.includes(bad), `${name}: ${bad}`);
  }
  for (const [c, b] of Object.entries(SLICE)) {
    const md5 = createHash('md5').update(b, 'utf8').digest('hex');
    assert.ok(POST.includes(`'${c}'`) && POST.includes(`'${md5}'`), `${c} hash ${md5}`);
  }
});

test('REAL: media — case-scoped mappings for E05/E06/E07 only, private bucket paths, matching the verifier; E10 has no file', () => {
  const s17 = (MAPPINGS as { caseId: string; evidenceCode: string; sourceFile: string; targetPath: string }[]).filter((m) => m.caseId === 'scene-17');
  assert.deepEqual(s17.map((m) => `${m.evidenceCode}→${m.targetPath}`), ['E05→scene-17/E05.pdf', 'E06→scene-17/E06.pdf', 'E07→scene-17/E07.png']);
  for (const m of s17) {
    assert.ok(m.sourceFile.startsWith('private-evidence/scene-17/'), m.sourceFile);
    assert.ok(POST.includes(`'${m.targetPath}'`), m.targetPath);
  }
  assert.ok(!(MAPPINGS as { caseId: string }[]).some((m) => m.caseId === 'room-714' && /scene-17/.test(JSON.stringify(m))), 'no Scene 17 asset in a Room 714 mapping');
  const route = readFileSync('src/app/api/evidence-media/route.ts', 'utf8');
  assert.match(route, /\.eq\("case_id", session\.case_id\)/, 'media resolved inside the session’s own case only');
});

test('REAL: contract — still development; only the slice systems; tabs gated; Room 714 unchanged', () => {
  const s = getCaseContract('scene-17');
  const r = getCaseContract('room-714');
  assert.equal(s!.status, 'development');
  const tabs = ['investigation', 'casefile', 'board', 'evidence', 'interrogation', 'reconstruction', 'hearing'] as const;
  assert.deepEqual(tabs.filter((t) => caseTabEnabled(t, s)), ['investigation', 'casefile', 'board', 'evidence']);
  // RESET-2: Room 714 keeps every tab except the legacy "old evidence" unlock list (evidence is discovered in the world)
  assert.deepEqual(tabs.filter((t) => caseTabEnabled(t, r)), tabs.filter((t) => t !== 'evidence'), 'Room 714 keeps every tab but the legacy archive');
  assert.equal(investigationTabLabel(s), 'اسأل التحقيق', 'no fake "place" for a case without a scene');
  assert.equal(investigationTabLabel(r), 'المكان');
  const pres = JSON.stringify(getCasePresentation('scene-17'));
  assert.ok(!/غرفة 714|فندق|نزيل|رامي/.test(pres));
});

test('REAL: dev session — next dev + development case + valid spec only; never production, never a playable case, never an entitlement', () => {
  assert.deepEqual(devSessionGuard({ nodeEnv: 'production', caseId: 'scene-17', specialization: 'field' }), { ok: false, status: 404 });
  assert.deepEqual(devSessionGuard({ nodeEnv: 'test', caseId: 'scene-17', specialization: 'field' }), { ok: false, status: 404 });
  assert.deepEqual(devSessionGuard({ nodeEnv: 'development', caseId: 'room-714', specialization: 'field' }), { ok: false, status: 404 }, 'no entitlement bypass for a playable case');
  assert.deepEqual(devSessionGuard({ nodeEnv: 'development', caseId: 'ghost', specialization: 'field' }), { ok: false, status: 404 });
  assert.deepEqual(devSessionGuard({ nodeEnv: 'development', caseId: 'scene-17', specialization: 'wizard' }), { ok: false, status: 400 });
  assert.deepEqual(devSessionGuard({ nodeEnv: 'development', caseId: 'scene-17', specialization: 'digital' }), { ok: true, caseId: 'scene-17', specialization: 'digital' });
  const route = readFileSync('src/app/api/dev/session/route.ts', 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.ok(route.indexOf("process.env.NODE_ENV !== 'development'") < route.indexOf('request.json()'), 'environment first');
  assert.ok(route.indexOf('auth.getUser()') < route.indexOf('createServiceClient()'), 'authenticated before any service-role client');
  assert.ok(!/entitlements/.test(route), 'never writes an entitlement');
  assert.ok(!/from\('cases'\)\.update|is_published/.test(route));
  const archive = readFileSync('src/app/page.tsx', 'utf8');
  assert.match(archive, /dev: process\.env\.NODE_ENV === 'development' && getCaseContract\(c\.id\)\?\.status === 'development'/);
});

// ============================================================
// NON-CANON TEST MODEL — 035 readability over the REAL slice config
// (players are synthetic; the evidence texts are the real reviewed bodies)
// ============================================================
const SEATS = channelPlanFor(getCaseContract('scene-17')!.distribution, 2)!;
// The LIVE allocator shape for 2 players: join_session refuses a taken
// specialization until all four are covered, then assign_session_specializations
// spreads the rest — so live players never share one. (Same specialization +
// different channels is proven synthetically in dualCase.test.ts, not here.)
const PLAYERS = {
  A: { seat: 0, specs: ['field', 'forensics'] },
  B: { seat: 1, specs: ['digital', 'records'] },
} as const;
const OWNER: Record<Code, EvidenceItem['owner_spec']> = { E05: null, E06: null, E07: null, E10: null }; // = 036
/** Room 714 rule, as a counterfactual: has_specialization(owner_spec). NULL never matches. */
const specRuleGrants = (p: keyof typeof PLAYERS, c: Code) => OWNER[c] !== null && (PLAYERS[p].specs as readonly string[]).includes(OWNER[c]!);
function indexFor(p: keyof typeof PLAYERS): (EvidenceRow & EvidenceItem)[] {
  const mine = SEATS[PLAYERS[p].seat]!;
  // 035: shared lane → every member; channel row → holders only; non-holders get NO row (hidden policy)
  return (Object.keys(SLICE) as Code[])
    .filter((c) => LANE[c] === null || mine.includes(LANE[c]!))
    .map((c) => ({ code: c, title: c, kind: 'document', owner_spec: OWNER[c], clock_label: null, body: SLICE[c], has_media: false, readable: true, unlocked_at: '' }) as EvidenceRow & EvidenceItem);
}
const POLICY = getCaseContract('scene-17')!.restrictedEvidence;

test('MODEL (live shape): readability follows the channel — not owner_spec, not the player’s specializations', () => {
  // live limitation, stated not hidden: the two players hold disjoint specializations covering all four
  assert.deepEqual([...PLAYERS.A.specs, ...PLAYERS.B.specs].sort(), ['digital', 'field', 'forensics', 'records']);
  assert.deepEqual(indexFor('A').map((e) => e.code), ['E05', 'E06', 'E07']);
  assert.deepEqual(indexFor('B').map((e) => e.code), ['E05', 'E10']);
  assert.deepEqual(visibleEvidenceRows(indexFor('B'), POLICY).map((e) => e.code), ['E05', 'E10'], 'no count / no placeholder for A’s lane');
  // the explicit assertion (mirrors sql/verify_036_live_slice.sql L5–L7):
  for (const p of ['A', 'B'] as const) {
    for (const e of indexFor(p)) assert.equal(specRuleGrants(p, e.code as Code), false, `${p} reads ${e.code} although its specializations do not match owner_spec`);
  }
  assert.equal(OWNER.E06, OWNER.E10, 'same owner_spec …');
  assert.notDeepEqual(
    (['A', 'B'] as const).filter((p) => indexFor(p).some((e) => e.code === 'E06')),
    (['A', 'B'] as const).filter((p) => indexFor(p).some((e) => e.code === 'E10')),
    '… different readers: owner_spec cannot be the decider',
  );
  assert.match(LIVE, /L6 /);
  assert.match(LIVE, /does NOT prove "same specialization \+ different channels"/);
});

test('MODEL: grounded search isolation with real phrases — own lane found, other lane zero, shared for both', () => {
  const corpus = (p: keyof typeof PLAYERS) => buildCorpus({ evidence: indexFor(p), objects: [], subjects: [], log: [] }, POLICY);
  // same normalization as a real typed query (queryTerms)
  const hit = (p: keyof typeof PLAYERS, query: string) => searchCorpus(corpus(p), queryTerms(query)).map((r) => r.ref.code);
  assert.ok(hit('A', 'الكتف').includes('E06'), 'A finds E06');
  assert.deepEqual(hit('B', 'الكتف'), [], 'B: zero for A’s private phrase');
  assert.ok(hit('B', 'UNNAMED').includes('E10'), 'B finds E10');
  assert.deepEqual(hit('A', 'UNNAMED'), [], 'A: zero for B’s private phrase');
  for (const p of ['A', 'B'] as const) assert.ok(hit(p, 'جود').includes('E05'), `${p} finds shared E05`);
  assert.ok(!JSON.stringify(corpus('B')).includes('E06') && !JSON.stringify(corpus('A')).includes('E10'));
});

test('MODEL: AI knowledge isolation — each player’s facts are their own lane + shared only', () => {
  const facts = (p: keyof typeof PLAYERS) =>
    buildAuthorizedKnowledge({ caseId: 'scene-17', restrictedEvidence: POLICY, evidence: indexFor(p), objects: [], subjects: [], log: [], validatedConnections: [], interrogationLayers: [], tools: [], challengeCodes: [], connectionsEnabled: true })
      .facts.map((f) => f.id).sort();
  assert.deepEqual(facts('A'), ['evidence:E05', 'evidence:E06', 'evidence:E07']);
  assert.deepEqual(facts('B'), ['evidence:E05', 'evidence:E10']);
});

test('REAL: private-lane guidance = my readable codes ∩ authored channels only (never a teammate’s, never Room 714)', () => {
  const rows = (p: keyof typeof PLAYERS) => indexFor(p).map((e) => ({ code: e.code, readable: e.readable }));
  assert.deepEqual(readablePrivateEvidence('scene-17', rows('A')), ['E06', 'E07']);
  assert.deepEqual(readablePrivateEvidence('scene-17', rows('B')), ['E10']);
  // a title-only / unreadable row never comes back, even if it is laned
  assert.deepEqual(readablePrivateEvidence('scene-17', [{ code: 'E10', readable: false }, { code: 'E05', readable: true }]), []);
  assert.deepEqual(readablePrivateEvidence('room-714', [{ code: 'F-01', readable: true }, { code: 'E06', readable: true }]), [], 'spec-distributed case: no guidance, unchanged');
  assert.deepEqual(readablePrivateEvidence('ghost', rows('A')), []);
  const route = readFileSync('src/app/api/private-evidence/route.ts', 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.match(route, /auth\.getUser\(\)/);
  assert.match(route, /rpc\("evidence_index", \{ p_session: sessionId \}\)/, 'readability from the player’s own evidence_index');
  assert.ok(!/createServiceClient|media_path/.test(route), 'no service role, no storage path');
});

test('MODEL: private pin UX — a server-marked private item is never offered for pinning, stays contributable; Case File hides the pin too', () => {
  const guided = (p: keyof typeof PLAYERS): ViewerCatalog => ({
    caseId: 'scene-17', policy: POLICY, evidence: indexFor(p), objects: [],
    privateEvidence: readablePrivateEvidence('scene-17', indexFor(p)),
  });
  assert.deepEqual(pinEligibility('evidence', 'E06', guided('A')), { status: 'private', code: 'E06' });
  assert.deepEqual(pinEligibility('evidence', 'E10', guided('B')), { status: 'private', code: 'E10' });
  assert.equal(pinEligibility('evidence', 'E05', guided('A')).status, 'server_decides', 'shared lane stays pinnable (server accepts)');
  assert.equal(pinEligibility('evidence', 'E10', guided('A')).status, 'unavailable', 'teammate lane: nothing');
  assert.equal(canContribute(resolveMaterial({ kind: 'evidence', code: 'E06' }, guided('A'))), true, 'still contributable privately');
  const entries = buildEntries(indexFor('A'), [], [], {}, readablePrivateEvidence('scene-17', indexFor('A')));
  assert.deepEqual(entries.filter((e) => e.channelPrivate).map((e) => e.code), ['E06', 'E07']);
  assert.ok(entries.every((e) => e.origin === null), 'no "ضمن اختصاص …" line for a NULL owner_spec');
  for (const f of ['Spotlight.tsx', 'DossierFrame.tsx']) {
    assert.match(readFileSync(`src/app/case/[code]/casefile/${f}`, 'utf8'), /\{!entry\.channelPrivate && <PinAction /, f);
  }
  const board = readFileSync('src/app/case/[code]/board/InvestigationBoard.tsx', 'utf8');
  assert.match(board, /status === 'private' \|\| refusedPins\.has\(v\.code\) \?/, 'board tray: label, not a pin button');
});

test('REAL: archive — a development case shows title / code / status only (no disputed victim or date); Room 714 card unchanged', () => {
  const archive = readFileSync('src/app/page.tsx', 'utf8');
  const devStart = archive.indexOf("if (getCaseContract(c.id)?.status === 'development') {");
  assert.ok(devStart > 0);
  const devCard = archive.slice(devStart, archive.indexOf('</li>', devStart));
  assert.ok(!/victim_name|incident_date|classification|duration_minutes|min_players/.test(devCard), 'no unresolved canon field on a development card');
  assert.match(devCard, /قيد التطوير/);
  assert.match(devCard, /\{c\.title\}/);
  const normal = archive.slice(archive.indexOf('</li>', devStart));
  assert.match(normal, /الضحية: \{c\.victim_name\}/, 'playable cards keep their fields');
  assert.match(normal, /\{c\.incident_date\}/);
  assert.equal(getCaseContract('room-714')!.status, 'playable');
});

test('MODEL: board + joint — shared E05 offered (server decides), private lane contributable, teammate sees only a masked contribution', () => {
  const cat = (p: keyof typeof PLAYERS): ViewerCatalog => ({ caseId: 'scene-17', policy: POLICY, evidence: indexFor(p), objects: [] });
  assert.equal(pinEligibility('evidence', 'E05', cat('A')).status, 'server_decides', 'shared lane: 035 accepts');
  assert.equal(pinEligibility('evidence', 'E06', cat('A')).status, 'server_decides', 'no guidance yet (fallback): 035 refuses, the refusal is then remembered');
  assert.equal(pinEligibility('evidence', 'E06', cat('B')).status, 'unavailable', 'absent for the non-holder');
  assert.equal(canContribute(resolveMaterial({ kind: 'evidence', code: 'E06' }, cat('A'))), true);
  assert.equal(canContribute(resolveMaterial({ kind: 'evidence', code: 'E10' }, cat('A'))), false);
  const masked = contributionLabel({ contributor: 'a', mine: false, ref: null }, cat('B'), () => 'لاعب أ');
  assert.equal(masked.primary, 'مساهمة من زميل');
  const leaked = contributionLabel({ contributor: 'a', mine: false, ref: { kind: 'evidence', id: 'E06' } }, cat('B'), () => 'لاعب أ');
  assert.equal(leaked.primary, 'مساهمة من زميل', 'even a ref resolves to nothing for B');
});

// ============================================================
// open_case privacy (036 §0b). 004 returned the rows THIS call inserted —
// under channels + hidden that counted a teammate's private initial rows,
// and 0-vs-N revealed who opened first. Now: caller-visible initial count.
// ============================================================
const S04 = readFileSync('sql/004_evidence.sql', 'utf8').replace(/\r\n/g, '\n');
const squashSql = (s: string) => code(s).replace(/\s+/g, ' ').trim();

test('REAL: open_case §0b — same signature/return/definer/grants; insert verbatim 004; ONE return = caller-visible initial count', () => {
  const f = OPEN_CASE_BLOCK;
  assert.ok(f.length > 0);
  assert.match(f, /^create or replace function public\.open_case\(p_session uuid\)\s+returns integer\s+language plpgsql\s+security definer\s+set search_path = public\nas \$\$\n[\s\S]*\nend;\n\$\$;\n/, 'real $$ body delimiters (a lone $ does not parse)');
  // membership first (direct RPC by a non-member stops here)
  assert.ok(f.indexOf("if not public.is_session_member(p_session) then") < f.indexOf('insert into'));
  // the insert is exactly 004's (Room 714 unlock timing / initial loading unchanged)
  const ins = (s: string) => squashSql(s.slice(s.indexOf('insert into public.session_evidence', s.indexOf('function public.open_case')), s.indexOf('on conflict do nothing;', s.indexOf('function public.open_case')) + 23));
  assert.equal(ins(f), ins(S04));
  // the only result: rows THIS caller can see (035 row visibility), never the inserted-row count
  assert.equal((f.match(/\breturn\b/g) ?? []).length, 1, 'exactly one return');
  assert.match(f, /return v_visible;/);
  assert.match(squashSql(f), /select count\(\*\)::integer into v_visible from public\.session_evidence se join public\.evidence e on e\.id = se\.evidence_id where se\.session_id = p_session and e\.case_id = v_case and e\.is_initial and public\._evidence_row_visible\(p_session, e\.id\);/);
  assert.ok(!/get diagnostics|row_count|found/i.test(f), 'no inserted-row count, no FOUND signal');
  assert.match(f, /revoke all on function public\.open_case\(uuid\) from public, anon;\s*grant execute on function public\.open_case\(uuid\) to authenticated;$/);
  // the client contract: the single caller ignores the value
  const ws = readFileSync('src/app/case/[code]/CaseWorkspace.tsx', 'utf8').replace(/\r\n/g, '\n');
  assert.equal((ws.match(/rpc\("open_case"/g) ?? []).length, 1);
  assert.match(ws, /\n\s*await supabase\.rpc\("open_case", \{ p_session: sessionId \}\);\n/, 'result discarded');
  // verifiers pin it
  assert.match(PRE, /P1g open_case\(uuid\) exists/);
  assert.match(PRE, /P5c open_case\(uuid\) owned by current_user/);
  assert.match(POST, /V12 open_case returns ONLY the caller-visible initial count/);
  assert.match(POST, /V13 open_case EXECUTE: authenticated yes, anon no/);
});

// NON-CANON model of both bodies over the same session state (no local Postgres).
type Row = { code: string; lane: string | null; initial: boolean };
function makeSession(rows: readonly Row[], policy: 'title' | 'hidden', seats: Record<string, readonly string[]>) {
  const unlocked = new Map<string, number>(); // code → unlock tick
  let tick = 0;
  const rowVisible = (who: string, r: Row) => policy === 'title' || r.lane === null || seats[who]!.includes(r.lane);
  const insertInitial = () => {
    tick += 1;
    let inserted = 0;
    for (const r of rows) if (r.initial && !unlocked.has(r.code)) { unlocked.set(r.code, tick); inserted += 1; }
    return inserted;
  };
  const member = (who: string) => { if (!(who in seats)) throw new Error('NOT_A_MEMBER'); };
  return {
    old004: (who: string) => { member(who); return insertInitial(); },
    open036: (who: string) => {
      member(who);
      insertInitial();
      return rows.filter((r) => r.initial && unlocked.has(r.code) && rowVisible(who, r)).length;
    },
    /** what evidence_index already shows this caller (codes) */
    index: (who: string) => rows.filter((r) => unlocked.has(r.code) && rowVisible(who, r)).map((r) => r.code),
  };
}
const SLICE_ROWS: Row[] = (Object.keys(LANE) as Code[]).map((c) => ({ code: c, lane: LANE[c], initial: true }));
const SEAT_MAP = { p1: SEATS[0]!, p2: SEATS[1]! };

test('MODEL: the leak was real — 004 open_case gave the first Scene 17 opener 4 while they see 3 (or 2)', () => {
  const s = makeSession(SLICE_ROWS, 'hidden', SEAT_MAP);
  assert.equal(s.old004('p2'), 4, 'count includes A-lane rows p2 can never see');
  assert.deepEqual(s.index('p2'), ['E05', 'E10']);
  assert.equal(s.old004('p1'), 0, '0 vs N: reveals that a teammate opened first');
});

test('MODEL: Scene 17 — each caller gets only their own visible count, in any call order; shared E05 counted for both', () => {
  for (const order of [['p1', 'p2'], ['p2', 'p1'], ['p1', 'p1', 'p2', 'p2']]) {
    const s = makeSession(SLICE_ROWS, 'hidden', SEAT_MAP);
    const got: Record<string, number[]> = { p1: [], p2: [] };
    for (const who of order) got[who]!.push(s.open036(who));
    assert.ok(got.p1!.every((n) => n === 3) && got.p2!.every((n) => n === 2), `order ${order.join(',')}: no timing signal`);
    assert.equal(got.p1![0], s.index('p1').length, 'p1 learns nothing beyond evidence_index');
    assert.equal(got.p2![0], s.index('p2').length, 'p2 learns nothing beyond evidence_index');
    assert.ok(s.index('p1').includes('E05') && s.index('p2').includes('E05'), 'shared lane stays available');
  }
});

test('MODEL: a non-holder cannot infer the size of a teammate lane — result invariant to hidden rows', () => {
  const extraA = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ code: `A-HIDDEN-${i}`, lane: 'A', initial: true }));
  const results = [0, 1, 7, 30].map((n) => {
    const s = makeSession([...SLICE_ROWS, ...extraA(n)], 'hidden', SEAT_MAP);
    s.open036('p1'); // the holder opens first (worst case for timing)
    return { n, p2: s.open036('p2'), idx: s.index('p2') };
  });
  assert.ok(results.every((r) => r.p2 === 2 && r.idx.join() === 'E05,E10'), JSON.stringify(results));
  // direct authenticated RPC: the only input is the session; a non-member is refused before anything happens
  const s = makeSession(SLICE_ROWS, 'hidden', SEAT_MAP);
  assert.throws(() => s.open036('outsider'), /NOT_A_MEMBER/);
});

test('MODEL: Room 714 open flow unchanged for the player — same unlock (title policy: every initial row visible)', () => {
  const r714: Row[] = [
    { code: 'F-01', lane: 'x', initial: true }, { code: 'D-05', lane: 'y', initial: true },
    { code: 'V-02', lane: 'z', initial: true }, { code: 'R-08', lane: 'w', initial: false },
  ];
  const seats = { a: [], b: [] } as Record<string, readonly string[]>;
  const s = makeSession(r714, 'title', seats);
  assert.equal(s.open036('a'), 3);
  assert.equal(s.open036('b'), 3);
  assert.deepEqual(s.index('a'), ['F-01', 'D-05', 'V-02'], 'initial rows unlocked exactly as before; non-initial untouched');
  assert.equal(getCaseContract('room-714')!.restrictedEvidence, 'title');
});
