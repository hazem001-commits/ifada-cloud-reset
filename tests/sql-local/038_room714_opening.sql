-- ============================================================
-- tests/sql-local/038_room714_opening.sql
-- ⚠ LOCAL THROWAWAY DATABASE ONLY · TEST ONLY. Run by run-local.mjs after
-- 037 + 038. Plays the REAL Room 714 opening (canon content from 005/019/
-- 025 + 038) with two synthetic players on a scratch session:
--   P = field + forensics   (the room / physical)
--   Q = digital + records   (the device / the institution)
-- Every assertion raises "RT FAIL: …"; the last line prints OPENING_OK.
-- Each statement is its own transaction (deferred runtime triggers fire
-- exactly as behind PostgREST).
-- ============================================================
\set ON_ERROR_STOP 1
\set S '\'00000000-0000-4000-8000-000000000714\''
\set P '\'00000000-0000-4000-8000-0000000007a1\''
\set Q '\'00000000-0000-4000-8000-0000000007b2\''

create schema if not exists rt_test;
create or replace function rt_test.ok(p boolean, p_label text) returns void
language plpgsql as $$ begin if p is not true then raise exception 'RT FAIL: %', p_label; end if; end $$;
grant usage on schema rt_test to authenticated;
grant execute on function rt_test.ok(boolean, text) to authenticated;
-- caller-perspective helpers (run as the player)
create or replace function rt_test.my_evidence(p_session uuid) returns table (code text, readable boolean)
language sql as $$ select e.code, e.readable from public.evidence_index(p_session) e $$;
grant execute on function rt_test.my_evidence(uuid) to authenticated;

insert into auth.users (id, email) values (:P, 'p@test.local'), (:Q, 'q@test.local');
insert into public.sessions (id, case_id, code, host_id, status, started_at) values (:S, 'room-714', 'RT0714', :P, 'active', now());
insert into public.session_members (session_id, user_id, specialization, is_host) values (:S, :P, 'field', true), (:S, :Q, 'digital', false);
insert into public.session_member_specializations (session_id, user_id, specialization, is_primary)
values (:S, :P, 'field', true), (:S, :P, 'forensics', false), (:S, :Q, 'digital', true), (:S, :Q, 'records', false);

-- ------------------------------------------------------------
-- ARRIVAL: only the briefing; the room is the first direction
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select public.open_case(:S);
select public.open_investigation(:S);
select public.runtime_settle(:S);
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007b2';
select public.open_case(:S);
select public.open_investigation(:S);
select public.runtime_settle(:S);
reset role;

select rt_test.ok((select array_agg(e.code order by e.code) from session_evidence se join evidence e on e.id = se.evidence_id where se.session_id = :S) = array['V-01'],
                  'arrival: only the missing-person report (no draft / guest file / scene report handed out)');
select rt_test.ok((select is_shared and holder is null and status = 'open' from session_leads where session_id = :S and lead_code = 'L714_ROOM'), 'the room is the opening team direction');
select rt_test.ok((select count(*) from session_pulses where session_id = :S) = 0, 'arrival emits no pulse');
select rt_test.ok(not exists (select 1 from session_object_state where session_id = :S and object_code = 'SECURITY_OFFICE'), 'security office (gated) never seeded');
select rt_test.ok(not exists (select 1 from session_events where session_id = :S), 'no broadcast at arrival');

-- every player can notice something; nobody can transform what they cannot
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select rt_test.ok(not exists (select 1 from investigation_object_index(:S) where code in ('SECURITY_OFFICE', 'CCTV_ARCHIVE')), 'P: no security office, no CCTV archive, no breadcrumb');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007b2';
select rt_test.ok(not exists (select 1 from investigation_object_index(:S) where code in ('SECURITY_OFFICE', 'CCTV_ARCHIVE')), 'Q: no security office, no CCTV archive, no breadcrumb');
select rt_test.ok((select array_agg(code order by code) from investigation_object_index(:S) where jsonb_array_length(actions) > 0)
                  = array['DOOR_714', 'LAPTOP', 'VICTIM_ITEMS'], 'Q (digital+records) can notice the device, the door and the belongings');
select rt_test.ok(not exists (select 1 from investigation_object_index(:S) where code in ('GLASS_CUP', 'OPEN_WINDOW') and jsonb_array_length(actions) > 0), 'Q cannot notice the physical traces');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select rt_test.ok((select count(*) from investigation_object_index(:S) where jsonb_array_length(actions) >= 1 and code in ('GLASS_CUP','OPEN_WINDOW','VICTIM_ITEMS','LAPTOP','DOOR_714')) = 5,
                  'P (field) can notice everything');
select rt_test.ok((select count(distinct a ->> 'label') from investigation_object_index(:S), jsonb_array_elements(actions) a where code = 'GLASS_CUP') = 1,
                  'a noticing act is ONE gesture: the variants per specialization share one label (the UI shows one)');
reset role;

-- ------------------------------------------------------------
-- Q notices the belongings + passport privately → teammates feel it
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007b2';
select public.execute_object_interaction(:S, 'VICTIM_ITEMS', 'INSPECT_RECORDS');
select public.execute_object_interaction(:S, 'PASSPORT', 'INSPECT_RECORDS');
-- records lookup on the private find — no artificial share lock
select (public.run_challenge(:S, 'GUEST_FILE_LOOKUP', '{"value":"714"}'::jsonb)) ->> 'outcome';
reset role;
select rt_test.ok((select state from session_object_state where session_id = :S and object_code = 'PASSPORT') = 'RECORDS_QUERIED', 'records lookup ran on a private find');
select rt_test.ok((select count(*) from session_pulses where session_id = :S and actor_id = :Q and category = 'PERSON') = 2, 'two private finds → two PERSON pulses');
select rt_test.ok(not exists (select 1 from session_evidence se join evidence e on e.id = se.evidence_id where se.session_id = :S and e.code = 'R-01'),
                  'material waits until the find is on the team record');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select rt_test.ok((select state from investigation_object_index(:S) where code = 'VICTIM_ITEMS') = 'HIDDEN', 'P sees only "a teammate has something here"');
select rt_test.ok(not exists (select 1 from investigation_object_index(:S) where code = 'PASSPORT'), 'P does not even see the passport under a private find');
select rt_test.ok(not ((public.runtime_state(:S) -> 'pulses')::text ~ '(VICTIM|PASSPORT|جواز|أغراض|رامي)'), 'pulses leak no code, title or name to P');
select rt_test.ok(not (public.runtime_state(:S)::text ~ '(VICTIM_ITEMS|PASSPORT|جواز)'), 'P''s runtime view names nothing Q found');
-- Q shares: the guest file arrives, and a PRIVATE insight for its reader
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007b2';
select public.share_object_discovery(:S, 'VICTIM_ITEMS');
select public.share_object_discovery(:S, 'PASSPORT');
reset role;
select rt_test.ok(exists (select 1 from session_evidence se join evidence e on e.id = se.evidence_id where se.session_id = :S and e.code = 'R-01' and se.unlocked_by = :Q),
                  'sharing put the guest file into the case file (records reader)');
select rt_test.ok((select holder = :Q and not is_shared from session_leads where session_id = :S and lead_code = 'L714_GUEST'), 'insight lead is private to the records reader');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select rt_test.ok(not (public.runtime_state(:S)::text ~ 'ملف النزيل'), 'P cannot read Q''s insight');
select rt_test.ok((select not readable from rt_test.my_evidence(:S) where code = 'R-01'), 'P sees the guest file as a title only');
select rt_test.ok((select description from investigation_object_index(:S) where code = 'PASSPORT') !~ '(RAK|29)', 'the passport''s state text does not repeat the restricted record');
reset role;

-- ------------------------------------------------------------
-- P notices the laptop → Q (digital) needs it shared → draft → insight
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select public.execute_object_interaction(:S, 'LAPTOP', 'INSPECT');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007b2';
select rt_test.ok((select jsonb_array_length(actions) = 0 and state = 'HIDDEN' from investigation_object_index(:S) where code = 'LAPTOP'), 'Q cannot work on P''s private laptop');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select public.share_object_discovery(:S, 'LAPTOP');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007b2';
select public.execute_object_interaction(:S, 'LAPTOP', 'INSPECT_DEVICE');
select public.execute_object_interaction(:S, 'LAPTOP', 'RECOVER_DRAFT');
reset role;
select rt_test.ok(exists (select 1 from session_evidence se join evidence e on e.id = se.evidence_id where se.session_id = :S and e.code = 'D-01' and se.unlocked_by = :Q), 'the draft is produced by the device work');
select rt_test.ok((select holder = :Q from session_leads where session_id = :S and lead_code = 'L714_DRAFT'), 'the draft''s question is the digital reader''s private insight');
select rt_test.ok((select count(*) from session_pulses where session_id = :S and actor_id = :Q and category = 'TIME') = 1, 'the insight pulses TIME to the team');

-- ------------------------------------------------------------
-- P: glass → blood → sample → lab (background) → result
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select public.execute_object_interaction(:S, 'GLASS_CUP', 'INSPECT');
select public.execute_object_interaction(:S, 'BLOOD_STAIN', 'INSPECT_CLOSE');
select public.execute_object_interaction(:S, 'BLOOD_STAIN', 'COLLECT_SAMPLE');
select public.execute_object_interaction(:S, 'BLOOD_STAIN', 'REQUEST_LAB');
reset role;
update session_object_state set processing_until = now() - interval '1 second' where session_id = :S and object_code = 'BLOOD_STAIN';  -- time passes
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select count(*) from investigation_object_index(:S);   -- P's read settles the lab job
reset role;
select rt_test.ok((select state from session_object_state where session_id = :S and object_code = 'BLOOD_STAIN') = 'ANALYZED', 'the lab result arrived');
select rt_test.ok((select count(*) from session_pulses where session_id = :S and actor_id is null and category = 'PHYSICAL_TRACE') = 1, 'a private result arriving is a SYSTEM pulse');
select rt_test.ok(not exists (select 1 from session_evidence se join evidence e on e.id = se.evidence_id where se.session_id = :S and e.code = 'F-02'), 'unshared result stays off the record');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select public.share_object_discovery(:S, 'GLASS_CUP');
select public.share_object_discovery(:S, 'BLOOD_STAIN');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007b2';
select rt_test.ok((select description from investigation_object_index(:S) where code = 'BLOOD_STAIN') !~ '(أنثى|رامي)', 'Q sees that a result exists, not what it says');
select rt_test.ok((select not readable from rt_test.my_evidence(:S) where code = 'F-02'), 'Q holds the lab report as a title only — P must tell');
reset role;
select rt_test.ok(exists (select 1 from session_evidence se join evidence e on e.id = se.evidence_id where se.session_id = :S and e.code = 'F-02' and se.unlocked_by = :P), 'lab report on the record');
select rt_test.ok((select holder = :P from session_leads where session_id = :S and lead_code = 'L714_BLOOD'), 'the forensic insight is P''s');

-- ------------------------------------------------------------
-- Q: the door → (shared) → access log with a window from the draft
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007b2';
select public.execute_object_interaction(:S, 'DOOR_714', 'INSPECT_DIGITAL');
select rt_test.ok(not exists (select 1 from challenge_index(:S) where code = 'DOOR_LOG_QUERY'), 'a material-producing tool waits for the find to be on record');
select public.share_object_discovery(:S, 'DOOR_714');
select (public.run_challenge(:S, 'DOOR_LOG_QUERY', '{"from":"23:30","to":"00:30"}'::jsonb)) ->> 'outcome';
reset role;
select rt_test.ok(exists (select 1 from session_evidence se join evidence e on e.id = se.evidence_id where se.session_id = :S and e.code = 'D-02'), 'the access log was pulled');
select rt_test.ok((select holder = :Q and not is_shared from session_leads where session_id = :S and lead_code = 'L714_MASTER_KEY'), 'the master-key question is the digital reader''s');
select rt_test.ok((select status from session_leads where session_id = :S and lead_code = 'L714_DRAFT') = 'followed', 'pulling the log FOLLOWED the draft''s question');

-- Q decides to tell the team: the lead becomes the team's
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007b2';
select public.share_lead(:S, 'L714_MASTER_KEY');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select rt_test.ok(exists (select 1 from jsonb_array_elements(public.runtime_state(:S) -> 'leads') l where l ->> 'lead' = 'L714_MASTER_KEY' and (l ->> 'shared')::boolean), 'P now holds the shared master-key question');
reset role;

-- ------------------------------------------------------------
-- The scene report is filed when the room is documented together
-- ------------------------------------------------------------
select rt_test.ok(not exists (select 1 from session_evidence se join evidence e on e.id = se.evidence_id where se.session_id = :S and e.code = 'F-01'), 'no scene report while the window is undocumented');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select public.execute_object_interaction(:S, 'OPEN_WINDOW', 'INSPECT');
select public.share_object_discovery(:S, 'OPEN_WINDOW');
reset role;
select rt_test.ok(exists (select 1 from session_evidence se join evidence e on e.id = se.evidence_id where se.session_id = :S and e.code = 'F-01' and se.unlocked_by = :P), 'scene report filed (forensics reader)');
select rt_test.ok((select status from session_leads where session_id = :S and lead_code = 'L714_ROOM') = 'closed', 'the room direction closed');
select rt_test.ok((select count(*) from session_runtime_provenance where session_id = :S and node_kind = 'evidence') = 4, 'all produced material carries runtime provenance (D-01, R-01, F-02, F-01)');

-- ------------------------------------------------------------
-- CHAPTER BOUNDARY: nothing beyond the opening is reachable
-- ------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
do $$
declare c text;
begin
  -- P holds forensics: the held forensic material is refused by requirement, not by specialization
  foreach c in array array['F-03', 'F-04', 'F-06', 'F-07'] loop
    begin
      perform public.unlock_evidence('00000000-0000-4000-8000-000000000714', c);
      raise exception 'RT FAIL: % unlocked through the legacy path', c;
    exception when others then
      perform rt_test.ok(sqlerrm = 'REQUIREMENTS_NOT_MET', c || ' refused on the legacy path: ' || sqlerrm);
    end;
  end loop;
end $$;
do $$ begin
  perform public.unlock_evidence('00000000-0000-4000-8000-000000000714', 'V-08');   -- P holds field (was requires {})
  raise exception 'RT FAIL: V-08 unlocked through the legacy path';
exception when others then
  perform rt_test.ok(sqlerrm = 'REQUIREMENTS_NOT_MET', 'V-08 (later chapter) refused on the legacy path: ' || sqlerrm);
end $$;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007b2';
do $$
declare c text;
begin
  foreach c in array array['D-05', 'D-08', 'R-04', 'R-06'] loop   -- Q holds digital + records; D-01 and R-01 are in hand
    begin
      perform public.unlock_evidence('00000000-0000-4000-8000-000000000714', c);
      raise exception 'RT FAIL: % unlocked through the legacy path', c;
    exception when others then
      perform rt_test.ok(sqlerrm = 'REQUIREMENTS_NOT_MET', c || ' (later chapter) refused on the legacy path: ' || sqlerrm);
    end;
  end loop;
end $$;
select rt_test.ok((select count(*) from public.unlockable_evidence('00000000-0000-4000-8000-000000000714')) = 0, 'Q is offered nothing on the legacy list');
do $$ begin
  perform public.unlock_evidence('00000000-0000-4000-8000-000000000714', 'R-03');   -- Q holds records
  raise exception 'RT FAIL: R-03 (M1 plan) unlocked through the legacy path';
exception when others then
  perform rt_test.ok(sqlerrm = 'REQUIREMENTS_NOT_MET', 'R-03 refused on the legacy path: ' || sqlerrm);
end $$;
select rt_test.ok(not exists (select 1 from public.unlockable_evidence('00000000-0000-4000-8000-000000000714') u where u.code in ('F-03','F-04','F-06','F-07','R-03')), 'held material never offered');
select public.check_milestones(:S);
reset role;
select rt_test.ok(not exists (select 1 from session_events where session_id = :S), 'no RAMI_FOUND / RAMI_DIED / MAP_EXPANDED broadcast');
select rt_test.ok(not exists (select 1 from session_world_state where session_id = :S), 'no world state changed in the opening');
select rt_test.ok((select count(*) from session_leads where session_id = :S and status <> 'closed') = 4, 'the chapter ends on open questions');

-- ------------------------------------------------------------
-- IDEMPOTENT: repeated reads/settles change nothing
-- ------------------------------------------------------------
create temp table op_snap as select
  (select count(*) from session_pulses where session_id = :S) p,
  (select count(*) from session_runtime_firings where session_id = :S) f,
  (select count(*) from session_evidence where session_id = :S) e;
grant select on op_snap to authenticated;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select public.runtime_settle(:S);
select count(*) from investigation_object_index(:S);
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007b2';
select public.runtime_settle(:S);
reset role;
select rt_test.ok((select p = (select count(*) from session_pulses where session_id = :S) and f = (select count(*) from session_runtime_firings where session_id = :S)
                     and e = (select count(*) from session_evidence where session_id = :S) from op_snap), 'opening is idempotent');

-- another split: forensics + records can also notice (P2 = forensics, Q2 = records)
\set S2 '\'00000000-0000-4000-8000-000000000715\''
insert into public.sessions (id, case_id, code, host_id, status, started_at) values (:S2, 'room-714', 'RT0715', :P, 'active', now());
insert into public.session_members (session_id, user_id, specialization, is_host) values (:S2, :P, 'forensics', true), (:S2, :Q, 'records', false);
insert into public.session_member_specializations (session_id, user_id, specialization, is_primary)
values (:S2, :P, 'forensics', true), (:S2, :Q, 'records', true);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007a1';
select public.open_investigation(:S2);
select public.execute_object_interaction(:S2, 'GLASS_CUP', 'INSPECT_FORENSICS');
select public.execute_object_interaction(:S2, 'BLOOD_STAIN', 'INSPECT_CLOSE_FORENSICS');
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000007b2';
select public.open_investigation(:S2);
select public.execute_object_interaction(:S2, 'VICTIM_ITEMS', 'INSPECT_RECORDS');
select rt_test.ok(not exists (select 1 from investigation_object_index(:S2) where code = 'LAPTOP' and jsonb_array_length(actions) > 0), 'without field/digital nobody fakes a laptop exam');
reset role;
select rt_test.ok((select count(*) from session_object_state where session_id = :S2 and discovered and not is_shared) = 3, 'forensics and records players both investigate');

select 'OPENING_OK' as result;
