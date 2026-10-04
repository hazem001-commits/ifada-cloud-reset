-- ============================================================
-- IFADA 038 — POST-APPLY VERIFICATION (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor right after applying 038 (ONLY after
-- Hazem approves). Every row with a non-null pass must be true.
--   N — noticing for everyone (capability, not content quantity)
--   M — material produced by play is runtime-only and delivered by rules
--   B — chapter boundary (no M1 / RAMI_FOUND / RAMI_DIED / F-04 / F-07 / CCTV)
--   L — leads + pulse taxonomy content
--   K — rules: exactly the 11 approved, Room 714 only, no world change
--   Z — scope: nothing outside Room 714 content; 037 untouched
-- ============================================================
with
notice(code, specs) as (values
  ('GLASS_CUP', array['field', 'forensics']), ('BLOOD_STAIN', array['field', 'forensics']),
  ('OPEN_WINDOW', array['field', 'forensics']), ('VICTIM_ITEMS', array['field', 'records']),
  ('PASSPORT', array['field', 'records']), ('LAPTOP', array['digital', 'field']), ('DOOR_714', array['digital', 'field'])),
produced(code) as (values ('D-01'), ('R-01'), ('F-01'), ('F-02')),
held(code) as (select e.code from public.evidence e where e.case_id = 'room-714'
               and e.code not in ('V-01', 'D-01', 'R-01', 'F-01', 'F-02', 'D-02')),
rules(id) as (values ('R714_OPEN_ROOM'), ('R714_DELIVER_DRAFT'), ('R714_DELIVER_GUEST'), ('R714_DELIVER_LAB'),
                     ('R714_SCENE_DOCUMENTED'), ('R714_INSIGHT_DRAFT'), ('R714_INSIGHT_GUEST'), ('R714_INSIGHT_LAB'),
                     ('R714_INSIGHT_ACCESS'), ('R714_FOLLOW_DRAFT_PRIVATE'), ('R714_FOLLOW_DRAFT_TEAM')),
o as (select * from public.investigation_objects where case_id = 'room-714')
select check_name, pass, detail from (
  -- N
  select 1 as ord, 'N1 noticing ' || n.code || ' is available to exactly: ' || array_to_string(n.specs, '+') as check_name,
         (select array_agg(distinct i ->> 'spec' order by i ->> 'spec') from o, jsonb_array_elements(o.interactions) i
          where o.code = n.code and i ->> 'requires_state' = 'UNKNOWN') = n.specs as pass,
         (select string_agg(i ->> 'code' || ':' || (i ->> 'spec'), ',') from o, jsonb_array_elements(o.interactions) i
          where o.code = n.code and i ->> 'requires_state' = 'UNKNOWN') as detail
  from notice n
  union all
  select 2, 'N2 every noticing variant of an object shares one label (one gesture in the UI): ' || n.code,
         (select count(distinct i ->> 'label') from o, jsonb_array_elements(o.interactions) i
          where o.code = n.code and i ->> 'requires_state' = 'UNKNOWN') = 1, null
  from notice n
  union all
  select 3, 'N3 transformations stay specialist-only (lab, device, records)',
         (select bool_and(i ->> 'spec' = 'forensics') from o, jsonb_array_elements(o.interactions) i where o.code = 'BLOOD_STAIN' and i ->> 'requires_state' <> 'UNKNOWN')
         and (select bool_and(i ->> 'spec' = 'digital') from o, jsonb_array_elements(o.interactions) i where o.code = 'LAPTOP' and i ->> 'requires_state' <> 'UNKNOWN')
         and (select spec = 'records' from public.investigation_challenges where case_id = 'room-714' and code = 'GUEST_FILE_LOOKUP'), null
  union all
  select 4, 'N4 no artificial share lock on steps that produce no material',
         not exists (select 1 from o, jsonb_array_elements(o.interactions) i where o.code = 'BLOOD_STAIN' and (i ->> 'requires_shared')::boolean)
         and not (select requires_shared from public.investigation_challenges where case_id = 'room-714' and code = 'GUEST_FILE_LOOKUP'), null
  union all
  select 5, 'N5 the door-log query (produces D-02) is unchanged: still on a shared find',
         (select requires_shared from public.investigation_challenges where case_id = 'room-714' and code = 'DOOR_LOG_QUERY'), null
  union all
  select 6, 'N6 finished transformations do not repeat restricted material in the object text',
         (select state_descriptions ->> 'ANALYZED' from o where code = 'BLOOD_STAIN') !~ '(أنثى|رامي)'
         and (select state_descriptions ->> 'DRAFT_RECOVERED' from o where code = 'LAPTOP') !~ 'صدفة'
         and (select state_descriptions ->> 'RECORDS_QUERIED' from o where code = 'PASSPORT') !~ '(RAK|29)', null
  -- M
  union all
  select 10, 'M1 produced by play: runtime-only and not initial: ' || p.code,
         (select requires = array['@RUNTIME']::text[] and not is_initial from public.evidence where case_id = 'room-714' and code = p.code), null
  from produced p
  union all
  select 11, 'M2 each produced material has exactly one approved delivering rule: ' || p.code,
         (select count(*) from public.case_runtime_rules r where r.case_id = 'room-714' and r.status = 'approved' and r.scope = 'team'
            and r.effects @> jsonb_build_array(jsonb_build_object('kind', 'deliver_evidence', 'evidence', p.code))) = 1, null
  from produced p
  union all
  select 12, 'M3 the only initial Room 714 material is the briefing (V-01)',
         (select array_agg(code order by code) from public.evidence where case_id = 'room-714' and is_initial) = array['V-01'], null
  -- B
  union all
  select 20, 'B1 held behind later chapters (runtime-only, NOT delivered by any rule): ' || h.code,
         (select requires = array['@RUNTIME']::text[] and not is_initial from public.evidence where case_id = 'room-714' and code = h.code)
         and not exists (select 1 from public.case_runtime_rules r where r.case_id = 'room-714'
                         and r.effects @> jsonb_build_array(jsonb_build_object('kind', 'deliver_evidence', 'evidence', h.code))), null
  from held h
  union all
  select 21, 'B2 SECURITY_OFFICE gated and revealed by no rule',
         (select gated from o where code = 'SECURITY_OFFICE')
         and not exists (select 1 from public.case_runtime_rules r where r.case_id = 'room-714' and r.effects::text ~ 'SECURITY_OFFICE'), null
  union all
  select 21, 'B1b only the briefing (V-01) and the door-log tool output (D-02) keep a legacy route',
         (select array_agg(code order by code) from public.evidence
          where case_id = 'room-714' and requires is distinct from array['@RUNTIME']::text[]) = array['D-02', 'V-01'], null
  union all
  select 21, 'B1c held count (everything outside the opening): 28',
         (select count(*) from public.evidence where case_id = 'room-714' and code not in ('V-01','D-01','R-01','F-01','F-02','D-02')) = 28, null
  union all
  select 22, 'B3 no Room 714 world state authored (no RAMI_FOUND / RAMI_DIED here)',
         not exists (select 1 from public.case_world_states where case_id = 'room-714'), null
  union all
  select 23, 'B4 legacy milestones untouched (MAP_EXPANDED R-03, RAMI_FOUND F-04, RAMI_DIED F-07 — all now unreachable)',
         (select array_agg(code || '=' || array_to_string(required_evidence, ',') order by code) from public.case_milestones where case_id = 'room-714')
           = array['MAP_EXPANDED=R-03', 'RAMI_DIED=F-07', 'RAMI_FOUND=F-04'], null
  -- L
  union all
  select 30, 'L1 exactly the five opening leads',
         (select array_agg(lead_code order by lead_code) from public.case_leads where case_id = 'room-714')
           = array['L714_BLOOD', 'L714_DRAFT', 'L714_GUEST', 'L714_MASTER_KEY', 'L714_ROOM'], null
  union all
  select 31, 'L2 no lead label names a node/evidence code or entity',
         not exists (select 1 from public.case_leads where case_id = 'room-714' and label ~ '([A-Z]{1,3}-[0-9]{2}|\{\{entity:|L714_|_[A-Z])'), null
  union all
  select 31, 'L2b no insight label restates restricted material (times, quotes, findings)',
         not exists (select 1 from public.case_leads where case_id = 'room-714' and label ~ '([0-9]{2}:[0-9]{2}|«|أنثى|صدفة|فعالية|مفتاح)'), null
  union all
  select 32, 'L3 pulse nodes: seven noticeable things, coarse fixed categories only',
         (select count(*) from public.case_runtime_nodes where case_id = 'room-714') = 7
         and not exists (select 1 from public.case_runtime_nodes where case_id = 'room-714'
                         and pulse_category not in ('PERSON','PLACE','TIME','DEVICE','MOVEMENT','PHYSICAL_TRACE','RECORD','NEW_ACTION')), null
  -- K
  union all
  select 40, 'K1 rule approved: ' || r.id,
         exists (select 1 from public.case_runtime_rules x where x.case_id = 'room-714' and x.rule_id = r.id and x.status = 'approved'), null
  from rules r
  union all
  select 41, 'K2 no other Room 714 rule',
         (select count(*) from public.case_runtime_rules where case_id = 'room-714') = 11, null
  union all
  select 42, 'K3 actor rules only open/follow their holder''s lead (never deliver, reveal or change the world)',
         not exists (select 1 from public.case_runtime_rules r, jsonb_array_elements(r.effects) e
                     where r.case_id = 'room-714' and r.scope = 'actor' and e ->> 'kind' not in ('open_lead', 'follow_lead')), null
  union all
  select 43, 'K4 no rule reveals, advances an object or reaches a world state',
         not exists (select 1 from public.case_runtime_rules r, jsonb_array_elements(r.effects) e
                     where r.case_id = 'room-714' and e ->> 'kind' in ('reveal_object', 'advance_object_state', 'reach_world_state')), null
  -- Z
  union all
  select 50, 'Z1 no runtime content for any other case',
         not exists (select 1 from public.case_runtime_rules where case_id <> 'room-714')
         and not exists (select 1 from public.case_leads where case_id <> 'room-714')
         and not exists (select 1 from public.case_runtime_nodes where case_id <> 'room-714'), null
  union all
  select 51, 'Z2 no object gated except SECURITY_OFFICE',
         (select array_agg(case_id || ':' || code) from public.investigation_objects where gated) = array['room-714:SECURITY_OFFICE'], null
  union all
  select 52, 'Z3 037 functions untouched (open_investigation / investigation_object_index md5 as 037 verified)',
         (select md5(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'open_investigation') = '40eecd13f963c6552a434efa4c107a81'
         and (select md5(prosrc) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'investigation_object_index') = '4fa968e3f43d504d9cdbfd9556674601', null
) checks
order by ord, check_name;
