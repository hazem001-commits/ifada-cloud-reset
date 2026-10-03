// ============================================================
// tests/connections/sql033.test.ts
// 033 (الربط المشترك) — إضافي فوق 027 الحي: نفس الخصوصية، نفس الحدود،
// نفس المطابِق، بلا تلميحات، بلا انتحال، والمعنى مصنّف آمناً للفريق.
// (لا Postgres محلي: فحوص بنيوية على نص SQL؛ التحقق الحي يدوي بملفي
//  verify_033_*.sql — وهذه الاختبارات تثبت أن إبرهما موجودة فعلاً.)
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const S27 = readFileSync('sql/027_validated_connections.sql', 'utf8');
const S33 = readFileSync('sql/033_joint_connections.sql', 'utf8');
const S32 = readFileSync('sql/032_room714_connection_rules_DRAFT.sql', 'utf8');
const PRE = readFileSync('sql/verify_033_preapply.sql', 'utf8');
const POST = readFileSync('sql/verify_033_postapply.sql', 'utf8');
const code = (s: string) => s.replace(/--[^\n]*/g, '');
const squash = (s: string) => code(s).replace(/\s+/g, ' ').trim();
function fnIn(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, name);
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('as $$', start)) + 3);
}
function bodyIn(sql: string, name: string): string {
  const f = fnIn(sql, name);
  return f.slice(f.indexOf('as $$') + 5, f.lastIndexOf('$$;'));
}
const JOINT = ['open_joint_proposal', 'contribute_to_joint', 'withdraw_joint_contribution', 'close_joint_proposal', 'test_joint_proposal', 'joint_proposals'];
const ALL33 = ['_connection_throttled', '_connection_match', 'propose_connection', ...JOINT];

// ============================================================
// 027 history + additive shape
// ============================================================
test('033 is additive over live 027: 027 file untouched, review revision 2, no destructive DDL', () => {
  assert.match(S33, /STATUS: WRITTEN FOR REVIEW — NOT APPLIED \(security-reviewed revision 2\)/);
  assert.match(S27, /c_player_per_min constant integer := 6;/, '027 file untouched');
  assert.match(S27, /where r\.case_id = v_case and r\.status = 'approved'\n/, '027 matcher untouched');
  const top = code(S33.replace(/as \$\$[\s\S]*?\$\$;/g, '')).toLowerCase();
  for (const bad of ['drop table', 'truncate', 'delete from', 'drop function', 'insert into', 'update public.']) assert.ok(!top.includes(bad), bad);
  assert.match(S33, /alter table public\.case_connection_rules\s+add column if not exists team_safe boolean not null default false;/);
  assert.match(S33, /check \(status <> 'approved' or team_safe\)/, 'approved ⇒ team_safe is a DB invariant');
  const defined = [...S33.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(defined, [...ALL33].sort());
  for (const f of ALL33) assert.match(fnIn(S33, f), /security definer\s+set search_path = public/, f);
});

// ============================================================
// PART B — the re-created propose_connection keeps 027's contract
// ============================================================
test('B. propose_connection: same signature, member + shape + privacy sections verbatim, throttle before truth', () => {
  assert.match(fnIn(S33, 'propose_connection'), /^create or replace function public\.propose_connection\(\s*p_session  uuid,\s*p_nodes    jsonb,\s*p_relation text default null\s*\)\s*returns jsonb/);
  const old = bodyIn(S27, 'propose_connection');
  const now = bodyIn(S33, 'propose_connection');
  const section = (b: string, from: string, to: string) => b.slice(b.indexOf(from), b.indexOf(to));
  assert.equal(
    section(now, 'if not public.is_session_member(p_session) then', '-- Throttle BEFORE'),
    section(old, 'if not public.is_session_member(p_session) then', '-- Throttle BEFORE'),
    'membership + shape checks identical',
  );
  assert.equal(section(now, '-- Privacy FIRST', 'return public._connection_match('), section(old, '-- Privacy FIRST', '-- Deterministic match'), 'privacy loop identical');
  const c = code(now);
  assert.ok(c.indexOf('_connection_throttled(p_session)') < c.indexOf('_connection_node_known('), 'throttle first');
  assert.ok(c.indexOf('_connection_node_known(') < c.indexOf('_connection_match('), 'privacy before any rule is read');
  assert.match(c, /return public\._connection_match\(p_session, v_case, p_nodes, v_keys, p_relation\);/);
  assert.ok(!/case_connection_rules/.test(c), 'no second matcher inside propose_connection');
  assert.match(code(old), /select s\.case_id into v_case from public\.sessions s where s\.id = p_session;/);
  assert.match(c, /select s\.case_id into v_case from public\.sessions s where s\.id = p_session;/, 'session case authoritative');
});

test('B. the throttle is 027’s, constant for constant and clause for clause', () => {
  const old = squash(bodyIn(S27, 'propose_connection'));
  const th = squash(bodyIn(S33, '_connection_throttled'));
  for (const k of ["c_player_per_min constant integer := 6;", 'c_team_fail_max constant integer := 20;', "c_team_window constant interval := interval '10 minutes';"]) {
    assert.ok(old.includes(k) && th.includes(k), k);
  }
  const clause = (s: string) => s.slice(s.indexOf('(select count(*) from public.session_connection_attempts a'), s.indexOf('c_team_fail_max', s.indexOf('(select count(*)')) + 'c_team_fail_max'.length);
  assert.ok(clause(old).length > 200, 'clause extracted');
  assert.equal(clause(th), clause(old), 'same two budget queries');
});

test('B. the one matcher is 027’s match/record/effects/conditions/milestones, verbatim except "and r.team_safe"', () => {
  const old = squash(bodyIn(S27, 'propose_connection'));
  const from = 'for v_rule in';
  const to = "return jsonb_build_object('status', 'validated', 'meaning', v_match.meaning);";
  const oldMatch = old.slice(old.indexOf(from), old.indexOf(to) + to.length).replace(/\bv_case\b/g, 'p_case').replace(/\bv_keys\b/g, 'p_keys');
  const m = squash(bodyIn(S33, '_connection_match'));
  const newMatch = m.slice(m.indexOf(from), m.indexOf(to) + to.length).replace(' and r.team_safe', '');
  assert.ok(oldMatch.length > 1500 && oldMatch.includes('check_milestones'), 'whole 027 match section extracted');
  assert.equal(newMatch, oldMatch);
  assert.match(m, /where r\.case_id = p_case and r\.status = 'approved' and r\.team_safe/);
});

test('B. grants for propose_connection are exactly 027’s; internals never client-executable', () => {
  for (const s of [S27, S33]) {
    assert.match(s, /revoke all on function public\.propose_connection\(uuid, jsonb, text\)\s+from public, anon;/);
    assert.match(s, /grant execute on function public\.propose_connection\(uuid, jsonb, text\)\s+to authenticated;/);
  }
  for (const f of ['_connection_throttled(uuid)', '_connection_match(uuid, text, jsonb, text[], text)']) {
    assert.ok(S33.includes(`revoke all on function public.${f}`) && !S33.includes(`grant execute on function public.${f}`), f);
  }
});

// ============================================================
// PART I — joint security
// ============================================================
test('I. no spoofing: no joint RPC takes a user id; contributor is auth.uid(); only the contributor withdraws', () => {
  for (const f of JOINT) {
    const sig = fnIn(S33, f).slice(0, fnIn(S33, f).indexOf(')'));
    assert.ok(!/p_(user|contributor|author|uid)/i.test(sig), f);
  }
  const c = code(bodyIn(S33, 'contribute_to_joint'));
  assert.match(c, /values \(p_proposal, v_p\.session_id, v_kind, v_id, auth\.uid\(\)\)/);
  const w = code(bodyIn(S33, 'withdraw_joint_contribution'));
  assert.match(w, /c\.contributor = auth\.uid\(\)/);
  assert.match(w, /p\.status = 'open'/);
  assert.match(w, /delete from public\.session_joint_contributions/, 'withdrawn = deleted, so a test never sees it');
});

test('I. readable evidence can be contributed; title-only cannot (027 readability, as the contributor); one neutral refusal', () => {
  const c = code(bodyIn(S33, 'contribute_to_joint'));
  assert.match(c, /not public\._connection_node_known\(v_p\.session_id, v_kind, v_id\)/);
  assert.match(code(bodyIn(S27, '_connection_node_known')), /where upper\(e\.code\) = p_id and e\.readable/, 'title-only (readable = false) is not known');
  assert.equal((c.match(/raise exception/g) ?? []).length, 1);
  assert.match(c, /raise exception 'NOT_CONTRIBUTABLE'/);
  assert.match(c, /v_kind not in \('evidence', 'object', 'location'\)/);
  assert.match(c, /v_kind text := coalesce\(p_kind, ''\)/, 'a null kind cannot slip past the check');
});

test('I. joint test: participants only, departed members ignored, incomplete = an ordinary recorded miss, same throttle + matcher', () => {
  const t = code(bodyIn(S33, 'test_joint_proposal'));
  assert.match(t, /raise exception 'NOT_A_PARTICIPANT'/);
  assert.match(t, /join public\.session_members m on m\.session_id = c\.session_id and m\.user_id = c\.contributor/);
  assert.match(t, /cardinality\(v_keys\) not between 2 and 5 then\s*insert into public\.session_connection_attempts[^;]*'not_established'\);\s*return jsonb_build_object\('status', 'not_established'\);/);
  assert.match(t, /if public\._connection_throttled\(v_p\.session_id\) then/);
  assert.ok(t.indexOf('_connection_throttled') < t.indexOf('session_joint_contributions c'), 'throttle before reading contributions');
  assert.match(t, /v_result := public\._connection_match\(v_p\.session_id, v_case, v_nodes, v_keys, v_p\.relation\);/);
});

test('I. cross-case: contributions are vouched in the proposal’s own session; the matcher uses that session’s case only', () => {
  assert.match(code(bodyIn(S33, 'contribute_to_joint')), /public\.is_session_member\(v_p\.session_id\)/);
  assert.match(code(bodyIn(S33, 'test_joint_proposal')), /select s\.case_id into v_case from public\.sessions s where s\.id = v_p\.session_id;/);
  assert.match(code(bodyIn(S33, '_connection_match')), /r\.case_id = p_case/);
  for (const f of ALL33) assert.ok(!/'room-714'|'scene-17'|specializ/i.test(code(bodyIn(S33, f))), `${f} is case-agnostic`);
});

test('I. wrong / incomplete / draft / not-team-safe / other-case / departed → one identical neutral answer, every one recorded', () => {
  const m = code(bodyIn(S33, '_connection_match'));
  assert.equal((m.match(/jsonb_build_object\('status', 'not_established'\)/g) ?? []).length, 1, 'one miss shape in the matcher');
  const returns = (f: string) => [...code(bodyIn(S33, f)).matchAll(/return ([^;]*);/g)].map((x) => x[1]!).join(' ');
  for (const f of ['propose_connection', 'test_joint_proposal', '_connection_match']) {
    for (const leak of ['rule', 'reason', 'missing', 'count', 'contributor', 'score', 'effects', 'target']) assert.ok(!returns(f).includes(leak), `${f}: ${leak}`);
  }
  // every not_established path in a test records an attempt (same budget for every miss)
  const t = code(bodyIn(S33, 'test_joint_proposal'));
  assert.equal((t.match(/return jsonb_build_object\('status', 'not_established'\)/g) ?? []).length, 1);
});

test('I. one abuse budget: solo and joint call the same throttle; no other constants anywhere in 033', () => {
  assert.match(code(bodyIn(S33, 'propose_connection')), /public\._connection_throttled\(p_session\)/);
  assert.match(code(bodyIn(S33, 'test_joint_proposal')), /public\._connection_throttled\(v_p\.session_id\)/);
  const outside = code(S33).replace(bodyIn(S33, '_connection_throttled'), '');
  assert.ok(!/c_player_per_min|c_team_fail_max|60 seconds/.test(outside), 'no second budget');
});

test('I. success returns only the meaning; effects stay idempotent and pending-capable (027 _apply_connection_effects reused)', () => {
  const m = code(bodyIn(S33, '_connection_match'));
  assert.match(m, /return jsonb_build_object\('status', 'validated', 'meaning', v_match\.meaning\);/);
  assert.match(m, /on conflict do nothing;\s*if found then\s*v_produced := v_produced \+ public\._apply_connection_effects\(p_session, v_match\.effects\);/);
  assert.match(m, /on conflict do nothing;\s*if found then\s*v_produced := v_produced \+ public\._apply_connection_effects\(p_session, v_cond\.effects\);/);
  assert.ok(!/create or replace function public\._apply_connection_effects/.test(S33), '027 effects function (pending/idempotent) is reused, not redefined');
  assert.match(S27, /'WRONG_SPECIALIZATION', 'REQUIREMENTS_NOT_MET'[\s\S]*'evidence_pending'/);
  const t = code(bodyIn(S33, 'test_joint_proposal'));
  assert.match(t, /set status = 'validated', meaning = v_result ->> 'meaning'/, 'only the meaning is stored');
});

test('I. masked team view: refs only for mine or team-visible material, departed hidden, never bodies; Scene 17 fails closed', () => {
  const v = code(bodyIn(S33, 'joint_proposals'));
  assert.match(v, /when c\.contributor = auth\.uid\(\)\s+or public\._board_material_team_visible\(p_session, c\.node_kind, c\.node_id\)/);
  assert.match(v, /join public\.session_members m on m\.session_id = c\.session_id and m\.user_id = c\.contributor/);
  assert.ok(!/evidence_index|body|title/.test(v));
  // 031: no case policy row ⇒ evidence never team-visible ⇒ a Scene 17 channel contribution shows no ref to others
  assert.ok(!/'scene-17'/.test(code(readFileSync('sql/031_board_v2.sql', 'utf8'))));
});

test('I. permissions: contributions RPC-only (no policy, not published); proposal rows member-readable (no node data)', () => {
  assert.match(S33, /revoke all on table public\.session_joint_contributions from public, anon, authenticated;/);
  assert.ok(!/create policy [^;]*public\.session_joint_contributions/.test(S33));
  assert.ok(!/grant [^;]*session_joint_contributions/.test(S33));
  assert.match(S33, /create policy session_joint_proposals_select on public\.session_joint_proposals\s+for select to authenticated using \(public\.is_session_member\(session_id\)\);/);
  assert.match(S33, /grant select on table public\.session_joint_proposals to authenticated;/);
  const proposals = S33.slice(S33.indexOf('create table if not exists public.session_joint_proposals'), S33.indexOf('create index if not exists session_joint_proposals_session'));
  assert.ok(!/node_|evidence|object_code/.test(proposals), 'proposal rows carry no node identity');
  assert.match(S33, /alter publication supabase_realtime add table public\.session_joint_proposals;/);
  assert.ok(!/add table public\.session_joint_contributions/.test(S33));
  for (const f of ['open_joint_proposal(uuid, text)', 'contribute_to_joint(uuid, text, text)', 'withdraw_joint_contribution(uuid, text, text)', 'close_joint_proposal(uuid)', 'test_joint_proposal(uuid)', 'joint_proposals(uuid)']) {
    assert.ok(S33.includes(`grant execute on function public.${f}`) && new RegExp(`revoke all on function public\\.${f.replace(/[()[\]]/g, '\\$&')}\\s+from public, anon;`).test(S33), f);
  }
});

test('C. lifecycle: open → validated (meaning, final) | closed (participant, final); no expiry invented', () => {
  assert.match(S33, /status in \('open', 'validated', 'closed'\)/);
  assert.match(S33, /check \(\(status = 'validated'\) = \(meaning is not null\)\)/);
  assert.match(S33, /check \(\(status = 'open'\) = \(closed_at is null\)\)/);
  const cl = code(bodyIn(S33, 'close_joint_proposal'));
  assert.match(cl, /p\.status = 'open'/);
  assert.match(cl, /p\.created_by = auth\.uid\(\)\s+or exists \(select 1 from public\.session_joint_contributions c\s+where c\.proposal_id = p\.id and c\.contributor = auth\.uid\(\)\)/);
  assert.ok(!/expire/i.test(code(S33)));
});

test('client code never imports server-only connection truth', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : /\.(ts|tsx)$/.test(n) ? [join(d, n)] : []));
  for (const f of [...walk('src/app'), ...walk('src/cases'), ...walk('src/lib')]) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!/@\/server\/cases\/[^'"]*connections|case_connection_rules/.test(s), f);
  }
});

// ============================================================
// PART H — 032 depends on 033
// ============================================================
test('H. 032 step 2 needs 033 (team_safe) and approves only the two rules approved in principle', () => {
  const step2 = S32.slice(S32.indexOf('-- STEP 2'), S32.indexOf('-- READ-ONLY checks'));
  assert.ok(step2.split('\n').filter((l) => l.trim()).every((l) => l.trimStart().startsWith('--')), 'step 2 stays commented');
  assert.match(step2, /set status = 'approved', team_safe = true/);
  assert.match(step2, /rule_id in \('R714_N17_PAYMENTS', 'R714_COPY_AFTER_MESSAGE'\)/);
  assert.ok(!/rule_id in \([^)]*R714_NO_VICTIM_BLOOD/.test(step2));
  assert.ok(!/team_safe/.test(S27), 'team_safe exists only once 033 is applied — step 2 cannot run before it');
  assert.equal((code(S32).match(/'draft', \d+\)/g) ?? []).length, 3, 'step 1 inserts drafts only');
});

// ============================================================
// Verifiers: read-only, one SELECT, needles present in the real 033 bodies
// ============================================================
test('verify_033 files: single read-only SELECT each, PUBLIC via ACL only', () => {
  for (const [name, sql] of [['pre', PRE], ['post', POST]] as const) {
    const stmt = sql.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''").toLowerCase();
    assert.equal((stmt.match(/;/g) ?? []).length, 1, name);
    assert.match(stmt.trim(), /^with[\s\S]*order by ord, check_name;$/, name);
    for (const bad of ['insert ', 'update ', 'delete ', 'drop ', 'alter ', 'create ', 'grant ', 'revoke ', 'truncate', 'perform ']) assert.ok(!stmt.includes(bad), `${name}: ${bad}`);
    assert.ok(!/has_[a-z]+_privilege\(\s*'public'/i.test(sql), `${name}: PUBLIC via ACL only`);
    assert.match(sql, /client_roles\(name\) as \(values \('anon'\), \('authenticated'\)\)/);
  }
  assert.match(PRE, /\('propose_connection',\s+'p_session uuid, p_nodes jsonb, p_relation text'\)/);
  assert.match(PRE, /\('_board_material_team_visible', 'p_session uuid, p_kind text, p_code text'\)/);
  for (const f of ALL33.filter((f) => f !== 'propose_connection')) assert.ok(PRE.includes(`('${f}')`), `pre: ${f} absent check`);
  for (const f of ALL33) assert.ok(POST.includes(`('${f}', `), `post: ${f}`);
});

test('verify_033_postapply needles match the real 033 bodies', () => {
  const lit = (s: string) => s.replace(/'/g, "''");
  const needles: [string, string][] = [
    ['contribute_to_joint', 'public._connection_node_known(v_p.session_id, v_kind, v_id)'],
    ['contribute_to_joint', 'values (p_proposal, v_p.session_id, v_kind, v_id, auth.uid())'],
    ['contribute_to_joint', "'NOT_CONTRIBUTABLE'"],
    ['withdraw_joint_contribution', 'c.contributor = auth.uid()'],
    ['withdraw_joint_contribution', "p.status = 'open'"],
    ['test_joint_proposal', 'join public.session_members m on m.session_id = c.session_id and m.user_id = c.contributor'],
    ['test_joint_proposal', 'select s.case_id into v_case from public.sessions s where s.id = v_p.session_id'],
    ['test_joint_proposal', 'public._connection_throttled(v_p.session_id)'],
    ['test_joint_proposal', 'public._connection_match(v_p.session_id, v_case, v_nodes, v_keys, v_p.relation)'],
    ['test_joint_proposal', 'insert into public.session_connection_attempts'],
    ['_connection_match', "where r.case_id = p_case and r.status = 'approved' and r.team_safe"],
    ['_connection_match', "jsonb_build_object('status', 'validated', 'meaning', v_match.meaning)"],
    ['_connection_throttled', 'c_player_per_min constant integer := 6;'],
    ['_connection_throttled', 'c_team_fail_max  constant integer := 20;'],
    ['_connection_throttled', "c_team_window    constant interval := interval '10 minutes';"],
    ['_connection_throttled', "interval '60 seconds'"],
    ['propose_connection', 'if not public.is_session_member(p_session) then'],
    ['propose_connection', 'jsonb_array_length(p_nodes) > 5'],
    ['propose_connection', 'octet_length(p_nodes::text) > 2000'],
    ['propose_connection', 'public._connection_throttled(p_session)'],
    ['propose_connection', 'return public._connection_match(p_session, v_case, p_nodes, v_keys, p_relation);'],
    ['joint_proposals', 'public._board_material_team_visible(p_session, c.node_kind, c.node_id)'],
    ['joint_proposals', 'join public.session_members m on m.session_id = c.session_id and m.user_id = c.contributor'],
  ];
  for (const [f, n] of needles) {
    assert.ok(bodyIn(S33, f).includes(n), `${f} lacks ${n}`);
    assert.ok(POST.includes(lit(n)), `post-apply lacks ${n}`);
  }
  // regex needles (whitespace-tolerant) hold against the real bodies too
  const m = bodyIn(S33, '_connection_match');
  assert.match(m, /on conflict do nothing;\s+if found then\s+v_produced := v_produced \+ public\._apply_connection_effects\(p_session, v_match\.effects\);/);
  assert.equal((code(bodyIn(S33, 'contribute_to_joint')).match(/raise exception/g) ?? []).length, 1);
  assert.ok(!/case_connection_rules/.test(bodyIn(S33, 'propose_connection')));
  assert.ok(!/evidence_index|body/.test(bodyIn(S33, 'joint_proposals')));
  // pre-apply: the live propose_connection is still 027's own body
  for (const n of ['c_player_per_min constant integer := 6', "r.status = 'approved'"]) {
    assert.ok(bodyIn(S27, 'propose_connection').includes(n), n);
    assert.ok(PRE.includes(lit(n)), `pre lacks ${n}`);
  }
});
