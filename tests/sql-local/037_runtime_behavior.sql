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


-- ============================================================
-- HARDENING (RESET-1 patch) — separate synthetic case 'rt-test-037b'
-- so the rules above stay untouched. TEST ONLY · NON-CANON.
--   ROOT_B  root, non-gated (open-case known) — SEAL → SEALED (real act)
--   KID     child of ROOT_B (found through play)
--   GATE_B  gated root (evidence-driven reveal)
--   VAULT_B gated root ─ SAFE (child) — ancestor guard
--   E-01 initial · E-02 player-unlockable · E-RT runtime-only
-- ============================================================
\set SB '\'00000000-0000-4000-8000-000000000039\''
insert into public.cases (id, title, victim_name, incident_date, classification, difficulty, duration_minutes, is_published)
values ('rt-test-037b', 'TEST ONLY B', 'TEST', '2026-01-01', 'TEST', 1, 60, false);
insert into public.case_engine_policy (case_id, restricted_evidence, distribution) values ('rt-test-037b', 'title', 'specialization');
insert into public.sessions (id, case_id, code, host_id, status, started_at) values (:SB, 'rt-test-037b', 'RT0039', :A, 'active', now());
insert into public.session_members (session_id, user_id, specialization, is_host) values (:SB, :A, 'field', true), (:SB, :B, 'digital', false);
insert into public.session_member_specializations (session_id, user_id, specialization, is_primary)
values (:SB, :A, 'field', true), (:SB, :A, 'forensics', false), (:SB, :B, 'digital', true), (:SB, :B, 'field', false);
insert into public.investigation_objects (case_id, code, parent_code, category, title, initial_state, interactions, auto_advance, gated, sort_order) values
('rt-test-037b', 'ROOT_B', null, 'location', 'TEST ROOT B', 'KNOWN',
 '[{"code":"SEAL","label":"s","spec":"field","requires_state":"KNOWN","produces_state":"SEALED"}]', '{}', false, 1),
('rt-test-037b', 'KID', 'ROOT_B', 'object', 'TEST KID', 'UNKNOWN',
 '[{"code":"INSPECT","label":"i","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED"}]', '{}', false, 2),
('rt-test-037b', 'GATE_B', null, 'location', 'TEST GATE B', 'KNOWN', '[]', '{}', true, 3),
('rt-test-037b', 'VAULT_B', null, 'location', 'TEST VAULT B', 'KNOWN', '[]', '{}', true, 4),
('rt-test-037b', 'SAFE', 'VAULT_B', 'object', 'TEST SAFE', 'UNKNOWN', '[]', '{}', false, 5);
insert into public.evidence (case_id, code, title, kind, owner_spec, body, is_initial, requires, sort_order) values
('rt-test-037b', 'E-01', 'TEST B INITIAL', 'document', 'field', 'b initial', true, '{}', 1),
('rt-test-037b', 'E-02', 'TEST B CLUE', 'document', 'field', 'b clue', false, '{}', 2),
('rt-test-037b', 'E-RT', 'TEST B AFTERMATH', 'document', 'field', 'b aftermath', false, '{@RUNTIME}', 3),
('rt-test-037b', 'E-RTI', 'TEST B INITIAL RUNTIME', 'document', 'field', 'b bad', true, '{@RUNTIME}', 4);
insert into public.case_leads (case_id, lead_code, label, pulse_category) values
('rt-test-037b', 'L_ROOT', 'TEST b root lead', null),
('rt-test-037b', 'L_PROMO', 'TEST b promo lead', 'PERSON'),
('rt-test-037b', 'L_TEAMFIRST', 'TEST b team-first lead', null),
('rt-test-037b', 'L_SAFE', 'TEST b safe lead', null);
insert into public.case_world_states (case_id, state_code, major, presentation, headline) values
('rt-test-037b', 'W_MAJOR', true, 'silent', 'T'), ('rt-test-037b', 'W_MAJOR2', true, 'silent', 'T'),
('rt-test-037b', 'W_MAJOR3', true, 'silent', 'T'), ('rt-test-037b', 'W_MINOR', false, 'silent', 'T');

-- ---- 1. INITIAL ROOTS ARE NOT DISCOVERIES (authoring) ----
do $$
declare
  r record;
begin
  for r in select * from (values
    ('H_ROOT_DISC_TEAM',  'team',  '[{"kind":"object_discovered","object":"ROOT_B"}]', '[{"kind":"open_lead","lead":"L_ROOT"}]', 'open-case'),
    ('H_ROOT_DISC_ACTOR', 'actor', '[{"kind":"object_discovered","object":"ROOT_B"}]', '[{"kind":"open_lead","lead":"L_ROOT"}]', 'open-case'),
    ('H_ROOT_MAJOR',      'team',  '[{"kind":"object_discovered","object":"ROOT_B"},{"kind":"evidence_unlocked","evidence":"E-01"}]', '[{"kind":"reach_world_state","state":"W_MAJOR"}]', 'open-case'),
    ('H_ROOT_INITIAL_ST', 'team',  '[{"kind":"object_state","object":"ROOT_B","states":["KNOWN"]}]', '[{"kind":"reach_world_state","state":"W_MAJOR"}]', 'progress'),
    -- 5. evidence-driven gated reveal cannot be laundered into major progress
    ('H_GATE_MAJOR',      'team',  '[{"kind":"object_discovered","object":"GATE_B"}]', '[{"kind":"reach_world_state","state":"W_MAJOR3"}]', 'progress'),
    ('H_GATE_EV_MAJOR',   'team',  '[{"kind":"object_discovered","object":"GATE_B"},{"kind":"evidence_unlocked","evidence":"E-02"}]', '[{"kind":"reach_world_state","state":"W_MAJOR3"}]', 'progress'),
    ('H_GATE_FOLLOW',     'team',  '[{"kind":"object_discovered","object":"GATE_B"}]', '[{"kind":"follow_lead","lead":"L_ROOT"}]', 'progress'),
    ('H_MINOR_MAJOR',     'team',  '[{"kind":"world_state","state":"W_MINOR"}]', '[{"kind":"reach_world_state","state":"W_MAJOR3"}]', 'progress'),
    -- initial material is granted at open → never runtime-only
    ('H_DELIVER_INITIAL', 'team',  '[{"kind":"world_state","state":"W_MAJOR"}]', '[{"kind":"deliver_evidence","evidence":"E-RTI"}]', 'runtime-only')
  ) v(id, scope, conds, effs, why) loop
    begin
      insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects)
      values ('rt-test-037b', r.id, 'approved', r.scope, r.conds::jsonb, r.effs::jsonb);
      raise exception 'RT FAIL: accepted %', r.id;
    exception when others then
      perform rt_test.ok(sqlerrm like 'RUNTIME_RULE_CAUSALITY%' and sqlerrm ~* replace(r.why, '-', '.'), 'authoring refused ' || r.id || ' (' || r.why || '): ' || sqlerrm);
    end;
  end loop;
end $$;

-- Runtime defence in depth: the same root rules smuggled past the validator
-- (replica role skips triggers — throwaway DB only) must still never fire.
set session_replication_role = replica;
insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects, sort_order) values
('rt-test-037b', 'BYPASS_ROOT_TEAM',  'approved', 'team',  '[{"kind":"object_discovered","object":"ROOT_B"}]', '[{"kind":"open_lead","lead":"L_ROOT"}]', 1),
('rt-test-037b', 'BYPASS_ROOT_ACTOR', 'approved', 'actor', '[{"kind":"object_discovered","object":"ROOT_B"}]', '[{"kind":"open_lead","lead":"L_ROOT"}]', 2),
('rt-test-037b', 'BYPASS_ROOT_MAJOR', 'approved', 'team',  '[{"kind":"object_discovered","object":"ROOT_B"},{"kind":"evidence_unlocked","evidence":"E-01"}]', '[{"kind":"reach_world_state","state":"W_MAJOR"}]', 3);
set session_replication_role = origin;

insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects, sort_order) values
('rt-test-037b', 'R1_SEAL_MAJOR',     'approved', 'team',  '[{"kind":"object_state","object":"ROOT_B","states":["SEALED"]}]', '[{"kind":"reach_world_state","state":"W_MAJOR"}]', 10),
('rt-test-037b', 'R1B_SEAL_TEAM_LEADS','approved', 'team', '[{"kind":"object_state","object":"ROOT_B","states":["SEALED"]}]', '[{"kind":"open_lead","lead":"L_PROMO"},{"kind":"open_lead","lead":"L_TEAMFIRST"}]', 11),
('rt-test-037b', 'R1C_SEAL_ACTOR_LEAD','approved', 'actor','[{"kind":"object_state","object":"ROOT_B","states":["SEALED"]}]', '[{"kind":"open_lead","lead":"L_TEAMFIRST"}]', 12),
('rt-test-037b', 'R2_KID_PRIVATE',    'approved', 'actor', '[{"kind":"object_discovered","object":"KID"}]', '[{"kind":"open_lead","lead":"L_PROMO"}]', 20),
('rt-test-037b', 'R2B_KID_TEAM',      'approved', 'team',  '[{"kind":"object_discovered","object":"KID"}]', '[{"kind":"reach_world_state","state":"W_MAJOR2"}]', 21),
('rt-test-037b', 'R5_EV_REVEAL',      'approved', 'team',  '[{"kind":"evidence_unlocked","evidence":"E-02"}]', '[{"kind":"reveal_object","object":"GATE_B"}]', 30),
('rt-test-037b', 'R5B_GATE_MINOR',    'approved', 'team',  '[{"kind":"object_discovered","object":"GATE_B"}]', '[{"kind":"reach_world_state","state":"W_MINOR"}]', 31),
('rt-test-037b', 'R6_DELIVER',        'approved', 'team',  '[{"kind":"world_state","state":"W_MAJOR"}]', '[{"kind":"deliver_evidence","evidence":"E-RT"}]', 40),
('rt-test-037b', 'R7_SAFE',           'approved', 'team',  '[{"kind":"object_state","object":"SAFE","states":["OPENED"]}]', '[{"kind":"open_lead","lead":"L_SAFE"}]', 50);

-- ---- open the case: initial roots fire nothing ----
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.open_case(:SB);
select public.open_investigation(:SB);
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
select public.open_case(:SB);
select public.open_investigation(:SB);
select public.runtime_settle(:SB);
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.runtime_settle(:SB);
reset role;
select rt_test.ok((select discovered and is_shared from session_object_state where session_id = :SB and object_code = 'ROOT_B'), 'ROOT_B seeded known + shared (discovered = true)');
select rt_test.ok(not exists (select 1 from session_runtime_firings where session_id = :SB and rule_id like 'BYPASS_ROOT%'), 'initial root: object_discovered never fires (team, actor)');
select rt_test.ok(not exists (select 1 from session_leads where session_id = :SB and lead_code = 'L_ROOT'), 'initial root: no lead opened at case open');
select rt_test.ok(not exists (select 1 from session_world_state where session_id = :SB), 'initial root cannot help reach a major world state');
select rt_test.ok(not exists (select 1 from session_runtime_firings where session_id = :SB), 'opening the case fires no rule');
select rt_test.ok((select count(*) from session_pulses where session_id = :SB) = 0, 'opening the case emits no pulse');

-- ---- 4. a genuinely discovered child still works; 2. private lead is B's ----
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
select public.execute_object_interaction(:SB, 'KID', 'INSPECT');
reset role;
select rt_test.ok((select holder = :B and not is_shared from session_leads where session_id = :SB and lead_code = 'L_PROMO'), 'child discovery: actor rule opened B''s private lead');
select rt_test.ok((select count(*) from session_pulses where session_id = :SB and actor_id = :B and category = 'PERSON') = 1, 'child discovery: private lead pulse');
select rt_test.ok(not exists (select 1 from session_world_state where session_id = :SB and state_code = 'W_MAJOR2'), 'private child find causes no team effect');
set role authenticated;
select public.share_object_discovery(:SB, 'KID');
reset role;
select rt_test.ok(exists (select 1 from session_world_state where session_id = :SB and state_code = 'W_MAJOR2'), 'shared genuine child discovery reaches a major world state (progress)');

-- actor open never steals another player's private lead
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.runtime_settle(:SB);
select rt_test.ok(not exists (select 1 from jsonb_array_elements(public.runtime_state(:SB) -> 'leads') l where l ->> 'lead' = 'L_PROMO'), 'A: B''s private lead still invisible');
reset role;
select rt_test.ok(exists (select 1 from session_runtime_firings where session_id = :SB and rule_id = 'R2_KID_PRIVATE' and actor_key = :A), 'A''s actor rule fired');
select rt_test.ok((select holder = :B and not is_shared from session_leads where session_id = :SB and lead_code = 'L_PROMO'), 'actor open did not steal or share B''s lead');

-- ---- 3. a later real root transition is progress; 2. team open PROMOTES ----
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.execute_object_interaction(:SB, 'ROOT_B', 'SEAL');
reset role;
select rt_test.ok(exists (select 1 from session_world_state where session_id = :SB and state_code = 'W_MAJOR'), 'real non-initial root transition reaches a major world state');
select rt_test.ok((select count(*) from session_leads where session_id = :SB and lead_code = 'L_PROMO') = 1, 'promotion: no duplicate lead');
select rt_test.ok((select is_shared and holder = :B and shared_at is not null from session_leads where session_id = :SB and lead_code = 'L_PROMO'), 'team open PROMOTED B''s private lead (holder kept, shared_at set)');
select rt_test.ok((select count(*) from session_pulse_sources where session_id = :SB and source_key = 'lead:L_PROMO') = 1, 'promotion emits no second pulse');
select rt_test.ok((select is_shared and holder is null from session_leads where session_id = :SB and lead_code = 'L_TEAMFIRST'), 'actor open never downgrades a shared lead');
set role authenticated;
select rt_test.ok(exists (select 1 from jsonb_array_elements(public.runtime_state(:SB) -> 'leads') l
                          where l ->> 'lead' = 'L_PROMO' and (l ->> 'shared')::boolean and not (l ->> 'mine')::boolean), 'A now sees the promoted lead as a team lead');
reset role;
select rt_test.ok((select status from session_runtime_effects where session_id = :SB and effect_kind = 'deliver_evidence' and effect_id = 'E-RT') = 'applied', 'world aftermath delivered to a reader');

-- ---- 5. evidence-driven gated reveal: real, but only minor consequences ----
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
select public.unlock_evidence(:SB, 'E-02');
reset role;
select rt_test.ok((select discovered and is_shared from session_object_state where session_id = :SB and object_code = 'GATE_B'), 'evidence-driven team reveal of GATE_B');
select rt_test.ok(exists (select 1 from session_world_state where session_id = :SB and state_code = 'W_MINOR'), 'revealed gated object satisfies object_discovered (minor world)');
select rt_test.ok(not exists (select 1 from session_world_state where session_id = :SB and state_code = 'W_MAJOR3'), 'gated reveal never laundered into a major world state');

-- ---- 3. APPROVED-RULE GUARDS fail closed ----
do $$
declare
  r record;
begin
  for r in select * from (values
    ('evidence requires (delivered)',   $q$update public.evidence set requires = '{}' where case_id = 'rt-test-037b' and code = 'E-RT'$q$),
    ('evidence is_initial (delivered)', $q$update public.evidence set is_initial = true where case_id = 'rt-test-037b' and code = 'E-RT'$q$),
    ('evidence code (delivered)',       $q$update public.evidence set code = 'E-RX' where case_id = 'rt-test-037b' and code = 'E-RT'$q$),
    ('evidence case_id (delivered)',    $q$update public.evidence set case_id = 'rt-test-037' where case_id = 'rt-test-037b' and code = 'E-RT'$q$),
    ('evidence delete (delivered)',     $q$delete from public.evidence where case_id = 'rt-test-037b' and code = 'E-RT'$q$),
    ('evidence code (condition)',       $q$update public.evidence set code = 'E-0X' where case_id = 'rt-test-037b' and code = 'E-02'$q$),
    ('evidence delete (condition)',     $q$delete from public.evidence where case_id = 'rt-test-037b' and code = 'E-02'$q$),
    ('object gated',                    $q$update public.investigation_objects set gated = false where case_id = 'rt-test-037b' and code = 'GATE_B'$q$),
    ('object delete',                   $q$delete from public.investigation_objects where case_id = 'rt-test-037b' and code = 'GATE_B'$q$),
    ('object initial_state',            $q$update public.investigation_objects set initial_state = 'SEALED' where case_id = 'rt-test-037b' and code = 'ROOT_B'$q$),
    ('object code',                     $q$update public.investigation_objects set code = 'ROOT_C' where case_id = 'rt-test-037b' and code = 'ROOT_B'$q$),
    ('object parent_code',              $q$update public.investigation_objects set parent_code = null where case_id = 'rt-test-037b' and code = 'KID'$q$),
    ('object case_id',                  $q$update public.investigation_objects set case_id = 'rt-test-037' where case_id = 'rt-test-037b' and code = 'KID'$q$),
    ('ancestor gated',                  $q$update public.investigation_objects set gated = false where case_id = 'rt-test-037b' and code = 'VAULT_B'$q$),
    ('ancestor delete',                 $q$delete from public.investigation_objects where case_id = 'rt-test-037b' and code = 'VAULT_B'$q$),
    ('lead code',                       $q$update public.case_leads set lead_code = 'L_PROMO2' where case_id = 'rt-test-037b' and lead_code = 'L_PROMO'$q$),
    ('lead case_id',                    $q$update public.case_leads set case_id = 'rt-test-037' where case_id = 'rt-test-037b' and lead_code = 'L_PROMO'$q$),
    ('lead delete',                     $q$delete from public.case_leads where case_id = 'rt-test-037b' and lead_code = 'L_SAFE'$q$),
    ('world case_id',                   $q$update public.case_world_states set case_id = 'rt-test-037' where case_id = 'rt-test-037b' and state_code = 'W_MINOR'$q$),
    ('world major',                     $q$update public.case_world_states set major = true where case_id = 'rt-test-037b' and state_code = 'W_MINOR'$q$),
    ('truncate leads',                  $q$truncate public.case_leads$q$),
    ('truncate world states',           $q$truncate public.case_world_states$q$)
  ) v(label, stmt) loop
    begin
      execute r.stmt;
      raise exception 'RT FAIL: guard let through %', r.label;
    exception when others then
      perform rt_test.ok(sqlerrm ~ '^RUNTIME_RULE_(GUARD|CAUSALITY)', 'guard fails closed: ' || r.label || ' → ' || sqlerrm);
    end;
  end loop;
end $$;
-- intentionally mutable content stays editable under approved rules
update public.evidence set title = 'TEST B AFTERMATH v2' where case_id = 'rt-test-037b' and code = 'E-RT';
update public.evidence set requires = '{E-01}' where case_id = 'rt-test-037b' and code = 'E-02';
update public.investigation_objects set title = 'TEST GATE v2', sort_order = 9 where case_id = 'rt-test-037b' and code = 'GATE_B';
update public.case_leads set label = 'TEST b promo lead v2', pulse_category = 'TIME' where case_id = 'rt-test-037b' and lead_code = 'L_PROMO';
update public.case_world_states set headline = 'T2' where case_id = 'rt-test-037b' and state_code = 'W_MAJOR';
select rt_test.ok((select title from public.investigation_objects where case_id = 'rt-test-037b' and code = 'GATE_B') = 'TEST GATE v2', 'mutable fields stay editable');
-- the sanctioned path: draft the dependents, edit, re-approve (validator re-checks)
update public.case_runtime_rules set status = 'draft' where case_id = 'rt-test-037b' and rule_id in ('R5_EV_REVEAL', 'R5B_GATE_MINOR');
update public.investigation_objects set gated = false where case_id = 'rt-test-037b' and code = 'GATE_B';
do $$ begin
  update public.case_runtime_rules set status = 'approved' where case_id = 'rt-test-037b' and rule_id = 'R5_EV_REVEAL';
  raise exception 'RT FAIL: re-approved a reveal of a no-longer-gated object';
exception when others then
  perform rt_test.ok(sqlerrm like 'RUNTIME_RULE_REFERENCE%', 're-approval re-validates: ' || sqlerrm);
end $$;
update public.investigation_objects set gated = true where case_id = 'rt-test-037b' and code = 'GATE_B';
update public.case_runtime_rules set status = 'approved' where case_id = 'rt-test-037b' and rule_id in ('R5_EV_REVEAL', 'R5B_GATE_MINOR');
select rt_test.ok((select count(*) from public.case_runtime_rules where case_id = 'rt-test-037b' and status = 'approved' and rule_id like 'R5%') = 2, 'draft → edit → re-approve works');

-- deleting a whole case is not blocked by its own approved rules
insert into public.cases (id, title, victim_name, incident_date, classification, difficulty, duration_minutes, is_published)
values ('rt-test-037c', 'TEST ONLY C', 'TEST', '2026-01-01', 'TEST', 1, 60, false);
insert into public.investigation_objects (case_id, code, parent_code, category, title, initial_state, interactions, auto_advance, gated, sort_order) values
('rt-test-037c', 'C_ROOT', null, 'location', 'C', 'KNOWN', '[]', '{}', false, 1),
('rt-test-037c', 'C_KID', 'C_ROOT', 'object', 'C', 'UNKNOWN', '[]', '{}', false, 2);
insert into public.evidence (case_id, code, title, kind, owner_spec, body, is_initial, requires, sort_order) values
('rt-test-037c', 'C-RT', 'C', 'document', 'field', 'c', false, '{@RUNTIME}', 1);
insert into public.case_leads (case_id, lead_code, label) values ('rt-test-037c', 'L_C', 'TEST c');
insert into public.case_world_states (case_id, state_code, major, presentation, headline) values ('rt-test-037c', 'W_C', false, 'silent', 'T');
insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects) values
('rt-test-037c', 'RC', 'approved', 'team', '[{"kind":"object_state","object":"C_KID","states":["FOUND"]}]',
 '[{"kind":"reach_world_state","state":"W_C"},{"kind":"deliver_evidence","evidence":"C-RT"},{"kind":"open_lead","lead":"L_C"}]');
delete from public.cases where id = 'rt-test-037c';
select rt_test.ok(not exists (select 1 from public.investigation_objects where case_id = 'rt-test-037c')
                  and not exists (select 1 from public.evidence where case_id = 'rt-test-037c')
                  and not exists (select 1 from public.case_runtime_rules where case_id = 'rt-test-037c'), 'whole-case delete cascades through the guards');

delete from public.case_runtime_rules where case_id = 'rt-test-037b' and rule_id like 'BYPASS_%';

select 'RT_SCENARIO_OK' as result;
