-- ============================================================
-- IFADA 027 — POST-APPLY VERIFICATION (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor right after applying 027.
-- Every row with a non-null pass must show pass = true.
-- Rows with pass = null are INFO (live-play counters that may grow).
-- ============================================================
with
new_tables(name) as (values ('case_connection_rules'), ('case_connection_conditions'),
                            ('session_connection_attempts'), ('session_validated_connections'),
                            ('session_connection_effects')),
all_funcs(name, is_rpc) as (values ('propose_connection', true), ('settle_connection_effects', true),
                                   ('session_connection_state', true),
                                   ('_connection_node_known', false), ('_apply_connection_effects', false)),
-- Real client roles only. PUBLIC (a pseudo-role, not a pg_roles row) is
-- checked through the object ACLs themselves: grantee 0 = PUBLIC, and a
-- NULL ACL means the type default (acldefault) — e.g. functions default
-- to EXECUTE for PUBLIC, so a NULL proacl correctly FAILS the check.
client_roles(name) as (values ('anon'), ('authenticated')),
fn as (select p.proname, p.oid, p.prosrc, p.prosecdef, p.proconfig, p.proacl, p.proowner
       from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in (select name from all_funcs))
select check_name, pass, detail from (
  -- T — tables: exist, RLS on/not forced, no policies, no direct client access
  select 1 as ord, 'T1 table exists: ' || t.name as check_name,
         to_regclass('public.' || t.name) is not null as pass, null::text as detail
  from new_tables t
  union all
  select 2, 'T2 RLS enabled and not forced: ' || t.name,
         coalesce(c.relrowsecurity and not c.relforcerowsecurity, false), null
  from new_tables t
  left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.name
  union all
  select 3, 'T3 no policies (RPC-only): ' || t.name,
         not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.name), null
  from new_tables t
  union all
  select 4, 'T4 no SELECT/INSERT/UPDATE/DELETE for ' || r.name || ': ' || t.name,
         not (has_table_privilege(r.name, 'public.' || t.name, 'SELECT')
           or has_table_privilege(r.name, 'public.' || t.name, 'INSERT')
           or has_table_privilege(r.name, 'public.' || t.name, 'UPDATE')
           or has_table_privilege(r.name, 'public.' || t.name, 'DELETE')), null
  from new_tables t cross join client_roles r
  union all
  select 4, 'T4 no SELECT/INSERT/UPDATE/DELETE for PUBLIC (pseudo-role, via ACL): ' || t.name,
         to_regclass('public.' || t.name) is not null
         and not exists (select 1
                         from pg_class c,
                              aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                         where c.oid = to_regclass('public.' || t.name)
                           and a.grantee = 0
                           and a.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')), null
  from new_tables t
  union all
  select 5, 'T5 no sequence USAGE for ' || r.name,
         not has_sequence_privilege(r.name, 'public.session_connection_attempts_id_seq', 'USAGE'), null
  from client_roles r
  union all
  select 5, 'T5 no sequence USAGE/SELECT/UPDATE for PUBLIC (pseudo-role, via ACL)',
         to_regclass('public.session_connection_attempts_id_seq') is not null
         and not exists (select 1
                         from pg_class c,
                              aclexplode(coalesce(c.relacl, acldefault('s', c.relowner))) a
                         where c.oid = to_regclass('public.session_connection_attempts_id_seq')
                           and a.grantee = 0
                           and a.privilege_type in ('USAGE', 'SELECT', 'UPDATE')), null
  -- F — functions: exist once, SECURITY DEFINER + search_path, exact EXECUTE grants
  union all
  select 6, 'F1 function exists exactly once: ' || a.name,
         (select count(*) from fn where fn.proname = a.name) = 1, null
  from all_funcs a
  union all
  select 7, 'F2 SECURITY DEFINER + search_path=public: ' || fn.proname,
         fn.prosecdef and coalesce('search_path=public' = any(fn.proconfig), false),
         array_to_string(fn.proconfig, ',')
  from fn
  union all
  select 8, 'F3 EXECUTE ' || r.name || ' on ' || fn.proname || ' expected '
              || case when a.is_rpc and r.name = 'authenticated' then 'YES' else 'NO' end,
         has_function_privilege(r.name, fn.oid, 'EXECUTE') = (a.is_rpc and r.name = 'authenticated'), null
  from fn join all_funcs a on a.name = fn.proname cross join client_roles r
  union all
  select 8, 'F3 EXECUTE PUBLIC (pseudo-role, via ACL) on ' || fn.proname || ' expected NO',
         not exists (select 1
                     from aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) a
                     where a.grantee = 0 and a.privilege_type = 'EXECUTE'), null
  from fn
  -- B — 026 authorization boundary reused, privacy before rules
  union all
  select 9, 'B1 node check: readable evidence_index row only',
         position('from public.evidence_index(p_session) e' in fn.prosrc) > 0
         and position('e.readable' in fn.prosrc) > 0, null
  from fn where fn.proname = '_connection_node_known'
  union all
  select 10, 'B2 node check: 026 _object_state_row_visible for object/location',
         position('public._object_state_row_visible(p_session, p_id)' in fn.prosrc) > 0, null
  from fn where fn.proname = '_connection_node_known'
  union all
  select 11, 'B3 every node checked before any rule is read',
         position('public._connection_node_known(' in fn.prosrc) > 0
         and position('public._connection_node_known(' in fn.prosrc)
             < position('from public.case_connection_rules' in fn.prosrc), null
  from fn where fn.proname = 'propose_connection'
  union all
  select 12, 'B4 rules and conditions are case-scoped and approved-only',
         position('where r.case_id = v_case and r.status = ''approved''' in fn.prosrc) > 0
         and position('where c.case_id = v_case and c.status = ''approved''' in fn.prosrc) > 0, null
  from fn where fn.proname = 'propose_connection'
  -- R — approved rate limits
  union all
  select 13, 'R1 per-player limit = 6 proposals / 60 s',
         fn.prosrc ~ 'c_player_per_min constant integer := 6;'
         and position('interval ''60 seconds''' in fn.prosrc) > 0, null
  from fn where fn.proname = 'propose_connection'
  union all
  select 14, 'R2 team limit = 20 / 10 minutes',
         fn.prosrc ~ 'c_team_fail_max\s+constant integer := 20;'
         and fn.prosrc ~ 'c_team_window\s+constant interval := interval ''10 minutes'';', null
  from fn where fn.proname = 'propose_connection'
  union all
  select 15, 'R3 team limit counts FAILED (not_established) proposals only',
         position('a.outcome = ''not_established''' in fn.prosrc) > 0, null
  from fn where fn.proname = 'propose_connection'
  -- N — no oracle
  union all
  select 16, 'N1 success returns only the authored meaning',
         position('jsonb_build_object(''status'', ''validated'', ''meaning'', v_match.meaning)' in fn.prosrc) > 0, null
  from fn where fn.proname = 'propose_connection'
  union all
  select 17, 'N2 effects never raise to the proposer (pending/log instead)',
         position('raise exception' in fn.prosrc) = 0
         and position('''evidence_pending''' in fn.prosrc) > 0, null
  from fn where fn.proname = '_apply_connection_effects'
  -- S — the migration seeded nothing
  union all
  select 18, 'S1 no authored connection rules seeded',
         (select count(*) from public.case_connection_rules) = 0, null
  union all
  select 19, 'S2 no authored conditions seeded',
         (select count(*) from public.case_connection_conditions) = 0, null
  union all
  select 20, 'S3 session connection tables empty',
         (select count(*) from public.session_connection_attempts)
         + (select count(*) from public.session_validated_connections)
         + (select count(*) from public.session_connection_effects) = 0, null
  -- C — unrelated case content unchanged (expected = pre-027 baseline)
  union all
  select 21, 'C1 room-714 evidence = 34', (select count(*) from public.evidence where case_id = 'room-714') = 34, null
  union all
  select 22, 'C2 room-714 investigation_objects = 10', (select count(*) from public.investigation_objects where case_id = 'room-714') = 10, null
  union all
  select 23, 'C3 room-714 investigation_challenges = 3', (select count(*) from public.investigation_challenges where case_id = 'room-714') = 3, null
  union all
  select 24, 'C4 scene-17 has no evidence / objects / challenges',
         (select count(*) from public.evidence where case_id = 'scene-17')
         + (select count(*) from public.investigation_objects where case_id = 'scene-17')
         + (select count(*) from public.investigation_challenges where case_id = 'scene-17') = 0, null
  union all
  select 25, 'C5 catalogue unchanged (028 not applied: both cases published)',
         (select count(*) from public.cases where id in ('room-714', 'scene-17') and is_published) = 2, null
  -- I — INFO: live-play counters (baseline 2026-10-01; may grow with play, must never shrink)
  union all
  select 26, 'I1 sessions (baseline room-714 14, scene-17 0)', null::boolean,
         (select string_agg(case_id || '=' || n, ', ' order by case_id)
          from (select case_id, count(*)::text as n from public.sessions group by case_id) x)
  union all
  select 27, 'I2 session_evidence (baseline 93)', null, (select count(*)::text from public.session_evidence)
  union all
  select 28, 'I3 session_object_state (baseline 50)', null, (select count(*)::text from public.session_object_state)
  union all
  select 29, 'I4 session_evidence_sources (baseline 4)', null, (select count(*)::text from public.session_evidence_sources)
) checks
order by ord, check_name;
