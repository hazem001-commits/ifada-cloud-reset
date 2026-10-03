-- ============================================================
-- tests/sql-local/037_runtime_behavior.sql
-- ⚠ LOCAL THROWAWAY DATABASE ONLY · TEST ONLY · NON-CANON · NEVER SEED.
-- Run by tests/sql-local/run-local.mjs against a scratch Postgres that
-- replays the MIGRATIONS.md chain + 037 on a Supabase stub. NEVER run
-- against Supabase / production: it inserts a synthetic case, users and
-- sessions.
--
-- Synthetic case 'rt-test-037' (Room-714-LIKE semantics, not canon):
--   ROOM_A (root location) ─ CUP (trace → lab), PHONE (private device job)
--   VAULT  (GATED location, team reveal) ─ BOX (search → FOUND)
--   HATCH  (GATED object, private reveal)
--   X-01 initial · X-02 aftermath material (forensics) · X-03 (digital)
--   Lead L_ROUTE (MOVEMENT), L_LAB (team), L_DEVICE (team)
--   World W_FOUND (major, broadcast)
-- Players: A = field + forensics, B = field + digital.
--
-- Every assertion raises on failure ("RT FAIL: …"); the last line prints
-- RT_SCENARIO_OK. Each statement is its own transaction (autocommit) so
-- the deferred runtime triggers fire exactly as they do behind PostgREST.
-- ============================================================
\set ON_ERROR_STOP 1
\set S '\'00000000-0000-4000-8000-000000000037\''
\set A '\'00000000-0000-4000-8000-0000000000a1\''
\set B '\'00000000-0000-4000-8000-0000000000b2\''

create schema if not exists rt_test;
create or replace function rt_test.ok(p boolean, p_label text) returns void
language plpgsql as $$ begin if p is not true then raise exception 'RT FAIL: %', p_label; end if; end $$;
grant usage on schema rt_test to authenticated;
grant execute on function rt_test.ok(boolean, text) to authenticated;

-- ------------------------------------------------------------
-- Fixtures (as owner)
-- ------------------------------------------------------------
insert into auth.users (id, email) values (:A, 'a@test.local'), (:B, 'b@test.local');
insert into public.cases (id, title, victim_name, incident_date, classification, difficulty, duration_minutes, is_published)
values ('rt-test-037', 'TEST ONLY', 'TEST', '2026-01-01', 'TEST', 1, 60, false);
insert into public.case_engine_policy (case_id, restricted_evidence, distribution) values ('rt-test-037', 'title', 'specialization');
insert into public.sessions (id, case_id, code, host_id, status, started_at) values (:S, 'rt-test-037', 'RT0037', :A, 'active', now());
insert into public.session_members (session_id, user_id, specialization, is_host) values (:S, :A, 'field', true), (:S, :B, 'digital', false);
insert into public.session_member_specializations (session_id, user_id, specialization, is_primary)
values (:S, :A, 'field', true), (:S, :A, 'forensics', false), (:S, :B, 'digital', true), (:S, :B, 'field', false);

insert into public.investigation_objects (case_id, code, parent_code, category, title, initial_state, interactions, auto_advance, gated, sort_order) values
('rt-test-037', 'ROOM_A', null, 'location', 'TEST ROOM', 'KNOWN', '[]', '{}', false, 1),
('rt-test-037', 'CUP', 'ROOM_A', 'object', 'TEST CUP', 'UNKNOWN',
 '[{"code":"INSPECT","label":"i","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED"},
   {"code":"COLLECT","label":"c","spec":"forensics","requires_state":"DISCOVERED","produces_state":"COLLECTED","requires_shared":true},
   {"code":"LAB","label":"l","spec":"forensics","requires_state":"COLLECTED","produces_state":"PROCESSING","processing_seconds":1}]',
 '{"PROCESSING":"RESULT"}', false, 2),
('rt-test-037', 'PHONE', 'ROOM_A', 'device', 'TEST PHONE', 'UNKNOWN',
 '[{"code":"INSPECT","label":"i","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED"},
   {"code":"ANALYZE","label":"a","spec":"digital","requires_state":"DISCOVERED","produces_state":"PROCESSING","processing_seconds":1}]',
 '{"PROCESSING":"EXTRACTED"}', false, 3),
('rt-test-037', 'VAULT', null, 'location', 'TEST HIDDEN PLACE', 'KNOWN', '[]', '{}', true, 4),
('rt-test-037', 'BOX', 'VAULT', 'object', 'TEST BOX', 'UNKNOWN',
 '[{"code":"INSPECT","label":"i","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED"},
   {"code":"SEARCH","label":"s","spec":"field","requires_state":"DISCOVERED","produces_state":"FOUND","requires_shared":true}]',
 '{}', false, 5),
('rt-test-037', 'HATCH', 'ROOM_A', 'object', 'TEST HATCH', 'NOTICED', '[]', '{}', true, 6);

insert into public.evidence (case_id, code, title, kind, owner_spec, body, is_initial, requires, sort_order) values
('rt-test-037', 'X-01', 'TEST INITIAL', 'document', 'field', 'test initial body', true, '{}', 1),
('rt-test-037', 'X-02', 'TEST AFTERMATH', 'document', 'forensics', 'test aftermath body', false, '{@RUNTIME}', 2),
('rt-test-037', 'X-03', 'TEST DIGITAL', 'record', 'digital', 'test digital body', false, '{}', 3);

insert into public.case_runtime_nodes (case_id, node_kind, node_code, pulse_category) values
('rt-test-037', 'object', 'CUP', 'PHYSICAL_TRACE'),
('rt-test-037', 'object', 'PHONE', 'DEVICE'),
('rt-test-037', 'object', 'HATCH', 'PLACE'),
('rt-test-037', 'object', 'BOX', 'PHYSICAL_TRACE'),
('rt-test-037', 'evidence', 'X-02', 'RECORD');
insert into public.case_leads (case_id, lead_code, label, pulse_category) values
('rt-test-037', 'L_ROUTE', 'TEST lead label', 'MOVEMENT'),
('rt-test-037', 'L_LAB', 'TEST lab lead', null),
('rt-test-037', 'L_DEVICE', 'TEST device lead', null);
insert into public.case_world_states (case_id, state_code, major, presentation, headline, body) values
('rt-test-037', 'W_FOUND', true, 'broadcast', 'TEST WORLD CHANGED', 'test');

-- ------------------------------------------------------------
-- Authoring validation (causality + scope) — all must be REFUSED
-- ------------------------------------------------------------
do $$ begin
  begin
    insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects)
    values ('rt-test-037', 'BAD_EVIDENCE_ONLY', 'approved', 'team',
            '[{"kind":"evidence_unlocked","evidence":"X-01"}]', '[{"kind":"reach_world_state","state":"W_FOUND"}]');
    raise exception 'RT FAIL: evidence-only major world state accepted';
  exception when others then
    perform rt_test.ok(sqlerrm like 'RUNTIME_RULE_CAUSALITY%', 'evidence-only major world refused: ' || sqlerrm);
  end;
  begin
    insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects)
    values ('rt-test-037', 'BAD_ACTOR_WORLD', 'draft', 'actor',
            '[{"kind":"object_discovered","object":"CUP"}]', '[{"kind":"reach_world_state","state":"W_FOUND"}]');
    raise exception 'RT FAIL: actor rule changing the world accepted';
  exception when others then
    perform rt_test.ok(sqlerrm like 'RUNTIME_RULE_SCOPE%', 'actor world refused: ' || sqlerrm);
  end;
  begin
    insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects)
    values ('rt-test-037', 'BAD_REVEAL_UNGATED', 'approved', 'team',
            '[{"kind":"object_discovered","object":"CUP"}]', '[{"kind":"reveal_object","object":"CUP"}]');
    raise exception 'RT FAIL: reveal of non-gated accepted';
  exception when others then
    perform rt_test.ok(sqlerrm like 'RUNTIME_RULE_REFERENCE%', 'reveal non-gated refused');
  end;
  begin
    insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects)
    values ('rt-test-037', 'BAD_KIND', 'draft', 'team', '[{"kind":"telepathy"}]', '[{"kind":"open_lead","lead":"L_LAB"}]');
    raise exception 'RT FAIL: unknown condition accepted';
  exception when others then
    perform rt_test.ok(sqlerrm like 'RUNTIME_RULE_INVALID%', 'unknown kind refused');
  end;
  -- progress laundering: evidence alone may not follow a lead / advance an object
  begin
    insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects)
    values ('rt-test-037', 'BAD_LAUNDER_FOLLOW', 'approved', 'team',
            '[{"kind":"evidence_unlocked","evidence":"X-01"}]', '[{"kind":"follow_lead","lead":"L_ROUTE"}]');
    raise exception 'RT FAIL: evidence-only follow accepted';
  exception when others then
    perform rt_test.ok(sqlerrm like 'RUNTIME_RULE_CAUSALITY%', 'evidence-only follow refused: ' || sqlerrm);
  end;
  -- a REVEALED (gated) object is not progress: reveal ≠ act
  begin
    insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects)
    values ('rt-test-037', 'BAD_LAUNDER_REVEAL', 'approved', 'team',
            '[{"kind":"object_discovered","object":"VAULT"}]', '[{"kind":"reach_world_state","state":"W_FOUND"}]');
    raise exception 'RT FAIL: reveal-as-progress accepted';
  exception when others then
    perform rt_test.ok(sqlerrm like 'RUNTIME_RULE_CAUSALITY%', 'reveal is not progress: ' || sqlerrm);
  end;
  -- an object still at its initial state is not progress
  begin
    insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects)
    values ('rt-test-037', 'BAD_LAUNDER_INITIAL', 'approved', 'team',
            '[{"kind":"object_state","object":"BOX","states":["UNKNOWN","FOUND"]}]', '[{"kind":"reach_world_state","state":"W_FOUND"}]');
    raise exception 'RT FAIL: initial-state-as-progress accepted';
  exception when others then
    perform rt_test.ok(sqlerrm like 'RUNTIME_RULE_CAUSALITY%', 'initial state is not progress');
  end;
  -- delivered material must be runtime-only
  begin
    insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects)
    values ('rt-test-037', 'BAD_DELIVER_PLAYER_UNLOCKABLE', 'approved', 'team',
            '[{"kind":"object_discovered","object":"CUP"}]', '[{"kind":"deliver_evidence","evidence":"X-03"}]');
    raise exception 'RT FAIL: player-unlockable delivery accepted';
  exception when others then
    perform rt_test.ok(sqlerrm like 'RUNTIME_RULE_CAUSALITY%runtime-only%', 'delivery target must be runtime-only');
  end;
end $$;

-- Approved NON-CANON rules (the loop under test)
insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects, sort_order) values
('rt-test-037', 'T1_TRACE_OPENS_LEAD', 'approved', 'actor',
 '[{"kind":"object_state","object":"CUP","states":["DISCOVERED","COLLECTED","PROCESSING","RESULT"]}]',
 '[{"kind":"open_lead","lead":"L_ROUTE"},{"kind":"reveal_object","object":"HATCH"}]', 1),
('rt-test-037', 'T2_SHARED_LEAD_OPENS_PLACE', 'approved', 'team',
 '[{"kind":"lead","lead":"L_ROUTE","status":"open"}]',
 '[{"kind":"reveal_object","object":"VAULT"}]', 2),
('rt-test-037', 'T3_SEARCH_CHANGES_WORLD', 'approved', 'team',
 '[{"kind":"object_state","object":"BOX","states":["FOUND"]}]',
 '[{"kind":"follow_lead","lead":"L_ROUTE"},{"kind":"reach_world_state","state":"W_FOUND"}]', 3),
('rt-test-037', 'T4_WORLD_DELIVERS_AFTERMATH', 'approved', 'team',
 '[{"kind":"world_state","state":"W_FOUND"}]',
 '[{"kind":"deliver_evidence","evidence":"X-02"}]', 4),
('rt-test-037', 'T5_LAB_RESULT_TEAM_LEAD', 'approved', 'team',
 '[{"kind":"object_state","object":"CUP","states":["RESULT"]}]',
 '[{"kind":"open_lead","lead":"L_LAB"}]', 5),
('rt-test-037', 'T6_PRIVATE_DEVICE_NOT_TEAM', 'approved', 'team',
 '[{"kind":"object_state","object":"PHONE","states":["EXTRACTED"]}]',
 '[{"kind":"open_lead","lead":"L_DEVICE"}]', 6),
('rt-test-037', 'T7_ACTOR_CANNOT_TOUCH_TEAM_LEAD', 'approved', 'actor',
 '[{"kind":"object_state","object":"CUP","states":["RESULT"]}]',
 '[{"kind":"follow_lead","lead":"L_LAB"}]', 7);

-- a world state used by approved rules cannot change class underneath them
do $$ begin
  update public.case_world_states set major = false where case_id = 'rt-test-037' and state_code = 'W_FOUND';
  raise exception 'RT FAIL: major flipped under approved rules';
exception when others then
  perform rt_test.ok(sqlerrm like 'RUNTIME_RULE_CAUSALITY%', 'world-state guard: ' || sqlerrm);
end $$;

-- aftermath inversion: X-02 is delivered BECAUSE of W_FOUND → may not cause it
do $$ begin
  insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects)
  values ('rt-test-037', 'BAD_AFTERMATH_CAUSE', 'approved', 'team',
          '[{"kind":"object_discovered","object":"CUP"},{"kind":"evidence_unlocked","evidence":"X-02"}]',
          '[{"kind":"reach_world_state","state":"W_FOUND"}]');
  raise exception 'RT FAIL: aftermath-as-cause accepted';
exception when others then
  perform rt_test.ok(sqlerrm like 'RUNTIME_RULE_CAUSALITY%', 'aftermath inversion refused: ' || sqlerrm);
end $$;

-- ------------------------------------------------------------
-- Play: both players open the case/investigation
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.open_case(:S);
select public.open_investigation(:S);
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
select public.open_case(:S);
select public.open_investigation(:S);
reset role;

-- gated objects never seeded; initial grant made no pulse
select rt_test.ok(not exists (select 1 from session_object_state where session_id = :S and object_code in ('VAULT','HATCH')), 'gated objects not seeded');
select rt_test.ok((select count(*) from session_pulses where session_id = :S) = 0, 'no pulse for initial grants / root seeding');

-- B cannot see the gated place, its child, or any trace of them
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
select rt_test.ok(not exists (select 1 from investigation_object_index(:S) where code in ('VAULT','BOX','HATCH')), 'B: gated place + child + hatch absent from index');
select rt_test.ok(not exists (select 1 from investigation_object_index(:S) where parent_code in ('VAULT')), 'B: no breadcrumb to gated place');
select rt_test.ok((select count(*) from session_object_state where session_id = :S and object_code in ('VAULT','BOX','HATCH')) = 0, 'B: direct select shows no gated rows');
select rt_test.ok((public.runtime_state(:S) -> 'places') = '[]'::jsonb, 'B: no places before reveal');

-- ------------------------------------------------------------
-- OBSERVE → ACT → DISCOVER: A inspects the cup privately
-- ------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.execute_object_interaction(:S, 'CUP', 'INSPECT');
reset role;

-- PULSE: B learns something happened, never what
select rt_test.ok((select count(*) from session_pulses where session_id = :S and category = 'PHYSICAL_TRACE' and actor_id = :A) = 1, 'pulse: A private trace');
select rt_test.ok((select count(*) from session_pulses where session_id = :S and category = 'MOVEMENT' and actor_id = :A) = 1, 'pulse: A private lead');
select rt_test.ok((select count(*) from session_pulses where session_id = :S and category = 'PLACE' and actor_id = :A) = 1, 'pulse: A private hatch reveal');
select rt_test.ok((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
                   where table_schema = 'public' and table_name = 'session_pulses')
                  = array['id','session_id','actor_id','category','created_at'], 'pulse table carries safe columns only');

-- private lead + private reveal stay private to A
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
select rt_test.ok((select count(*) from session_leads where session_id = :S) = 0, 'B: A''s private lead invisible (RLS)');
select rt_test.ok(jsonb_array_length(public.runtime_state(:S) -> 'leads') = 0, 'B: runtime_state has no A lead');
select rt_test.ok(jsonb_array_length(public.runtime_state(:S) -> 'pulses') = 3, 'B: sees 3 pulses');
select rt_test.ok(not (public.runtime_state(:S)::text ~ '(CUP|HATCH|L_ROUTE|TEST lead|TEST CUP|TEST HATCH)'), 'B: runtime_state leaks no code/title/label');
select rt_test.ok(not exists (select 1 from investigation_object_index(:S) where code = 'HATCH'), 'B: A''s private gated HATCH not even redacted');
select rt_test.ok(exists (select 1 from investigation_object_index(:S) where code = 'CUP' and state = 'HIDDEN'), 'B: non-gated CUP keeps existing redacted semantics');
select rt_test.ok(not exists (select 1 from public.runtime_provenance(:S) where node_code in ('HATCH','L_ROUTE')), 'B: provenance of A''s private nodes hidden');
do $$ begin
  perform 1 from public.session_pulse_sources;
  raise exception 'RT FAIL: pulse sources readable';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform 1 from public.case_runtime_rules;
  raise exception 'RT FAIL: rules readable';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public._runtime_cascade('00000000-0000-4000-8000-000000000037', null);
  raise exception 'RT FAIL: cascade executable';
exception when insufficient_privilege then null; end $$;
do $$ begin
  begin
    perform public.share_lead('00000000-0000-4000-8000-000000000037', 'L_ROUTE');
    raise exception 'RT FAIL: B shared A''s lead';
  exception when others then
    perform rt_test.ok(sqlerrm = 'LEAD_NOT_FOUND', 'B cannot share A''s lead (neutral)');
  end;
end $$;

set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select rt_test.ok((public.runtime_state(:S) -> 'leads' -> 0 ->> 'lead') = 'L_ROUTE', 'A: holds lead');
select rt_test.ok(exists (select 1 from jsonb_array_elements(public.runtime_state(:S) -> 'places') p where p ->> 'code' = 'HATCH'), 'A: sees private HATCH place');
select rt_test.ok(exists (select 1 from investigation_object_index(:S) where code = 'HATCH' and state = 'NOTICED'), 'A: HATCH in index');
select rt_test.ok(not exists (select 1 from jsonb_array_elements(public.runtime_state(:S) -> 'places') p where p ->> 'code' = 'VAULT'), 'A: VAULT not revealed by a private lead');

-- ------------------------------------------------------------
-- FOLLOW: A shares the lead → team rule reveals the gated place
-- ------------------------------------------------------------
select public.share_lead(:S, 'L_ROUTE');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
select rt_test.ok(exists (select 1 from investigation_object_index(:S) where code = 'VAULT' and is_shared), 'B: team-revealed VAULT visible');
select rt_test.ok(exists (select 1 from investigation_object_index(:S) where code = 'BOX' and state = 'UNKNOWN'), 'B: child of revealed place now listed');
select rt_test.ok(not exists (select 1 from investigation_object_index(:S) where code = 'HATCH'), 'B: HATCH still private');
select rt_test.ok(jsonb_array_length(public.runtime_state(:S) -> 'leads') = 1, 'B: shared lead visible');
reset role;
select rt_test.ok((select count(*) from session_pulses where session_id = :S) = 3, 'team reveal emits no asymmetry pulse');

-- runtime-only aftermath: even its reader cannot fetch it directly
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
do $$ begin
  perform public.unlock_evidence('00000000-0000-4000-8000-000000000037', 'X-02');
  raise exception 'RT FAIL: aftermath unlocked directly';
exception when others then
  perform rt_test.ok(sqlerrm = 'REQUIREMENTS_NOT_MET', 'direct unlock of runtime-only material refused: ' || sqlerrm);
end $$;
select rt_test.ok(not exists (select 1 from public.unlockable_evidence('00000000-0000-4000-8000-000000000037') u where u.code = 'X-02'), 'runtime-only material never offered as unlockable');
reset role;

-- ------------------------------------------------------------
-- ACT at the new place → WORLD REACTS → aftermath material
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
select public.execute_object_interaction(:S, 'BOX', 'INSPECT');
select public.share_object_discovery(:S, 'BOX');
select public.execute_object_interaction(:S, 'BOX', 'SEARCH');
reset role;
select rt_test.ok(exists (select 1 from session_world_state where session_id = :S and state_code = 'W_FOUND'), 'world state reached by the search');
select rt_test.ok((select count(*) from session_events where session_id = :S and milestone_code = 'W_FOUND') = 1, 'one broadcast via session_events');
select rt_test.ok((select status from session_leads where session_id = :S and lead_code = 'L_ROUTE') = 'followed', 'lead followed');
-- B (field+digital) cannot receive forensics material → pending, not misattributed
select rt_test.ok((select status from session_runtime_effects where session_id = :S and effect_kind = 'deliver_evidence' and effect_id = 'X-02') = 'pending', 'aftermath pending for a non-reader');
select rt_test.ok(not exists (select 1 from session_evidence se join evidence e on e.id = se.evidence_id where se.session_id = :S and e.code = 'X-02'), 'X-02 not yet unlocked');
-- the aftermath did NOT cause the world state: world reached before X-02 exists
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.runtime_settle(:S);
reset role;
select rt_test.ok((select status from session_runtime_effects where session_id = :S and effect_kind = 'deliver_evidence' and effect_id = 'X-02') = 'applied', 'aftermath delivered when a reader settles');
select rt_test.ok((select se.unlocked_at > w.reached_at from session_evidence se join evidence e on e.id = se.evidence_id, session_world_state w
                   where se.session_id = :S and e.code = 'X-02' and w.session_id = :S and w.state_code = 'W_FOUND'), 'causal order: world → aftermath');
-- Room 714 title policy: X-02 unlock is team-visible (title) → no asymmetry pulse
select rt_test.ok(not exists (select 1 from session_pulses where session_id = :S and category = 'RECORD'), 'team-visible (title) unlock emits no pulse');

-- ------------------------------------------------------------
-- PROCESSING: read-time completion is SYSTEM, never the reader
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.share_object_discovery(:S, 'CUP');
select public.execute_object_interaction(:S, 'CUP', 'COLLECT');
select public.execute_object_interaction(:S, 'CUP', 'LAB');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
select public.execute_object_interaction(:S, 'PHONE', 'INSPECT');
select public.execute_object_interaction(:S, 'PHONE', 'ANALYZE');
reset role;
select pg_sleep(1.3);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select count(*) from public.investigation_object_index(:S);   -- A's READ settles both jobs
reset role;
select rt_test.ok((select state from session_object_state where session_id = :S and object_code = 'CUP') = 'RESULT', 'shared lab job completed on read');
select rt_test.ok((select actor_id is null from session_runtime_firings where session_id = :S and rule_id = 'T5_LAB_RESULT_TEAM_LEAD'), 'read-settled firing is SYSTEM, not the reader');
select rt_test.ok((select actor_id is null from session_runtime_provenance where session_id = :S and node_kind = 'lead' and node_code = 'L_LAB'), 'provenance actor is SYSTEM');
select rt_test.ok((select count(*) from session_pulses where session_id = :S and category = 'DEVICE' and actor_id is null) = 1, 'private device result: one SYSTEM pulse');
select rt_test.ok((select count(*) from session_pulses where session_id = :S and category = 'DEVICE' and actor_id = :B) = 1, 'B private phone discovery pulse');
select rt_test.ok(not exists (select 1 from session_leads where session_id = :S and lead_code = 'L_DEVICE'), 'private result never causes a team effect');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
select public.share_object_discovery(:S, 'PHONE');
reset role;
select rt_test.ok((select actor_id from session_runtime_firings where session_id = :S and rule_id = 'T6_PRIVATE_DEVICE_NOT_TEAM') = :B, 'after sharing, team rule fires attributed to the sharer');
select rt_test.ok((select status from session_leads where session_id = :S and lead_code = 'L_LAB') = 'open', 'an actor rule cannot follow a TEAM lead');

-- ------------------------------------------------------------
-- IDEMPOTENCY: repeated settles / reads change nothing
-- ------------------------------------------------------------
create temp table rt_snap as
select (select count(*) from session_pulses where session_id = :S) p,
       (select count(*) from session_runtime_firings where session_id = :S) f,
       (select count(*) from session_events where session_id = :S) e,
       (select count(*) from session_leads where session_id = :S) l;
grant select on rt_snap to authenticated;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.runtime_settle(:S);
select public.runtime_settle(:S);
select count(*) from public.investigation_object_index(:S);
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
select public.runtime_settle(:S);
select public.share_lead(:S, 'L_ROUTE');
reset role;
select rt_test.ok((select p = (select count(*) from session_pulses where session_id = :S)
                     and f = (select count(*) from session_runtime_firings where session_id = :S)
                     and e = (select count(*) from session_events where session_id = :S)
                     and l = (select count(*) from session_leads where session_id = :S) from rt_snap), 'idempotent: nothing duplicated');

-- ------------------------------------------------------------
-- CASCADE BOUND: 40 once-only rules fired by one transaction → rollback
-- ------------------------------------------------------------
insert into public.case_world_states (case_id, state_code, major, presentation, headline) values ('rt-test-037', 'W_FLOOD', false, 'silent', 'TEST');
insert into public.case_leads (case_id, lead_code, label) select 'rt-test-037', 'L_FLOOD_' || g, 'TEST' from generate_series(1, 40) g;
insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects, sort_order)
select 'rt-test-037', 'T_FLOOD_' || g, 'approved', 'team', '[{"kind":"world_state","state":"W_FLOOD"}]',
       jsonb_build_array(jsonb_build_object('kind', 'open_lead', 'lead', 'L_FLOOD_' || g)), 100 + g
from generate_series(1, 40) g;
insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects, sort_order)
values ('rt-test-037', 'T_FLOOD_TRIGGER', 'approved', 'team', '[{"kind":"object_state","object":"PHONE","states":["EXTRACTED"]},{"kind":"lead","lead":"L_DEVICE","status":"open"}]',
        '[{"kind":"reach_world_state","state":"W_FLOOD"}]', 99);
-- the player's own action (here: a settle; below: a real interaction) still commits
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.runtime_settle(:S);
reset role;
select rt_test.ok(not exists (select 1 from session_world_state where session_id = :S and state_code = 'W_FLOOD'), 'runaway cascade effects rolled back entirely');
select rt_test.ok((select count(*) from session_leads where session_id = :S and lead_code like 'L_FLOOD_%') = 0, 'no partial runaway effects');
select rt_test.ok(not exists (select 1 from session_runtime_firings where session_id = :S and rule_id like 'T_FLOOD%'), 'runaway ledger claims rolled back');
select rt_test.ok(exists (select 1 from session_runtime_effects where session_id = :S and effect_kind = 'effect_error' and effect_id = 'cascade_limit'), 'runaway logged as a content fault');
-- the game keeps working: a normal action still succeeds while content is bad
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.share_object_discovery(:S, 'HATCH');
reset role;
select rt_test.ok((select is_shared from session_object_state where session_id = :S and object_code = 'HATCH'), 'player action commits despite runaway content');
delete from public.case_runtime_rules where case_id = 'rt-test-037' and rule_id like 'T_FLOOD%';

select 'RT_SCENARIO_OK' as result;
