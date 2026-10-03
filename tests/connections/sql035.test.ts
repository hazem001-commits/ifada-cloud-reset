// ============================================================
// tests/connections/sql035.test.ts
// 035 — طبقة التوزيع بالسيرفر: قاعدة قراءة واحدة يستهلكها الجميع.
//
// لا Postgres محلي: (1) براهين بنيوية على نص SQL مقابل المصادر الحية
// (017 / 026 / 027 / 031 / 033) — كل دالة مُعاد إنشاؤها حرفية إلا
// التبديل المقصود؛ (2) نموذج تنفيذي للقاعدة نفسها (مواصفة، ليس كود
// إنتاج) مربوط بنص SQL بندًا بندًا، ببيانات اصطناعية:
//   ⚠ TEST ONLY · NON-CANON · NEVER SEED (S35-TEST-*).
// التحقق الحي يدوي: verify_035_preapply.sql / verify_035_postapply.sql.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const S35 = readFileSync('sql/035_case_distribution_channels.sql', 'utf8');
const S17 = readFileSync('sql/017_consolidate_current_state.sql', 'utf8');
const S26 = readFileSync('sql/026_nested_object_visibility.sql', 'utf8');
const S27 = readFileSync('sql/027_validated_connections.sql', 'utf8');
const S31 = readFileSync('sql/031_board_v2.sql', 'utf8');
const S33 = readFileSync('sql/033_joint_connections.sql', 'utf8');
const S32 = readFileSync('sql/032_room714_connection_rules_DRAFT.sql', 'utf8');
const PRE = readFileSync('sql/verify_035_preapply.sql', 'utf8');
const POST = readFileSync('sql/verify_035_postapply.sql', 'utf8');

const code = (s: string) => s.replace(/--[^\n]*/g, '');
const squash = (s: string) => code(s).replace(/\s+/g, ' ').trim();
function bodyIn(sql: string, name: string, from = 0): string {
  const re = new RegExp(`create (?:or replace )?function public\\.${name}\\(`, 'g');
  re.lastIndex = from;
  const m = re.exec(sql);
  assert.ok(m, name);
  const start = sql.indexOf('as $$', m.index) + 5;
  return sql.slice(start, sql.indexOf('$$;', start));
}
const lastBodyIn = (sql: string, name: string) => bodyIn(sql, name, sql.lastIndexOf(`create or replace function public.${name}(`));

// ============================================================
// (1) البراهين البنيوية — حرفية مقابل المصادر الحية
// ============================================================
test('035 is a review draft: additive engine, seeds nothing, no Scene 17 / Room 714 literals in shared functions', () => {
  assert.match(S35, /STATUS: WRITTEN FOR REVIEW — NOT APPLIED\./);
  const top = code(S35.replace(/as \$\$[\s\S]*?\$\$;/g, '')).toLowerCase();
  for (const bad of ['insert into', 'delete from', 'update public.', 'truncate', 'drop table', 'drop function']) assert.ok(!top.includes(bad), bad);
  assert.ok(!/'scene-17'|'room-714'/.test(code(S35)), 'no case literal anywhere in executable SQL');
  for (const f of ['_evidence_readable', '_evidence_row_visible', '_assign_session_channels', 'my_channels']) {
    assert.ok(!/specialization\s*=\s*'|'digital'|'field'|'forensics'|'records'|'A'|'F'/.test(code(bodyIn(S35, f))), `${f}: no hardcoded specialization/channel`);
  }
});

test('unlockable_evidence / expiring_evidence: verbatim 017, only has_specialization(owner_spec) → _evidence_readable(id)', () => {
  for (const f of ['unlockable_evidence', 'expiring_evidence']) {
    const before = squash(bodyIn(S17, f)).replace('public.has_specialization( p_session, e.owner_spec )', 'public._evidence_readable( p_session, e.id )');
    assert.equal(squash(bodyIn(S35, f)), before, f);
  }
  const unlockBefore = squash(bodyIn(S17, 'unlock_evidence')).replace('public.has_specialization( p_session, v_ev.owner_spec )', 'public._evidence_readable( p_session, v_ev.id )');
  assert.equal(squash(bodyIn(S35, 'unlock_evidence')), unlockBefore, 'unlock_evidence');
  assert.match(bodyIn(S35, 'unlock_evidence'), /raise exception 'WRONG_SPECIALIZATION'/, '027 pending settlement still keys on this');
});

test('evidence_index: verbatim 017 columns/order; readability from the one rule; non-visible rows are never returned', () => {
  const before = squash(bodyIn(S17, 'evidence_index'))
    .replace('when public.has_specialization(p_session, e.owner_spec) then e.body', 'when rd.can_read then e.body')
    .replace('when public.has_specialization(p_session, e.owner_spec) then (e.media_path is not null)', 'when rd.can_read then (e.media_path is not null)')
    .replace('public.has_specialization(p_session, e.owner_spec), se.unlocked_at', 'rd.can_read, se.unlocked_at')
    .replace('on e.id = se.evidence_id where se.session_id = p_session', 'on e.id = se.evidence_id cross join lateral ( select public._evidence_readable(p_session, e.id) as can_read ) rd where se.session_id = p_session and (rd.can_read or public._evidence_row_visible(p_session, e.id))');
  assert.equal(squash(bodyIn(S35, 'evidence_index')), before);
  // same return shape (no new/removed columns)
  const sig = (s: string) => squash(s.slice(s.indexOf('function public.evidence_index('), s.indexOf('language', s.indexOf('function public.evidence_index('))));
  assert.equal(sig(S35), sig(S17.slice(S17.indexOf('create function public.evidence_index(')).replace('create function', 'create or replace function')));
});

test('evidence_provenance: verbatim 026 + evidence visibility on both branches', () => {
  const now = squash(bodyIn(S35, 'evidence_provenance'))
    .replace(" and exists (select 1 from public.evidence ev where ev.case_id = v_case and ev.code = src.evidence_code and public._evidence_row_visible(p_session, ev.id))", '')
    .replace(' and public._evidence_row_visible(p_session, e.id)', '');
  assert.equal(now, squash(lastBodyIn(S26, 'evidence_provenance')));
});

test('Board V2: 031 body verbatim except the evidence branch; title policy unchanged; hidden policy pins only shared-lane channel evidence', () => {
  const objectPart = (b: string) => squash(b.slice(b.indexOf("if p_kind not in ('object', 'location') then")));
  assert.equal(objectPart(bodyIn(S35, '_board_material_team_visible')), objectPart(bodyIn(S31, '_board_material_team_visible')), '026 object boundary untouched');
  const ev = code(bodyIn(S35, '_board_material_team_visible'));
  assert.match(ev, /coalesce\(\(select p\.restricted_evidence from public\.case_engine_policy p where p\.case_id = v_case\), 'hidden'\) <> 'title' then\s*return exists \(select 1 from public\.case_engine_policy p where p\.case_id = v_case and p\.distribution = 'channels'\)\s*and not exists \(select 1 from public\.case_evidence_channels ec where ec\.evidence_id = v_eid\);\s*end if;\s*return true;/);
  assert.match(ev, /if v_eid is null then\s*return false;/, 'must be unlocked in this session');
});

test('027 / 033 consume readability unchanged: _connection_node_known reads evidence_index.readable; contribution vouched by the contributor', () => {
  assert.ok(!/function public\._connection_node_known|function public\.propose_connection|function public\.contribute_to_joint/.test(S35), 'not redefined');
  assert.match(bodyIn(S27, '_connection_node_known'), /from public\.evidence_index\(p_session\) e\s+where upper\(e\.code\) = p_id and e\.readable/);
  assert.match(bodyIn(S33, 'contribute_to_joint'), /public\._connection_node_known\(v_p\.session_id, v_kind, v_id\)/);
});

test('session_evidence: the member SELECT policy (and therefore realtime) now filters by row visibility', () => {
  assert.match(S35, /drop policy if exists session_evidence_select on public\.session_evidence;\s*create policy session_evidence_select on public\.session_evidence\s*for select to authenticated\s*using \(public\.is_session_member\(session_id\)\s*and public\._evidence_row_visible\(session_id, evidence_id\)\);/);
  // no recursion: the policy helpers never read session_evidence
  for (const f of ['_evidence_readable', '_evidence_row_visible']) assert.ok(!/session_evidence\b/.test(code(bodyIn(S35, f))), f);
});

test('channel assignment is server-authoritative: trigger on lobby → active, seat plan only, fails closed, no client write path', () => {
  assert.match(S35, /create trigger sessions_assign_channels_on_start\s+after update of status on public\.sessions\s+for each row execute function public\._sessions_assign_channels_on_start\(\);/);
  assert.match(code(bodyIn(S35, '_sessions_assign_channels_on_start')), /if old\.status = 'lobby' and new\.status = 'active' then\s*perform public\._assign_session_channels\(new\.id\);/);
  const a = code(bodyIn(S35, '_assign_session_channels'));
  assert.match(a, /p\.distribution = 'channels'/);
  assert.match(a, /raise exception 'CHANNEL_PLAN_MISSING';/);
  assert.match(a, /row_number\(\) over \(order by sm\.joined_at, sm\.user_id\)/);
  assert.match(a, /cs\.case_id = v_case and cs\.players = v_players and cs\.seat = m\.seat/);
  // cross-session / cross-case impossible by construction
  assert.match(S35, /foreign key \(session_id, user_id\) references public\.session_members\(session_id, user_id\) on delete cascade/);
  assert.match(S35, /foreign key \(case_id, channel_id\) references public\.case_channels\(case_id, channel_id\)/);
  // no function takes a channel or user parameter
  for (const m of S35.matchAll(/create or replace function public\.([a-z_]+)\(([^)]*)\)/g)) {
    assert.ok(!/p_channel|p_user|p_seat/.test(m[2]!), `${m[1]} cannot be told whose channel`);
  }
  assert.match(code(bodyIn(S35, 'my_channels')), /m\.session_id = p_session and m\.user_id = auth\.uid\(\)/, 'own channels only');
});

test('permissions: channel tables fully closed; internals not client-executable; only the row-visibility helper is granted (RLS needs it)', () => {
  for (const t of ['case_channels', 'case_channel_seats', 'case_evidence_channels', 'session_member_channels']) {
    assert.match(S35, new RegExp(`alter table public\\.${t}\\s+enable row level security;`));
    assert.match(S35, new RegExp(`revoke all on table public\\.${t}\\s+from public, anon, authenticated;`));
    assert.ok(!new RegExp(`create policy [^;]*public\\.${t}|grant [^;]*public\\.${t}`).test(S35), t);
  }
  for (const f of ['_evidence_readable(uuid, uuid)', '_assign_session_channels(uuid)', '_sessions_assign_channels_on_start()', '_board_material_team_visible(uuid, text, text)']) {
    assert.ok(S35.includes(`revoke all on function public.${f}`) && !S35.includes(`grant execute on function public.${f}`), f);
  }
  assert.match(S35, /grant execute on function public\._evidence_row_visible\(uuid, uuid\)\s+to authenticated;/);
  for (const f of ['evidence_index(uuid)', 'unlockable_evidence(uuid)', 'unlock_evidence(uuid, text)', 'expiring_evidence(uuid)', 'evidence_provenance(uuid)', 'my_channels(uuid)']) {
    assert.ok(S35.includes(`grant execute on function public.${f}`), f);
  }
  for (const m of S35.matchAll(/create or replace function public\.([a-z_]+)\(/g)) {
    assert.match(S35.slice(m.index, S35.indexOf('as $$', m.index)), /security definer\s+set search_path = public/, m[1]);
  }
});

test('032 untouched; deferred R714_NO_DEPARTURE_INDICATION still documentation-only', () => {
  assert.ok(!/R714_NO_DEPARTURE/.test(S32));
  const step2 = S32.slice(S32.indexOf('-- STEP 2'), S32.indexOf('-- READ-ONLY checks'));
  assert.ok(step2.split('\n').filter((l) => l.trim()).every((l) => l.trimStart().startsWith('--')));
});

// ============================================================
// Verifiers
// ============================================================
test('verify_035 files: single read-only SELECT each; PUBLIC via ACL only; needles present in the real bodies', () => {
  for (const [name, sql] of [['pre', PRE], ['post', POST]] as const) {
    const stmt = sql.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''").toLowerCase();
    assert.equal((stmt.match(/;/g) ?? []).length, 1, name);
    assert.match(stmt.trim(), /^with[\s\S]*order by ord, check_name;$/, name);
    for (const bad of ['insert ', 'update ', 'delete ', 'drop ', 'alter ', 'create ', 'grant ', 'revoke ', 'truncate', 'perform ']) assert.ok(!stmt.includes(bad), `${name}: ${bad}`);
    assert.ok(!/has_[a-z]+_privilege\(\s*'public'/i.test(sql), `${name}: PUBLIC via ACL only`);
  }
  const lit = (s: string) => s.replace(/'/g, "''");
  const post: [string, string][] = [
    ['evidence_index', 'public._evidence_readable(p_session, e.id) as can_read'],
    ['evidence_index', '(rd.can_read or public._evidence_row_visible(p_session, e.id))'],
    ['_evidence_readable', "if v_dist = 'specialization' then"],
    ['_evidence_readable', 'return public.has_specialization(p_session, v_owner);'],
    ['_evidence_readable', 'm.session_id = p_session and m.user_id = auth.uid()'],
    ['_evidence_readable', 'm.case_id = v_case and m.channel_id = v_channel'],
    ['_evidence_readable', 'v_ev_case is distinct from v_case'],
    ['_evidence_row_visible', 'public._evidence_readable(p_session, p_evidence_id)'],
    ['_evidence_row_visible', "p.restricted_evidence = 'title'"],
    ['_board_material_team_visible', "'hidden') <> 'title'"],
    ['_board_material_team_visible', "p.distribution = 'channels'"],
    ['_board_material_team_visible', 'not exists (select 1 from public.case_evidence_channels ec where ec.evidence_id = v_eid)'],
    ['_board_material_team_visible', 'public._object_state_row_visible(p_session, v_code)'],
    ['_assign_session_channels', "p.distribution = 'channels'"],
    ['_assign_session_channels', "'CHANNEL_PLAN_MISSING'"],
    ['my_channels', 'm.session_id = p_session and m.user_id = auth.uid()'],
    ['unlock_evidence', "'WRONG_SPECIALIZATION'"],
  ];
  for (const [f, n] of post) {
    assert.ok(bodyIn(S35, f).includes(n), `${f} lacks ${n}`);
    assert.ok(POST.includes(lit(n)), `post lacks ${n}`);
  }
  assert.equal((bodyIn(S35, 'evidence_provenance').match(/_evidence_row_visible/g) ?? []).length, 2);
  // pre: the live (pre-035) shapes it asserts are really the current sources
  assert.ok(bodyIn(S17, 'evidence_index').includes('public.has_specialization('));
  assert.ok(lastBodyIn(S26, 'evidence_provenance').includes('_object_ancestors_known'));
  assert.ok(bodyIn(S31, '_board_material_team_visible').includes("'hidden') <> 'title'"));
  for (const n of ["'hidden') <> 'title'", 'from public.evidence_index(p_session) e', 'e.readable']) assert.ok(PRE.includes(lit(n)), `pre lacks ${n}`);
  for (const t of ['case_channels', 'case_channel_seats', 'case_evidence_channels', 'session_member_channels', 'case_channel_plans', 'evidence_channels', 'case_entities']) {
    assert.ok(PRE.includes(`('${t}')`), `pre absent-check ${t}`);
  }
});

// ============================================================
// (2) مواصفة تنفيذية للقاعدة — نموذج للمراجعة، مربوط بالبنود أعلاه
//     TEST ONLY · NON-CANON · NEVER SEED
// ============================================================
type Dist = 'specialization' | 'channels';
interface World {
  policy: Record<string, { distribution: Dist; restricted: 'title' | 'hidden' } | undefined>;
  sessions: Record<string, { case: string; members: Record<string, { specs: string[]; channels: string[] }> }>;
  evidence: Record<string, { case: string; owner: string; channel?: { case: string; id: string } }>;
}
/** نموذج public._evidence_readable كما كُتب بالـ SQL أعلاه بندًا بندًا. */
function readable(w: World, session: string, uid: string, ev: string): boolean {
  const s = w.sessions[session];
  const m = s?.members[uid];
  const e = w.evidence[ev];
  if (!s || !m || !e) return false;
  if (e.case !== s.case) return false;
  const p = w.policy[s.case];
  if (p?.distribution === 'specialization') return m.specs.includes(e.owner);
  if (p?.distribution === 'channels') {
    if (!e.channel) return true;
    return e.channel.case === s.case && m.channels.includes(e.channel.id);
  }
  return false;
}
const visible = (w: World, s: string, u: string, ev: string) => readable(w, s, u, ev) || (!!w.sessions[s]?.members[u] && w.evidence[ev]?.case === w.sessions[s]!.case && w.policy[w.sessions[s]!.case]?.restricted === 'title');
const index = (w: World, s: string, u: string, unlocked: string[]) => unlocked.filter((ev) => visible(w, s, u, ev)).map((ev) => ({ code: ev, readable: readable(w, s, u, ev) }));

const W: World = {
  policy: { CASE_SPEC: { distribution: 'specialization', restricted: 'title' }, CASE_CHAN: { distribution: 'channels', restricted: 'hidden' } },
  sessions: {
    S_SPEC: { case: 'CASE_SPEC', members: { a: { specs: ['digital'], channels: [] }, b: { specs: ['field'], channels: [] } } },
    S_CHAN: { case: 'CASE_CHAN', members: { a: { specs: ['digital'], channels: ['A'] }, f: { specs: ['digital'], channels: ['F'] } } },
    S_CHAN2: { case: 'CASE_CHAN', members: { x: { specs: ['digital'], channels: ['F'] } } },
    S_NOPOLICY: { case: 'CASE_NONE', members: { a: { specs: ['digital'], channels: [] } } },
  },
  evidence: {
    'S35-TEST-A': { case: 'CASE_CHAN', owner: 'digital', channel: { case: 'CASE_CHAN', id: 'A' } },
    'S35-TEST-F': { case: 'CASE_CHAN', owner: 'digital', channel: { case: 'CASE_CHAN', id: 'F' } },
    'S35-TEST-SHARED': { case: 'CASE_CHAN', owner: 'digital' },
    'S35-TEST-SPEC': { case: 'CASE_SPEC', owner: 'field' },
    'S35-TEST-NONE': { case: 'CASE_NONE', owner: 'digital' },
    'S35-TEST-XCASE': { case: 'CASE_CHAN', owner: 'digital', channel: { case: 'CASE_SPEC', id: 'A' } },
  },
};

test('L1–L3. same specialization, different channels: each reads only their own; a non-holder gets ZERO rows (not title-only)', () => {
  const all = ['S35-TEST-A', 'S35-TEST-F', 'S35-TEST-SHARED'];
  assert.deepEqual(index(W, 'S_CHAN', 'a', all), [{ code: 'S35-TEST-A', readable: true }, { code: 'S35-TEST-SHARED', readable: true }]);
  assert.deepEqual(index(W, 'S_CHAN', 'f', all), [{ code: 'S35-TEST-F', readable: true }, { code: 'S35-TEST-SHARED', readable: true }]);
  assert.match(code(bodyIn(S35, '_evidence_row_visible')), /p\.restricted_evidence = 'title'/, 'only title policy returns unreadable rows');
});

test('L4. Room 714-style specialization case: unchanged — readable by specialization, title-only rows still returned', () => {
  assert.deepEqual(index(W, 'S_SPEC', 'a', ['S35-TEST-SPEC']), [{ code: 'S35-TEST-SPEC', readable: false }]);
  assert.deepEqual(index(W, 'S_SPEC', 'b', ['S35-TEST-SPEC']), [{ code: 'S35-TEST-SPEC', readable: true }]);
});

test('L5–L7. channels cannot be self-assigned, borrowed across sessions, or crossed between cases; no policy row = nothing', () => {
  // a member of S_CHAN2 holding F reads nothing of S_CHAN (assignment is per session)
  assert.equal(readable(W, 'S_CHAN', 'x', 'S35-TEST-F'), false);
  // a mapping that points at another case's channel never makes it readable
  assert.equal(readable(W, 'S_CHAN', 'a', 'S35-TEST-XCASE'), false);
  // evidence of another case is never readable in this session
  assert.equal(readable(W, 'S_CHAN', 'a', 'S35-TEST-SPEC'), false);
  assert.equal(readable(W, 'S_NOPOLICY', 'a', 'S35-TEST-NONE'), false, 'fail closed');
  assert.deepEqual(index(W, 'S_NOPOLICY', 'a', ['S35-TEST-NONE']), [], 'and invisible');
  // the SQL never trusts a client: no channel/user parameter anywhere (asserted structurally above)
  assert.match(code(bodyIn(S35, '_evidence_readable')), /m\.user_id = auth\.uid\(\)/);
});

test('L8–L9. joint contribution: allowed for the holder (027 readability as contributor), neutral refusal for a non-holder', () => {
  assert.equal(readable(W, 'S_CHAN', 'a', 'S35-TEST-A'), true);
  assert.equal(readable(W, 'S_CHAN', 'f', 'S35-TEST-A'), false);
  const c = code(bodyIn(S33, 'contribute_to_joint'));
  assert.equal((c.match(/raise exception/g) ?? []).length, 1);
  assert.match(c, /raise exception 'NOT_CONTRIBUTABLE'/);
});

test('L10–L12. search / AI / realtime read the same server boundary: hidden rows never leave the database for a non-holder', () => {
  // Grounded Search + AuthorizedKnowledge + Stress Test read evidence_index as the player (route handlers)
  for (const f of ['src/app/api/case-inquiry/route.ts', 'src/app/api/hypothesis-test/route.ts']) {
    assert.match(readFileSync(f, 'utf8'), /rpcRows<EvidenceRow>\('evidence_index', sessionId\)/, f);
  }
  // realtime: session_evidence events are RLS-filtered by the same visibility rule
  assert.match(S35, /using \(public\.is_session_member\(session_id\)\s*and public\._evidence_row_visible\(session_id, evidence_id\)\)/);
  // provenance never names an evidence item the caller cannot see
  assert.equal((bodyIn(S35, 'evidence_provenance').match(/_evidence_row_visible/g) ?? []).length, 2);
  // unlockable / expiring lists never list what the caller cannot read
  for (const f of ['unlockable_evidence', 'expiring_evidence']) assert.match(bodyIn(S35, f), /public\._evidence_readable\(/);
});

test('L13–L14. identical evidence ids across cases stay isolated; no Scene 17 fixture is seeded', () => {
  assert.match(code(bodyIn(S35, '_evidence_readable')), /if v_case is null or v_ev_case is distinct from v_case then\s*return false;/);
  assert.ok(!/S35-TEST|S17-TEST/.test(S35), 'test ids never appear in the migration');
  const topLevel = code(S35.replace(/as \$\$[\s\S]*?\$\$;/g, ''));
  assert.ok(!/insert into/i.test(topLevel), 'no top-level seed of any kind');
  // the fail-closed tail of the rule, as the post-apply regex checks it
  assert.match(bodyIn(S35, '_evidence_readable'), /end if;\s+return false;\s+(-{2}[^\n]*\s+)?end;\s*$/);
  assert.ok(POST.includes("s.body ~ 'end if;\\s+return false;\\s+(-{2}[^\\n]*\\s+)?end;\\s*$'"), 'post checks the same fail-closed tail');
});
