-- ============================================================
-- IFADA 037 — PRE-APPLY VERIFICATION (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor BEFORE applying 037. Every row with a
-- non-null pass must show pass = true; stop if any is false.
-- Rows with pass = null are INFO.
--
-- F — the foundation 037 builds on is live (020/026/027/031/033/035/036)
-- B — the two functions 037 re-creates are byte-identical to their
--     canonical repo bodies (020 open_investigation, 026
--     investigation_object_index), so the verbatim+1-clause rewrite is safe
-- A — 037 has not been applied yet (fresh)
-- G — grants on the two re-created functions (037 restates them:
--     authenticated only; it also revokes anon from open_investigation,
--     which Supabase default privileges may have granted — INFO here)
-- ============================================================
with
fn(name) as (values
  ('is_session_member'), ('has_specialization'), ('my_specializations'),
  ('open_investigation'), ('investigation_object_index'), ('execute_object_interaction'),
  ('share_object_discovery'), ('_advance_processed_objects'),
  ('_object_ancestors_known'), ('_object_state_row_visible'),
  ('_evidence_readable'), ('_evidence_row_visible'), ('_board_material_team_visible'),
  ('unlock_evidence'), ('evidence_index'), ('open_case'),
  ('propose_connection'), ('_connection_match'), ('test_joint_proposal'), ('check_milestones')),
tbl(name) as (values
  ('investigation_objects'), ('session_object_state'), ('evidence'), ('session_evidence'),
  ('session_events'), ('case_connection_rules'), ('session_validated_connections'),
  ('case_engine_policy'), ('case_evidence_channels'), ('session_member_channels')),
new_tbl(name) as (values
  ('case_runtime_nodes'), ('case_leads'), ('case_world_states'), ('case_runtime_rules'),
  ('session_leads'), ('session_world_state'), ('session_pulses'), ('session_pulse_sources'),
  ('session_runtime_firings'), ('session_runtime_effects'), ('session_runtime_provenance'))
select check_name, pass, detail from (
  select 1 as ord, 'F1 every foundation function exists: ' || f.name as check_name,
         exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f.name) as pass,
         null::text as detail
  from fn f
  union all
  select 2, 'F2 every foundation table exists: ' || t.name,
         to_regclass('public.' || t.name) is not null, null
  from tbl t
  union all
  select 3, 'F3 RLS enabled on session_object_state and session_evidence',
         (select bool_and(c.relrowsecurity) from pg_class c
          where c.oid in ('public.session_object_state'::regclass, 'public.session_evidence'::regclass)), null
  union all
  select 4, 'F4 case_engine_policy has the 035 distribution column',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'case_engine_policy' and column_name = 'distribution'), null
  union all
  select 5, 'F5 session_events keeps unique (session_id, milestone_code) — world-state broadcast dedupe',
         exists (select 1 from pg_constraint c
                 where c.conrelid = 'public.session_events'::regclass and c.contype = 'u'
                   and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
                        where a.attrelid = c.conrelid and a.attnum = any(c.conkey)) = array['milestone_code', 'session_id']), null
  union all
  select 6, 'F6 milestone_kind enum = broadcast, blackout',
         (select array_agg(e.enumlabel::text order by e.enumsortorder) from pg_enum e
          where e.enumtypid = 'milestone_kind'::regtype) = array['broadcast', 'blackout'], null
  union all
  select 7, 'F7 supabase_realtime publication exists',
         exists (select 1 from pg_publication where pubname = 'supabase_realtime'), null
  union all
  select 8, 'F8 hashtextextended() available (advisory-lock key)',
         exists (select 1 from pg_proc where proname = 'hashtextextended'), null
  union all
  select 9, 'F9 investigation_objects and case_runtime catalogue are RPC-only (no SELECT for authenticated)',
         not has_table_privilege('authenticated', 'public.investigation_objects', 'SELECT'), null
  -- G — grants on the re-created functions
  union all
  select 10, 'G1 authenticated can execute open_investigation(uuid)',
         has_function_privilege('authenticated', 'public.open_investigation(uuid)', 'EXECUTE'), null
  union all
  select 11, 'G2 investigation_object_index(uuid) is authenticated-only (authenticated yes, anon no, PUBLIC no)',
         has_function_privilege('authenticated', 'public.investigation_object_index(uuid)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.investigation_object_index(uuid)', 'EXECUTE')
         and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                         where p.oid = 'public.investigation_object_index(uuid)'::regprocedure
                           and a.grantee = 0 and a.privilege_type = 'EXECUTE'), null
  union all
  select 12, 'G3 PUBLIC cannot execute open_investigation(uuid)',
         not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     where p.oid = 'public.open_investigation(uuid)'::regprocedure
                       and a.grantee = 0 and a.privilege_type = 'EXECUTE'), null
  -- B — canonical bodies
  union all
  select 20, 'B1 open_investigation body is canonical 020 (md5)',
         (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'open_investigation')
           = 'a5bcaa2c2e914b92edd62382e2af4bfc',
         (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'open_investigation')
  union all
  select 21, 'B2 investigation_object_index body is canonical 026 (md5)',
         (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'investigation_object_index')
           = '579db06dbc5d6821edebd84fc654c4bb',
         (select md5(p.prosrc) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'investigation_object_index')
  union all
  select 22, 'B3 exactly one overload of each re-created function',
         (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('open_investigation', 'investigation_object_index')) = 2, null
  -- A — not yet applied
  union all
  select 30, 'A1 investigation_objects.gated does not exist yet',
         not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'investigation_objects' and column_name = 'gated'), null
  union all
  select 31, 'A2 runtime table absent: ' || t.name, to_regclass('public.' || t.name) is null, null
  from new_tbl t
  union all
  select 32, 'A3 no runtime_* trigger exists',
         not exists (select 1 from pg_trigger where tgname like 'runtime\_%' and not tgisinternal), null
  union all
  select 33, 'A4 no _runtime_* function exists',
         not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like '\_runtime\_%'), null
  union all
  select 34, 'A5 no approved-rule guard trigger exists yet',
         not exists (select 1 from pg_trigger where not tgisinternal
                     and (tgname like '%runtime\_guard' or tgname like '%runtime\_truncate\_guard' or tgname = 'case_world_states_guard')), null
  -- INFO
  union all
  select 92, 'I3 anon can execute open_investigation before 037 (INFO — 037 revokes it)', null,
         has_function_privilege('anon', 'public.open_investigation(uuid)', 'EXECUTE')::text
  union all
  select 90, 'I1 investigation objects per case (INFO)', null,
         (select string_agg(case_id || '=' || n, ', ' order by case_id)
          from (select case_id, count(*) n from public.investigation_objects group by case_id) x)
  union all
  select 91, 'I2 sessions with object state rows (INFO)', null,
         (select count(distinct session_id)::text from public.session_object_state)
) checks
order by ord, check_name;
