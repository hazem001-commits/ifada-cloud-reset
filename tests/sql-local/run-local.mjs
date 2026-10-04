// ============================================================
// tests/sql-local/run-local.mjs
// ⚠ LOCAL THROWAWAY POSTGRES ONLY — never Supabase, never production.
// Rebuilds a scratch database from the MIGRATIONS.md clean-setup order on
// a Supabase stub, then exercises 037 for real:
//   1. verify_037_preapply  → every non-INFO row TRUE (pre-037 replica)
//   2. apply 037 twice      → idempotent
//   3. verify_037_postapply → every non-INFO row TRUE
//   4. 037_runtime_behavior → RT_SCENARIO_OK (loop, privacy, causality, SYSTEM actor, bound)
//   5. concurrency          → same-session cascades serialize; other sessions do not wait
//   6. no deadlock          → a player holding a row the cascade needs never loses their action
//   038 (after 3)           → pre-verifier, apply twice, post-verifier, then the REAL
//                             Room 714 opening played by two players (OPENING_OK)
//   0. atomicity (before 2) → 037 with a failure injected before COMMIT leaves
//                             the database byte-for-byte pre-037 (pre-verifier
//                             still all TRUE)
//   7. mutation tests       → each hardening protection is removed from a copy
//                             of 037 in turn; the suite must FAIL on the named
//                             check (proves the protection is load-bearing).
//                             Skip with IFADA_LOCAL_PG_MUTATIONS=0.
// Usage: IFADA_LOCAL_PG_HOST=/path/to/socket/dir node tests/sql-local/run-local.mjs
// The target server must be a disposable local cluster (trust auth, user postgres).
// ============================================================
import { spawnSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOST = process.env.IFADA_LOCAL_PG_HOST;
const USER = process.env.IFADA_LOCAL_PG_USER ?? 'postgres';
const DB = process.env.IFADA_LOCAL_PG_DB ?? 'ifada_sql_local_037';
if (!HOST) throw new Error('IFADA_LOCAL_PG_HOST not set (local throwaway cluster only)');
if (/supabase|amazonaws|\.co\b|:\/\//i.test(HOST)) throw new Error('refusing: IFADA_LOCAL_PG_HOST must be a local socket directory');

const CHAIN = [
  '001_schema', '002_rls', '003_seed', '004_evidence', '005_seed_room714', '006_timeline', '007_seed_timeline_room714',
  '008_characters', '009_seed_characters_room714', '010_automation', '011_seed_automation_room714', '012_verdict',
  '013_seed_verdict_narrative_room714', 'fix_multiplayer_specialization_access', '014_storage', '015_evidence_media_safe',
  '016_fix_room714_case_clock', '017_consolidate_current_state', '018_revoke_assign_specializations_execute',
  '019_investigation_objects', '020_fix_root_object_visibility', '022_private_object_state_rls', '023_session_object_state_grants',
  '024_investigation_challenges', '025_phase5_workflows', '026_nested_object_visibility', '027_validated_connections',
  '031_board_v2', '033_joint_connections', '034_lock_legacy_board', '035_case_distribution_channels', '036_scene17_vertical_slice_DEV',
];

const base = ['-h', HOST, '-U', USER, '-v', 'ON_ERROR_STOP=1', '-X', '-q'];
function psql(args, { db = DB, input } = {}) {
  const r = spawnSync('psql', [...base, '-d', db, ...args], { encoding: 'utf8', input });
  if (r.status !== 0) throw new Error(`psql ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout;
}
const file = (rel, db = DB) => psql(['-f', path.join(ROOT, rel)], { db });
const rows = (rel, db = DB) => psql(['-At', '-F', '|', '-f', path.join(ROOT, rel)], { db }).trim().split('\n').map((l) => l.split('|'));
const SQL037 = readFileSync(path.join(ROOT, 'sql/037_investigation_runtime.sql'), 'utf8');
const TPL = `${DB}_tpl`;
const TPL38 = `${DB}_tpl38`;
const SQL038 = readFileSync(path.join(ROOT, 'sql/038_room714_opening_runtime.sql'), 'utf8');
const MUT = `${DB}_mut`;

function assertVerifier(rel, db = DB) {
  const out = rows(rel, db);
  const bad = out.filter((r) => r[1] === 'f');
  if (bad.length) throw new Error(`${rel}: FALSE rows:\n${bad.map((r) => r[0]).join('\n')}`);
  return { rows: out.length, info: out.filter((r) => r[1] === '').length };
}

export function runLocal(log = console.log) {
  psql(['-c', `drop database if exists ${DB}`], { db: 'postgres' });
  psql(['-c', `create database ${DB}`], { db: 'postgres' });
  file('tests/sql-local/supabase_stub.sql');
  for (const f of CHAIN) file(`sql/${f}.sql`);
  log('chain replayed:', CHAIN.length, 'files');

  log('pre-apply:', assertVerifier('sql/verify_037_preapply.sql'));
  atomicity(SQL037, DB);
  log('atomicity: 037 with an injected failure before COMMIT left nothing behind (pre-verifier still TRUE)');
  psql(['-c', `drop database if exists ${TPL}`], { db: 'postgres' });
  psql(['-c', `create database ${TPL} template ${DB}`], { db: 'postgres' });
  file('sql/037_investigation_runtime.sql');
  file('sql/037_investigation_runtime.sql');
  log('037 applied twice (idempotent)');
  log('post-apply:', assertVerifier('sql/verify_037_postapply.sql'));

  // 038 (RESET-2 Room 714 opening content) on the clean 037 replica
  log('038 pre-apply:', assertVerifier('sql/verify_038_preapply.sql'));
  psql(['-c', `drop database if exists ${TPL38}`], { db: 'postgres' });
  psql(['-c', `create database ${TPL38} template ${DB}`], { db: 'postgres' });
  file('sql/038_room714_opening_runtime.sql');
  file('sql/038_room714_opening_runtime.sql');
  log('038 applied twice (idempotent)');
  log('038 post-apply:', assertVerifier('sql/verify_038_postapply.sql'));
  const opening = psql(['-f', path.join(ROOT, 'tests/sql-local/038_room714_opening.sql')]);
  if (!opening.includes('OPENING_OK')) throw new Error('Room 714 opening scenario did not finish');
  log('Room 714 opening (two players, full chapter): OPENING_OK');

  const scenario = psql(['-f', path.join(ROOT, 'tests/sql-local/037_runtime_behavior.sql')]);
  if (!scenario.includes('RT_SCENARIO_OK')) throw new Error('behaviour scenario did not finish');
  log('behaviour scenario: RT_SCENARIO_OK');
  return concurrency(log);
}

// Two real connections. P1 holds session S's runtime lock inside an open
// transaction; P2 on the SAME session must time out waiting; P3 on ANOTHER
// session must not wait at all.
async function concurrency(log) {
  const S = '00000000-0000-4000-8000-000000000037';
  const S2 = '00000000-0000-4000-8000-000000000038';
  const A = '00000000-0000-4000-8000-0000000000a1';
  psql(['-c', `insert into public.sessions (id, case_id, code, host_id, status, started_at) values ('${S2}', 'rt-test-037', 'RT0038', '${A}', 'active', now());
               insert into public.session_members (session_id, user_id, specialization, is_host) values ('${S2}', '${A}', 'field', true);
               insert into public.session_member_specializations (session_id, user_id, specialization, is_primary) values ('${S2}', '${A}', 'field', true);`]);
  const as = `set role authenticated; set request.jwt.claim.sub = '${A}';`;
  const holder = spawn('psql', [...base, '-d', DB, '-c', `begin; ${as} select public.runtime_settle('${S}'); select pg_sleep(3); commit;`]);
  const held = new Promise((res) => holder.on('exit', (c) => res(c)));
  await new Promise((r) => setTimeout(r, 800));
  const same = spawnSync('psql', [...base, '-d', DB, '-c', `set lock_timeout = '600ms'; ${as} select public.runtime_settle('${S}');`], { encoding: 'utf8' });
  if (same.status === 0 || !/lock timeout/i.test(same.stderr)) throw new Error(`same-session cascade did not serialize: ${same.stderr}`);
  const other = spawnSync('psql', [...base, '-d', DB, '-c', `set lock_timeout = '600ms'; ${as} select public.runtime_settle('${S2}');`], { encoding: 'utf8' });
  if (other.status !== 0) throw new Error(`another session was blocked: ${other.stderr}`);
  const waited = spawnSync('psql', [...base, '-d', DB, '-c', `${as} select public.runtime_settle('${S}');`], { encoding: 'utf8' });
  if (waited.status !== 0) throw new Error(`waiting cascade failed: ${waited.stderr}`);
  if ((await held) !== 0) throw new Error('lock-holding transaction failed');
  log('concurrency: same session serialized (lock timeout), other session unblocked, waiter completed after release');
  return noDeadlock(log, S);
}

// T1 = a player transaction that holds object row PHONE and only reaches the
// runtime (deferred trigger → session lock) at COMMIT. T2 = another
// transaction whose commit-time cascade (holding the session lock) needs
// PHONE. Before the fix this was a 40P01 that killed T1. Now T2's firing is
// undone after ≤ 250 ms and fires in T1's own cascade: both commit.
async function noDeadlock(log, S) {
  psql(['-c', `insert into case_leads (case_id, lead_code, label) values ('rt-test-037', 'L_DL', 'TEST') on conflict do nothing;`]);
  psql(['-c', `insert into case_world_states (case_id, state_code, major, presentation, headline) values ('rt-test-037', 'W_DL', false, 'silent', 'T');
               insert into case_runtime_rules (case_id, rule_id, status, scope, conditions, effects, sort_order)
               values ('rt-test-037', 'T_DL', 'approved', 'team', '[{"kind":"world_state","state":"W_DL"}]',
                       '[{"kind":"open_lead","lead":"L_DL"}]', 200),
                      ('rt-test-037', 'T_DL_ADVANCE', 'approved', 'team', '[{"kind":"lead","lead":"L_DL","status":"open"},{"kind":"object_state","object":"PHONE","states":["EXTRACTED"]}]',
                       '[{"kind":"advance_object_state","object":"PHONE","from":"EXTRACTED","to":"DONE"}]', 201);`]);
  const t1 = spawn('psql', [...base, '-d', DB, '-c', `begin; update session_object_state set updated_at = now() where session_id = '${S}' and object_code = 'PHONE'; select pg_sleep(1.5); commit;`]);
  let t1err = '';
  t1.stderr.on('data', (d) => (t1err += d));
  const t1done = new Promise((res) => t1.on('exit', (c) => res(c)));
  await new Promise((r) => setTimeout(r, 400));
  const t2 = spawnSync('psql', [...base, '-d', DB, '-c', `begin; insert into session_world_state (session_id, state_code) values ('${S}', 'W_DL'); commit;`], { encoding: 'utf8' });
  const c1 = await t1done;
  if (t2.status !== 0) throw new Error(`T2 failed: ${t2.stderr}`);
  if (c1 !== 0) throw new Error(`player transaction lost (deadlock?): ${t1err}`);
  const state = psql(['-Atc', `select state from session_object_state where session_id = '${S}' and object_code = 'PHONE'`]).trim();
  if (state !== 'DONE') throw new Error(`deferred firing never happened: PHONE = ${state}`);
  log('no deadlock: player transaction committed; the blocked firing re-fired in its own cascade');
  if (process.env.IFADA_LOCAL_PG_MUTATIONS !== '0') {
    mutations(log);
    mutations038(log);
  }
  return true;
}

// Apply `sql` with a failing statement injected just before its final COMMIT
// (or at the end if there is none): psql must fail, and the database must
// still pass the PRE-apply verifier — nothing of 037 survived.
function atomicity(sql, db) {
  const at = sql.lastIndexOf('\ncommit;');
  const broken = at >= 0 ? `${sql.slice(0, at)}\nselect 1 / 0; -- injected\n${sql.slice(at)}` : `${sql}\nselect 1 / 0; -- injected\n`;
  const r = spawnSync('psql', [...base, '-d', db, '-f', '-'], { encoding: 'utf8', input: broken });
  if (r.status === 0 || !/division by zero/.test(r.stderr)) throw new Error(`atomicity: injected failure did not abort 037: ${r.stderr}`);
  assertVerifier('sql/verify_037_preapply.sql', db);
}

// Each mutation removes ONE protection from a copy of 037. The full suite
// (post-verifier + behaviour scenario, or the atomicity check) must then fail
// on the named check. A mutation that survives = a protection nobody tests.
const MUTATIONS = [
  { name: 'runtime: open-case root counts as object_discovered', expect: 'initial root: object_discovered never fires',
    from: 'if not found or (not v_gated and v_parent is null) then', to: 'if not found then' },
  { name: 'authoring: open-case root accepted in object_discovered', expect: 'authoring refused H_ROOT_DISC_TEAM',
    from: "and not o.gated and nullif(trim(o.parent_code), '') is null) then", to: 'and false) then' },
  { name: 'authoring: initial material accepted as runtime-only', expect: 'authoring refused H_DELIVER_INITIAL', from: 'or v_init then', to: 'then' },
  { name: 'team open_lead leaves a private lead private', expect: 'team open PROMOTED',
    from: 'on conflict (session_id, lead_code) do update\n        set is_shared = true,\n            shared_at = coalesce(public.session_leads.shared_at, now())\n        where not public.session_leads.is_shared;',
    to: 'on conflict do nothing;' },
  { name: 'evidence guard disabled', expect: 'guard fails closed: evidence requires (delivered)',
    from: '  v_identity := tg_op', to: '  return coalesce(new, old);\n  v_identity := tg_op' },
  { name: 'evidence guard ignores requires/is_initial of delivered material', expect: 'guard fails closed: evidence requires (delivered)',
    from: 'if v_delivered\n     or (v_identity', to: 'if (v_delivered and v_identity)\n     or (v_identity' },
  { name: 'object guard disabled', expect: 'guard fails closed: object gated',
    from: "  if tg_op = 'UPDATE' and new.code is not distinct from old.code and new.case_id is not distinct from old.case_id\n     and new.gated",
    to: "  return coalesce(new, old);\n  if tg_op = 'UPDATE' and new.code is not distinct from old.code and new.case_id is not distinct from old.case_id\n     and new.gated" },
  { name: 'object guard ignores ancestors', expect: 'guard fails closed: ancestor gated', from: 'sub.depth < 9', to: 'sub.depth < 0' },
  { name: 'lead guard disabled', expect: 'guard fails closed: lead code',
    from: "  if tg_op = 'UPDATE' and new.lead_code", to: "  return coalesce(new, old);\n  if tg_op = 'UPDATE' and new.lead_code" },
  { name: 'world-state guard ignores case_id', expect: 'guard fails closed: world case_id',
    from: 'new.state_code is not distinct from old.state_code\n     and new.case_id is not distinct from old.case_id then', to: 'new.state_code is not distinct from old.state_code then' },
  { name: 'truncate guard disabled', expect: 'guard fails closed: truncate leads',
    from: "if exists (select 1 from public.case_runtime_rules r where r.status = 'approved') then", to: 'if false then' },
  { name: 'open_investigation stays anon-executable', expect: 'X5 authenticated-only (authenticated yes, anon no, PUBLIC no): public.open_investigation(uuid)',
    from: 'revoke execute on function public.open_investigation(uuid)         from public, anon;\n', to: '' },
  { name: 'CONTRADICTION back in the pulse taxonomy', expect: 'P3 CONTRADICTION is not a pulse category anywhere: session_pulses',
    from: "'RECORD','NEW_ACTION')),\n  created_at", to: "'RECORD','CONTRADICTION','NEW_ACTION')),\n  created_at" },
  { name: 'migration not atomic (BEGIN/COMMIT removed)', expect: 'atomicity', atomic: true, from: '\nbegin;\n', to: '\n', also: ['\ncommit;\n', '\n'] },
];

function mutations(log) {
  let killed = 0;
  const detail = [];
  for (const m of MUTATIONS) {
    const edits = [[m.from, m.to], ...(m.also ? [m.also] : [])];
    let sql = SQL037;
    for (const [from, to] of edits) {
      if (sql.split(from).length !== 2) throw new Error(`mutation "${m.name}": anchor must occur exactly once: ${from}`);
      sql = sql.replace(from, to);
    }
    psql(['-c', `drop database if exists ${MUT}`], { db: 'postgres' });
    psql(['-c', `create database ${MUT} template ${TPL}`], { db: 'postgres' });
    // verifier and behaviour scenario run independently: a mutation is killed
    // when either names the expected check (both layers are reported)
    const failures = [];
    const attempt = (label, fn) => { try { fn(); } catch (e) { failures.push(`${label}: ${e.message}`); } };
    if (m.atomic) {
      attempt('atomicity', () => atomicity(sql, MUT));
    } else {
      psql(['-f', '-'], { db: MUT, input: sql });
      attempt('post-verifier', () => assertVerifier('sql/verify_037_postapply.sql', MUT));
      attempt('scenario', () => {
        const out = psql(['-f', path.join(ROOT, 'tests/sql-local/037_runtime_behavior.sql')], { db: MUT });
        if (!out.includes('RT_SCENARIO_OK')) throw new Error('scenario did not finish');
      });
    }
    if (failures.length === 0) throw new Error(`mutation SURVIVED (protection not load-bearing): ${m.name}`);
    if (!failures.some((f) => f.includes(m.expect))) throw new Error(`mutation "${m.name}" failed for the wrong reason:\n${failures.join('\n').slice(0, 800)}`);
    detail.push(`${m.name} → ${failures.map((f) => f.split(':')[0]).join(' + ')}`);
    killed += 1;
  }
  psql(['-c', `drop database if exists ${MUT}`], { db: 'postgres' });
  psql(['-c', `drop database if exists ${TPL}`], { db: 'postgres' });
  log(`mutations: ${killed}/${MUTATIONS.length} killed, each on its named check`);
  for (const d of detail) log('  killed:', d);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLocal().then(() => console.log('SQL LOCAL 037: ALL PASS'), (e) => { console.error(e.message); process.exit(1); });
}

// 038 mutations: each removes ONE opening protection; the post-038 verifier or the
// two-player opening scenario must fail on the named check.
const MUTATIONS_038 = [
  // killed one layer earlier: 037's validator refuses to approve a delivery of initial material
  { name: 'draft handed out at case start again', expect: 'delivered material must be runtime-only (requires = {@RUNTIME}, not initial)',
    from: "set is_initial = false, requires = '{@RUNTIME}'\nwhere case_id = 'room-714'\n  and code in ('D-01', ", to: "set is_initial = false, requires = '{@RUNTIME}'\nwhere case_id = 'room-714'\n  and code in (" },
  { name: 'RAMI_FOUND trigger (F-04) left on the legacy path', expect: 'F-04 refused on the legacy path',
    from: "'F-04', 'F-06', 'F-07', 'R-03'); -- held", to: "'F-06', 'F-07', 'R-03'); -- held" },
  { name: 'later-chapter clue (V-08) left on the legacy path', expect: 'V-08 (later chapter) refused on the legacy path',
    from: "  and code not in ('V-01', 'D-01', 'R-01', 'F-01', 'F-02', 'D-02',", to: "  and code not in ('V-01', 'D-01', 'R-01', 'F-01', 'F-02', 'D-02', 'V-08'," },
  { name: 'M1 plan (R-03) left on the legacy path', expect: 'Q is offered nothing on the legacy list',
    from: "'F-07', 'R-03'); -- held", to: "'F-07'); -- held" },
  { name: 'security office not gated', expect: 'security office (gated) never seeded',
    from: "set gated = true\nwhere case_id = 'room-714' and code = 'SECURITY_OFFICE';", to: "set gated = false\nwhere case_id = 'room-714' and code = 'SECURITY_OFFICE';" },
  { name: 'records lookup still locked behind a share', expect: 'CHALLENGE_NOT_FOUND',
    from: "update public.investigation_challenges\nset requires_shared = false\nwhere case_id = 'room-714' and code = 'GUEST_FILE_LOOKUP';", to: "" },
  { name: 'only field can notice (no specialist noticing)', expect: 'Q (digital+records) can notice the device',
    from: ',\n  {"code":"INSPECT_DIGITAL","label":"عاين سطحياً","spec":"digital","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0}', to: '' },
  { name: 'lab result text repeats the restricted report', expect: 'Q sees that a result exists, not what it says',
    from: '{"ANALYZED": "وصلت نتيجة التحليل المخبري للعيّنة. التقرير الكامل محفوظ في ملف القضية."}', to: '{"ANALYZED": "الدم يعود لأنثى."}' },
  { name: 'insight lead opened for the whole team (leaks the reader’s material)', expect: 'insight lead is private to the records reader',
    from: "('room-714', 'R714_INSIGHT_GUEST', 'approved', 'actor',", to: "('room-714', 'R714_INSIGHT_GUEST', 'approved', 'team'," },
  { name: 'scene report without the whole room documented', expect: 'no scene report while the window is undocumented',
    from: ',\n   {"kind":"object_discovered","object":"OPEN_WINDOW"}', to: '' },
];

function mutations038(log) {
  let killed = 0;
  for (const m of MUTATIONS_038) {
    if (SQL038.split(m.from).length !== 2) throw new Error(`038 mutation "${m.name}": anchor must occur exactly once`);
    const sql = SQL038.replace(m.from, m.to);
    psql(['-c', `drop database if exists ${MUT}`], { db: 'postgres' });
    psql(['-c', `create database ${MUT} template ${TPL38}`], { db: 'postgres' });
    const failures = [];
    try {
      psql(['-f', '-'], { db: MUT, input: sql });
    } catch (e) {
      failures.push(`apply: ${e.message}`);
    }
    if (failures.length === 0) {
      try { assertVerifier('sql/verify_038_postapply.sql', MUT); } catch (e) { failures.push(`post-verifier: ${e.message}`); }
      try {
        const out = psql(['-f', path.join(ROOT, 'tests/sql-local/038_room714_opening.sql')], { db: MUT });
        if (!out.includes('OPENING_OK')) failures.push('scenario: did not finish');
      } catch (e) { failures.push(`scenario: ${e.message}`); }
    }
    if (failures.length === 0) throw new Error(`038 mutation SURVIVED: ${m.name}`);
    if (!failures.some((f) => f.includes(m.expect))) throw new Error(`038 mutation "${m.name}" failed for the wrong reason:\n${failures.join('\n').slice(0, 900)}`);
    killed += 1;
    log('  killed (038):', m.name);
  }
  psql(['-c', `drop database if exists ${MUT}`], { db: 'postgres' });
  psql(['-c', `drop database if exists ${TPL38}`], { db: 'postgres' });
  log(`038 mutations: ${killed}/${MUTATIONS_038.length} killed, each on its named check`);
}
