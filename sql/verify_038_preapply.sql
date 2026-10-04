-- ============================================================
-- IFADA 038 — PRE-APPLY VERIFICATION (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor BEFORE applying 038 (Room 714 opening
-- content). Every row with a non-null pass must be true; INFO rows are null.
--   R — 037 runtime is live (038 is content for it)
--   C — the Room 714 content 038 edits exists exactly as authored (019/025)
--   A — 038 has not been applied yet
-- ============================================================
with
objs(code) as (values ('ROOM_714'), ('GLASS_CUP'), ('BLOOD_STAIN'), ('OPEN_WINDOW'), ('VICTIM_ITEMS'),
                      ('PASSPORT'), ('LAPTOP'), ('DOOR_714'), ('SECURITY_OFFICE'), ('CCTV_ARCHIVE')),
evs(code) as (values ('V-01'), ('F-01'), ('F-02'), ('F-03'), ('F-04'), ('F-06'), ('F-07'), ('D-01'), ('D-02'), ('R-01'), ('R-03')),
runtime_tbl(name) as (values ('case_runtime_nodes'), ('case_leads'), ('case_world_states'), ('case_runtime_rules'),
                             ('session_leads'), ('session_pulses'), ('session_runtime_firings'))
select check_name, pass, detail from (
  select 1 as ord, 'R1 037 runtime table exists: ' || t.name as check_name, to_regclass('public.' || t.name) is not null as pass, null::text as detail
  from runtime_tbl t
  union all
  select 2, 'R2 037 rule validator + approved-rule guards present',
         exists (select 1 from pg_trigger where tgname = 'case_runtime_rules_validate' and not tgisinternal)
         and exists (select 1 from pg_trigger where tgname = 'evidence_runtime_guard' and not tgisinternal)
         and exists (select 1 from pg_trigger where tgname = 'investigation_objects_runtime_guard' and not tgisinternal), null
  union all
  select 3, 'R3 investigation_objects.gated exists (037)',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'investigation_objects' and column_name = 'gated'), null
  union all
  select 4, 'R4 runtime-only sentinel enforced by deliveries (_runtime_try_deliver exists)',
         exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = '_runtime_try_deliver'), null
  -- C
  union all
  select 10, 'C1 Room 714 object exists: ' || o.code,
         exists (select 1 from public.investigation_objects x where x.case_id = 'room-714' and x.code = o.code), null
  from objs o
  union all
  select 11, 'C2 Room 714 evidence exists: ' || e.code,
         exists (select 1 from public.evidence x where x.case_id = 'room-714' and x.code = e.code), null
  from evs e
  union all
  select 12, 'C3 challenges GUEST_FILE_LOOKUP and DOOR_LOG_QUERY exist',
         (select count(*) from public.investigation_challenges where case_id = 'room-714' and code in ('GUEST_FILE_LOOKUP', 'DOOR_LOG_QUERY')) = 2, null
  union all
  select 13, 'C4 LAPTOP still yields D-01 at DRAFT_RECOVERED (025 provenance)',
         (select yields from public.investigation_objects where case_id = 'room-714' and code = 'LAPTOP')
           @> '[{"evidence": "D-01", "when_state": "DRAFT_RECOVERED"}]'::jsonb, null
  union all
  select 14, 'C5 Scene 17 has no runtime content (038 touches Room 714 only)',
         not exists (select 1 from public.case_runtime_rules where case_id <> 'room-714')
         and not exists (select 1 from public.case_leads where case_id <> 'room-714')
         and not exists (select 1 from public.case_runtime_nodes where case_id <> 'room-714'), null
  -- A
  union all
  select 20, 'A1 no R714_ rule exists yet',
         not exists (select 1 from public.case_runtime_rules where case_id = 'room-714' and rule_id like 'R714\_%'), null
  union all
  select 21, 'A2 no Room 714 lead / pulse node yet',
         not exists (select 1 from public.case_leads where case_id = 'room-714')
         and not exists (select 1 from public.case_runtime_nodes where case_id = 'room-714'), null
  union all
  select 22, 'A3 SECURITY_OFFICE not gated yet',
         not (select gated from public.investigation_objects where case_id = 'room-714' and code = 'SECURITY_OFFICE'), null
  -- INFO
  union all
  select 90, 'I1 Room 714 initial evidence before 038 (INFO — 038 keeps only V-01)', null,
         (select string_agg(code, ',' order by code) from public.evidence where case_id = 'room-714' and is_initial)
  union all
  select 91, 'I2 active Room 714 sessions (INFO — existing sessions keep what they already hold)', null,
         (select count(*)::text from public.sessions where case_id = 'room-714' and status = 'active')
) checks
order by ord, check_name;
