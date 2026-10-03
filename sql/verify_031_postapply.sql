-- ============================================================
-- IFADA 031 — POST-APPLY VERIFICATION (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor right after applying 031.
-- Every row with a non-null pass must show pass = true.
-- Rows with pass = null are INFO (live-play counters that may grow).
-- ============================================================
with
board_tables(name) as (values ('board_items'), ('board_threads'), ('board_validations')),
all_tables(name) as (select name from board_tables union all values ('case_engine_policy')),
all_funcs(name, is_rpc) as (values
  ('pin_board_material', true), ('add_board_reasoning', true), ('move_board_item', true),
  ('edit_board_reasoning', true), ('remove_board_item', true), ('link_board_items', true),
  ('unlink_board_thread', true), ('test_board_selection', true),
  ('_board_material_team_visible', false)),
-- Real client roles only. PUBLIC is checked through object ACLs (grantee 0;
-- NULL ACL = type default, e.g. functions default to EXECUTE for PUBLIC).
client_roles(name) as (values ('anon'), ('authenticated')),
fn as (select p.proname, p.oid, p.prosrc, p.prosecdef, p.proconfig, p.proacl, p.proowner
       from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname in (select name from all_funcs))
select check_name, pass, detail from (
  -- T — tables, RLS, policies, direct access
  select 1 as ord, 'T1 table exists: ' || t.name as check_name,
         to_regclass('public.' || t.name) is not null as pass, null::text as detail
  from all_tables t
  union all
  select 2, 'T2 RLS enabled and not forced: ' || t.name,
         coalesce(c.relrowsecurity and not c.relforcerowsecurity, false), null
  from all_tables t left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.name
  union all
  select 3, 'T3 exactly one policy, permissive SELECT for authenticated: ' || t.name,
         (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.name) = 1
         and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.name
                       and p.cmd = 'SELECT' and p.permissive = 'PERMISSIVE' and p.roles = '{authenticated}'
                       and p.qual like '%is_session_member(session_id)%'), null
  from board_tables t
  union all
  select 3, 'T3 case_engine_policy has no policies (server-only)',
         not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'case_engine_policy'), null
  union all
  select 4, 'T4 no INSERT/UPDATE/DELETE for ' || r.name || ': ' || t.name,
         not (has_table_privilege(r.name, 'public.' || t.name, 'INSERT')
           or has_table_privilege(r.name, 'public.' || t.name, 'UPDATE')
           or has_table_privilege(r.name, 'public.' || t.name, 'DELETE')), null
  from all_tables t cross join client_roles r
  union all
  select 4, 'T4 SELECT only for authenticated on board tables: ' || t.name,
         has_table_privilege('authenticated', 'public.' || t.name, 'SELECT')
         and not has_table_privilege('anon', 'public.' || t.name, 'SELECT'), null
  from board_tables t
  union all
  select 4, 'T4 no client SELECT on case_engine_policy',
         not has_table_privilege('authenticated', 'public.case_engine_policy', 'SELECT')
         and not has_table_privilege('anon', 'public.case_engine_policy', 'SELECT'), null
  union all
  select 4, 'T4 no privileges for PUBLIC (pseudo-role, via ACL): ' || t.name,
         to_regclass('public.' || t.name) is not null
         and not exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                         where c.oid = to_regclass('public.' || t.name) and a.grantee = 0), null
  from all_tables t
  -- F — functions, definer, search_path, exact EXECUTE grants
  union all
  select 5, 'F1 function exists exactly once: ' || a.name,
         (select count(*) from fn where fn.proname = a.name) = 1, null
  from all_funcs a
  union all
  select 6, 'F2 SECURITY DEFINER + search_path=public: ' || fn.proname,
         fn.prosecdef and coalesce('search_path=public' = any(fn.proconfig), false),
         array_to_string(fn.proconfig, ',')
  from fn
  union all
  select 7, 'F3 EXECUTE ' || r.name || ' on ' || fn.proname || ' expected '
              || case when a.is_rpc and r.name = 'authenticated' then 'YES' else 'NO' end,
         has_function_privilege(r.name, fn.oid, 'EXECUTE') = (a.is_rpc and r.name = 'authenticated'), null
  from fn join all_funcs a on a.name = fn.proname cross join client_roles r
  union all
  select 7, 'F3 EXECUTE PUBLIC (pseudo-role, via ACL) on ' || fn.proname || ' expected NO',
         not exists (select 1 from aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) a
                     where a.grantee = 0 and a.privilege_type = 'EXECUTE'), null
  from fn
  -- B — server-side boundaries
  union all
  select 8, 'B1 pin_board_material refuses anything not team-visible',
         position('public._board_material_team_visible(p_session, p_kind, p_code)' in fn.prosrc) > 0
         and position('''NOT_PINNABLE''' in fn.prosrc) > 0, null
  from fn where fn.proname = 'pin_board_material'
  union all
  select 9, 'B2 evidence pins need case policy ''title''; no policy row = hidden',
         position('from public.case_engine_policy' in fn.prosrc) > 0
         and position('''hidden'') <> ''title''' in fn.prosrc) > 0, null
  from fn where fn.proname = '_board_material_team_visible'
  union all
  select 10, 'B3 object pins reuse the 026 boundary and require a shared chain',
         position('public._object_state_row_visible(p_session, v_code)' in fn.prosrc) > 0
         and position('sos.discovered and sos.is_shared' in fn.prosrc) > 0, null
  from fn where fn.proname = '_board_material_team_visible'
  union all
  select 11, 'B4 connection tests go through 027 propose_connection (no second implementation)',
         position('public.propose_connection(p_session, v_nodes, null)' in fn.prosrc) > 0
         and position('case_connection_rules' in fn.prosrc) = 0, null
  from fn where fn.proname = 'test_board_selection'
  union all
  select 12, 'B5 only test_board_selection writes board_validations',
         (select count(*) from fn where position('board_validations' in fn.prosrc) > 0) = 1
         and exists (select 1 from fn where fn.proname = 'test_board_selection'
                       and position('insert into public.board_validations' in fn.prosrc) > 0), null
  union all
  select 13, 'B6 thread kinds exclude any validated state',
         exists (select 1 from pg_constraint k where k.conrelid = 'public.board_threads'::regclass and k.contype = 'c'
                   and pg_get_constraintdef(k.oid) like '%tentative%support%tension%')
         and not exists (select 1 from pg_constraint k where k.conrelid = 'public.board_threads'::regclass
                           and pg_get_constraintdef(k.oid) like '%validated%'), null
  union all
  select 14, 'B7 material rows can never carry a stored label',
         exists (select 1 from pg_constraint k where k.conrelid = 'public.board_items'::regclass and k.contype = 'c'
                   and pg_get_constraintdef(k.oid) like '%kind <> ''material''%text = ''''%'), null
  union all
  select 15, 'B8 board_validations stores no rule id',
         not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'board_validations' and column_name like '%rule%'), null
  -- R — realtime
  union all
  select 16, 'R1 realtime publishes: ' || t.name,
         exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t.name), null
  from board_tables t
  -- S — nothing authored seeded; engine policy exactly as intended
  union all
  select 17, 'S1 engine policy: exactly room-714 = title, no scene-17 row',
         (select count(*) from public.case_engine_policy) = 1
         and exists (select 1 from public.case_engine_policy where case_id = 'room-714' and restricted_evidence = 'title'), null
  union all
  select 18, 'S2 board tables start empty',
         (select count(*) from public.board_items) + (select count(*) from public.board_threads)
         + (select count(*) from public.board_validations) = 0, null
  union all
  select 19, 'S3 no connection rules seeded by 031 (032 not applied)',
         (select count(*) from public.case_connection_rules) = 0, null
  -- C — existing case content unchanged (expected = pre-031 baseline)
  union all
  select 20, 'C1 room-714 evidence = 34', (select count(*) from public.evidence where case_id = 'room-714') = 34, null
  union all
  select 21, 'C2 room-714 investigation_objects = 10', (select count(*) from public.investigation_objects where case_id = 'room-714') = 10, null
  union all
  select 22, 'C3 room-714 investigation_challenges = 3', (select count(*) from public.investigation_challenges where case_id = 'room-714') = 3, null
  union all
  select 23, 'C4 scene-17 has no evidence / objects / challenges',
         (select count(*) from public.evidence where case_id = 'scene-17')
         + (select count(*) from public.investigation_objects where case_id = 'scene-17')
         + (select count(*) from public.investigation_challenges where case_id = 'scene-17') = 0, null
  union all
  select 24, 'C5 catalogue unchanged (028 not applied: both cases published)',
         (select count(*) from public.cases where id in ('room-714', 'scene-17') and is_published) = 2, null
  union all
  select 25, 'I1 legacy board rows (must not shrink; 031 does not touch them)', null::boolean,
         (select count(*)::text from public.board_notes) || ' notes / ' || (select count(*)::text from public.board_links) || ' links'
  union all
  select 26, 'I2 session_object_state rows (live play may change)', null, (select count(*)::text from public.session_object_state)
) checks
order by ord, check_name;
