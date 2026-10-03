// ============================================================
// tests/connections/sql037.test.ts
// 037 — Investigation Runtime foundation (REVIEW ONLY — NOT APPLIED).
// No local Postgres in CI: structural proofs on the SQL text.
//   • only two protected functions re-created, each = canonical body + ONE clause
//   • verifier md5 literals = md5 of the canonical / new bodies in this repo
//   • RLS / grants / helper EXECUTE / realtime / pulse safe columns
//   • concurrency: per-session advisory xact lock, once-only ledger,
//     bounded cascade, deferred triggers; idempotency keys
//   • engine only: no case data; TS mirrors match the SQL vocabulary
// Live behaviour against a real Postgres: tests/sql-local (opt-in).
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CASCADE_LIMITS, PULSE_CATEGORIES } from '../../src/lib/runtime/types';
import { parseCondition, parseEffect } from '../../src/lib/runtime/conditions';

const S37 = readFileSync('sql/037_investigation_runtime.sql', 'utf8');
const S20 = readFileSync('sql/020_fix_root_object_visibility.sql', 'utf8');
const S26 = readFileSync('sql/026_nested_object_visibility.sql', 'utf8');
const PRE = readFileSync('sql/verify_037_preapply.sql', 'utf8');
const POST = readFileSync('sql/verify_037_postapply.sql', 'utf8');
const MIG = readFileSync('sql/MIGRATIONS.md', 'utf8');

const code = (sql: string) => sql.replace(/--.*$/gm, '');
const CODE37 = code(S37);

/** prosrc exactly as Postgres stores it: the text between the $$ delimiters. */
function body(sql: string, fn: string): string {
  const start = sql.indexOf(`create or replace function public.${fn}(`);
  assert.ok(start >= 0, `${fn} defined`);
  const open = sql.indexOf('$$', start);
  const close = sql.indexOf('$$', open + 2);
  return sql.slice(open + 2, close);
}
const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');

function addedLines(before: string, after: string): string[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const out: string[] = [];
  let i = 0;
  for (const line of b) {
    if (i < a.length && line === a[i]) i += 1;
    else out.push(line);
  }
  assert.equal(i, a.length, 'every canonical line is preserved, in order');
  return out;
}

test('open_investigation = canonical 020 body + exactly one gated clause', () => {
  const added = addedLines(body(S20, 'open_investigation'), body(S37, 'open_investigation'));
  assert.deepEqual(added.map((l) => l.trim()), ['and not o.gated  -- 037: gated objects exist only once revealed']);
});

test('investigation_object_index = canonical 026 body + exactly one gated clause', () => {
  const added = addedLines(body(S26, 'investigation_object_index'), body(S37, 'investigation_object_index'));
  assert.deepEqual(added.map((l) => l.trim()), ['and (not o.gated or (sos.discovered and (sos.is_shared or sos.discovered_by = auth.uid())))  -- 037']);
});

test('verifier md5 literals are the md5 of the bodies in this repo (pre = canonical, post = 037)', () => {
  assert.ok(PRE.includes(`'${md5(body(S20, 'open_investigation'))}'`), 'pre: 020 open_investigation');
  assert.ok(PRE.includes(`'${md5(body(S26, 'investigation_object_index'))}'`), 'pre: 026 investigation_object_index');
  assert.ok(POST.includes(`'${md5(body(S37, 'open_investigation'))}'`), 'post: 037 open_investigation');
  assert.ok(POST.includes(`'${md5(body(S37, 'investigation_object_index'))}'`), 'post: 037 investigation_object_index');
});

test('037 re-creates no other protected function', () => {
  const fns = [...CODE37.matchAll(/create or replace function public\.([a-z_0-9]+)\(/g)].map((m) => m[1]!);
  const allowed = new Set(['open_investigation', 'investigation_object_index', 'runtime_state', 'runtime_provenance', 'share_lead', 'runtime_settle']);
  for (const f of fns) assert.ok(allowed.has(f) || f.startsWith('_runtime_'), `unexpected re-creation: ${f}`);
  for (const protectedFn of ['execute_object_interaction', 'share_object_discovery', '_object_ancestors_known', '_object_state_row_visible', 'unlock_evidence', 'evidence_index', '_evidence_readable', 'propose_connection', 'check_milestones', '_run_challenge']) {
    assert.ok(!fns.includes(protectedFn), protectedFn);
  }
});

test('engine only: no case data, no Room 714 / Scene 17 rows, no gated object flipped', () => {
  assert.ok(!/insert into public\.(case_|investigation_objects|evidence\b|cases\b)/.test(CODE37));
  assert.ok(!/update public\.investigation_objects/.test(CODE37));
  assert.ok(!/'room-714'|'scene-17'|RAMI_|M1_DISCOVERED/.test(CODE37));
  assert.ok(!/\bdelete from public\.(?!session_pulses where id = v_id)/.test(CODE37), 'the only delete is the lost-race pulse cleanup');
  assert.ok(!/drop table|truncate/i.test(CODE37));
});

test('authored + server-only tables: RLS on, no policy, every client grant revoked', () => {
  for (const t of ['case_runtime_nodes', 'case_leads', 'case_world_states', 'case_runtime_rules', 'session_pulse_sources', 'session_runtime_firings', 'session_runtime_effects', 'session_runtime_provenance']) {
    assert.match(CODE37, new RegExp(`alter table public\\.${t}\\s+enable row level security`), t);
    assert.ok(!new RegExp(`create policy \\w+ on public\\.${t}\\b`).test(CODE37), `${t} has no policy`);
    assert.match(CODE37, new RegExp(`revoke all on table public\\.${t}\\s+from public, anon, authenticated`), t);
  }
});

test('member-readable signal tables: one SELECT policy, SELECT-only grant, realtime; nothing else in realtime', () => {
  for (const t of ['session_leads', 'session_world_state', 'session_pulses']) {
    assert.match(CODE37, new RegExp(`create policy ${t}_select on public\\.${t}\\s+for select to authenticated`), t);
    assert.match(CODE37, new RegExp(`grant select on table public\\.${t}\\s+to authenticated`), t);
  }
  assert.match(CODE37, /using \(public\.is_session_member\(session_id\) and \(is_shared or holder = auth\.uid\(\)\)\)/, 'private lead rows: holder only');
  assert.match(CODE37, /array\['session_leads', 'session_world_state', 'session_pulses'\]/);
  assert.equal((CODE37.match(/alter publication/g) ?? []).length, 1);
});

test('pulse table carries safe columns only; category = the fixed TS taxonomy', () => {
  const ddl = CODE37.slice(CODE37.indexOf('create table if not exists public.session_pulses'), CODE37.indexOf('create index if not exists session_pulses_session_idx'));
  const cols = [...ddl.matchAll(/^\s{2}([a-z_]+)\s+(uuid|text|timestamptz)/gm)].map((m) => m[1]);
  assert.deepEqual(cols, ['id', 'session_id', 'actor_id', 'category', 'created_at']);
  const sqlCats = [...ddl.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(sqlCats, [...PULSE_CATEGORIES]);
  for (const forbidden of ['code', 'title', 'body', 'place', 'channel', 'spec', 'rule', 'source']) assert.ok(!new RegExp(`\\b${forbidden}\\b`).test(ddl.replace(/'[A-Z_]+'/g, '')), forbidden);
});

test('every internal helper and trigger function is revoked from public, anon, authenticated', () => {
  const helpers = [...new Set([...CODE37.matchAll(/create or replace function public\.(_runtime_[a-z_]+)\(/g)].map((m) => m[1]!))];
  assert.ok(helpers.length >= 12);
  for (const h of helpers) assert.match(CODE37, new RegExp(`revoke all on function public\\.${h}\\([^)]*\\)\\s+from public, anon, authenticated`), h);
  for (const rpc of ['runtime_state\\(uuid\\)', 'runtime_provenance\\(uuid\\)', 'share_lead\\(uuid, text\\)', 'runtime_settle\\(uuid\\)']) {
    assert.match(CODE37, new RegExp(`revoke all on function public\\.${rpc}\\s+from public, anon`), rpc);
    assert.match(CODE37, new RegExp(`grant execute on function public\\.${rpc}\\s+to authenticated`), rpc);
  }
});

test('concurrency: per-session advisory xact lock in cascade and settle; bounded; once-only ledger; deferred triggers', () => {
  const cascade = body(S37, '_runtime_cascade');
  assert.match(cascade, /pg_advisory_xact_lock\(hashtextextended\('ifada\.runtime:' \|\| p_session::text, 0\)\)/);
  for (const fn of ['runtime_settle', '_runtime_on_object_state', '_runtime_on_evidence', '_runtime_on_lead', '_runtime_on_team_fact']) {
    assert.match(body(S37, fn), /public\._runtime_cascade_safe\(/, `${fn} goes through the contained cascade`);
    assert.ok(!/public\._runtime_cascade\(/.test(body(S37, fn)), `${fn} never calls the raw cascade`);
  }
  const safe = body(S37, '_runtime_cascade_safe');
  assert.match(safe, /exception when others then\s+if sqlerrm <> 'RUNTIME_CASCADE_LIMIT' then\s+raise;/, 'only runaway is contained; real errors propagate');
  assert.match(safe, /'cascade_limit'/, 'runaway logged');
  // no deadlock: each firing is a subtransaction with a short lock wait
  assert.match(cascade, /set_config\('lock_timeout', '250ms', true\)/);
  assert.match(cascade, /exception when lock_not_available then\s+null;/);
  assert.match(cascade, /set_config\('lock_timeout', v_prev_lt, true\)/, 'lock_timeout restored');
  assert.match(cascade, new RegExp(`c_max_firings\\s+constant integer := ${CASCADE_LIMITS.maxFiringsPerTransaction};`));
  assert.match(cascade, new RegExp(`c_max_passes\\s+constant integer := ${CASCADE_LIMITS.maxPasses};`));
  assert.equal((cascade.match(/raise exception 'RUNTIME_CASCADE_LIMIT'/g) ?? []).length, 2, 'firing cap and pass cap both abort');
  assert.ok(cascade.indexOf('insert into public.session_runtime_firings') < cascade.indexOf('_runtime_apply_effect'), 'ledger row claimed before any effect');
  assert.match(cascade, /on conflict do nothing;\s+get diagnostics v_new = row_count;\s+if v_new > 0 then/, 'a concurrent/duplicate claim fires nothing');
  assert.match(cascade, /order by r\.sort_order, r\.rule_id/, 'deterministic order');
  assert.ok(!/pg_trigger_depth/.test(CODE37), 'no reliance on pg_trigger_depth');
  const triggers = [...CODE37.matchAll(/create constraint trigger (\w+)\s+after [^]*?deferrable initially deferred/g)].map((m) => m[1]);
  assert.deepEqual(triggers, ['runtime_object_state_changed', 'runtime_evidence_unlocked', 'runtime_lead_changed', 'runtime_connection_validated', 'runtime_world_state_reached']);
});

test('idempotency keys exist for every runtime write', () => {
  for (const pk of [
    /session_leads[^]*?primary key \(session_id, lead_code\)/,
    /session_world_state[^]*?primary key \(session_id, state_code\)/,
    /session_pulse_sources[^]*?primary key \(session_id, source_key\)/,
    /session_runtime_firings[^]*?primary key \(session_id, rule_id, actor_key\)/,
    /session_runtime_effects[^]*?primary key \(session_id, effect_kind, effect_id\)/,
    /session_runtime_provenance[^]*?primary key \(session_id, node_kind, node_code\)/,
  ]) assert.match(CODE37, pk);
  assert.match(body(S37, '_runtime_apply_effect'), /on conflict \(session_id, milestone_code\) do nothing/, 'one broadcast per world state');
  assert.match(body(S37, '_runtime_apply_effect'), /else \(not l\.is_shared and l\.holder = p_actor\) end/, 'actor rules touch only their own unshared lead');
});

test('privacy invariants in the SQL text', () => {
  const holds = body(S37, '_runtime_condition_holds');
  assert.match(holds, /if p_actor is not null and p_actor is distinct from auth\.uid\(\) then\s+return false;/, 'actor view = caller only');
  assert.match(holds, /_runtime_object_team_known/, 'team rules see team-known objects only');
  assert.match(holds, /_board_material_team_visible\(p_session, 'evidence'/, 'team rules see team-visible evidence only (035)');
  const onObj = body(S37, '_runtime_on_object_state');
  assert.match(onObj, /case when v_system then null else auth\.uid\(\) end/, 'auto-advance cascade is SYSTEM');
  assert.match(onObj, /new\.discovered and not new\.is_shared and new\.discovered_by is not null/, 'pulse only for private discovery');
  const onEv = body(S37, '_runtime_on_evidence');
  assert.match(onEv, /not v_ev\.is_initial/, 'initial grants never pulse');
  assert.match(onEv, /not coalesce\(public\._board_material_team_visible/, 'team-visible unlocks never pulse');
  const state = body(S37, 'runtime_state');
  assert.ok(!/rule_id|source_key|pulse_sources/.test(state), 'read model exposes no rule ids or pulse sources');
  assert.match(state, /sl\.is_shared or sl\.holder = v_me/);
  assert.match(state, /o\.gated\s+and coalesce\(public\._object_state_row_visible/);
  assert.ok(!/rule_id/.test(body(S37, 'runtime_provenance').replace(/p\.rule_id/g, 'X')), 'provenance returns no rule id');
});

test('authoring trigger enforces scope + world-state causality on approval', () => {
  const v = body(S37, '_runtime_rules_validate');
  assert.match(v, /RUNTIME_RULE_SCOPE: an actor rule cannot change the world/);
  assert.match(v, /RUNTIME_RULE_SCOPE: an actor rule cannot deliver material/);
  assert.match(v, /needs investigation progression, not evidence alone/);
  assert.match(v, /is aftermath of % and cannot cause it/);
  assert.match(v, /reveal target must be a gated object of this case/);
  assert.match(v, /delivered material must be runtime-only \(requires = \{@RUNTIME\}\)/);
  assert.match(v, /needs investigation progression, not evidence alone'/, 'follow/close/advance need progress');
  assert.match(v, /not \(v_c -> 'states'\) @> to_jsonb\(o\.initial_state\)/, 'initial state is not progress');
  assert.match(v, /o\.code = v_c ->> 'object' and not o\.gated/, 'a reveal is not progress');
  assert.match(v, /w\.state_code = v_c ->> 'state' and w\.major/, 'only a major world state is progress');
  const deliver = body(S37, '_runtime_try_deliver');
  assert.ok(!/unlock_evidence/.test(deliver), 'world delivery never goes through a player unlock path');
  assert.match(deliver, /_evidence_readable\(p_session, v_ev\.id\)/, 'same 035 readability rule');
  assert.match(deliver, /v_ev\.requires is distinct from array\['@RUNTIME'\]::text\[\]/, 'only runtime-only material');
  assert.match(CODE37, /create trigger case_world_states_guard\s+before update or delete on public\.case_world_states/);
  // TS mirror vocabulary = SQL vocabulary
  for (const kind of ['object_discovered', 'object_state', 'evidence_unlocked', 'connection_validated', 'world_state', 'lead']) {
    assert.match(v, new RegExp(`'${kind}'`), kind);
  }
  assert.ok(parseCondition({ kind: 'lead', lead: 'L', status: 'followed' }));
  for (const kind of ['open_lead', 'follow_lead', 'close_lead', 'reveal_object', 'advance_object_state', 'reach_world_state', 'deliver_evidence']) {
    assert.match(v, new RegExp(`'${kind}'`), kind);
  }
  assert.ok(parseEffect({ kind: 'deliver_evidence', evidence: 'X-01' }));
});

test('verifiers are read-only single SELECTs', () => {
  for (const [name, sql] of [['pre', PRE], ['post', POST]] as const) {
    const c = code(sql);
    assert.ok(!/\b(insert|update|delete|create|alter|drop|grant|revoke|truncate)\b\s/i.test(c.replace(/'[^']*'/g, "''")), `${name} has no writes`);
  }
});

test('MIGRATIONS.md lists 037 as REVIEW ONLY — NOT APPLIED and never claims it is live', () => {
  const row = MIG.split('\n').find((l) => l.startsWith('| 37 |'));
  assert.ok(row, '037 row present');
  assert.match(row!, /REVIEW ONLY — NOT APPLIED/);
  assert.ok(!/APPLIED \+ VERIFIED/.test(row!));
  assert.match(MIG, /`037` is \*\*not\*\* applied/);
});
