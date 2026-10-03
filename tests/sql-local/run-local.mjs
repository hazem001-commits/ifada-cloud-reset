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
// Usage: IFADA_LOCAL_PG_HOST=/path/to/socket/dir node tests/sql-local/run-local.mjs
// The target server must be a disposable local cluster (trust auth, user postgres).
// ============================================================
import { spawnSync, spawn } from 'node:child_process';
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
const file = (rel) => psql(['-f', path.join(ROOT, rel)]);
const rows = (rel) => psql(['-At', '-F', '|', '-f', path.join(ROOT, rel)]).trim().split('\n').map((l) => l.split('|'));

function assertVerifier(rel) {
  const out = rows(rel);
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
  file('sql/037_investigation_runtime.sql');
  file('sql/037_investigation_runtime.sql');
  log('037 applied twice (idempotent)');
  log('post-apply:', assertVerifier('sql/verify_037_postapply.sql'));

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
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLocal().then(() => console.log('SQL LOCAL 037: ALL PASS'), (e) => { console.error(e.message); process.exit(1); });
}
