-- ============================================================
-- IFADA 033 — POST-APPLY VERIFICATION (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor right after applying 033.
-- Every row with a non-null pass must show pass = true.
-- Rows with pass = null are INFO (live-play counters).
--
-- T — new tables, RLS, policies, direct access
-- C — team_safe column + approved ⇒ team_safe constraint
-- F — functions: once each, SECURITY DEFINER, search_path, exact EXECUTE
-- B — server-side boundaries in the function bodies
-- R — realtime: proposal rows only, never contributions
-- S — nothing seeded
-- K — case content unchanged
-- V — 031 Board V2 and 034 legacy lock intact
-- ============================================================
with
new_tables(name) as (values ('session_joint_proposals'), ('session_joint_contributions')),
all_funcs(name, is_rpc) as (values
  ('_connection_throttled', false), ('_connection_match', false),
  ('propose_connection', true), ('open_joint_proposal', true), ('contribute_to_joint', true),
  ('withdraw_joint_contribution', true), ('close_joint_proposal', true), ('test_joint_proposal', true),
  ('joint_proposals', true)),
internal_027(name) as (values ('_connection_node_known'), ('_apply_connection_effects')),
board_tables(name) as (values ('board_items'), ('board_threads'), ('board_validations')),
legacy(name) as (values ('board_notes'), ('board_links')),
-- Real client roles only. PUBLIC is checked through object ACLs (grantee 0;
-- NULL ACL = type default, e.g. functions default to EXECUTE for PUBLIC).
client_roles(name) as (values ('anon'), ('authenticated')),
fn as (select p.proname, p.oid, p.prosrc, p.prosecdef, p.proconfig, p.proacl, p.proowner
       from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname in (select name from all_funcs)),
src(name, body) as (select proname, prosrc from fn)
select check_name, pass, detail from (
  -- T — tables
  select 1 as ord, 'T1 table exists: ' || t.name as check_name,
         to_regclass('public.' || t.name) is not null as pass, null::text as detail
  from new_tables t
  union all
  select 2, 'T2 RLS enabled and not forced: ' || t.name,
         coalesce(c.relrowsecurity and not c.relforcerowsecurity, false), null
  from new_tables t left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.name
  union all
  select 3, 'T3 session_joint_proposals: exactly one policy, permissive member SELECT',
         (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'session_joint_proposals') = 1
         and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'session_joint_proposals'
                       and p.cmd = 'SELECT' and p.permissive = 'PERMISSIVE' and p.roles = '{authenticated}'
                       and p.qual like '%is_session_member(session_id)%'), null
  union all
  select 3, 'T3 session_joint_contributions: no policies (RPC-only — carries node identities)',
         not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'session_joint_contributions'), null
  union all
  select 4, 'T4 no INSERT/UPDATE/DELETE for ' || r.name || ': ' || t.name,
         not (has_table_privilege(r.name, 'public.' || t.name, 'INSERT')
           or has_table_privilege(r.name, 'public.' || t.name, 'UPDATE')
           or has_table_privilege(r.name, 'public.' || t.name, 'DELETE')), null
  from new_tables t cross join client_roles r
  union all
  select 4, 'T4 proposals readable by authenticated only (not anon)',
         has_table_privilege('authenticated', 'public.session_joint_proposals', 'SELECT')
         and not has_table_privilege('anon', 'public.session_joint_proposals', 'SELECT'), null
  union all
  select 4, 'T4 contributions not readable by any client role',
         not has_table_privilege('authenticated', 'public.session_joint_contributions', 'SELECT')
         and not has_table_privilege('anon', 'public.session_joint_contributions', 'SELECT'), null
  union all
  select 4, 'T4 no privileges for PUBLIC (pseudo-role, via ACL): ' || t.name,
         to_regclass('public.' || t.name) is not null
         and not exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                         where c.oid = to_regclass('public.' || t.name) and a.grantee = 0), null
  from new_tables t
  -- C — team_safe
  union all
  select 5, 'C1 case_connection_rules.team_safe: boolean NOT NULL default false',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'case_connection_rules' and column_name = 'team_safe'
                   and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false'), null
  union all
  select 6, 'C2 constraint: an approved rule must be team_safe',
         exists (select 1 from pg_constraint k
                 where k.conrelid = 'public.case_connection_rules'::regclass and k.contype = 'c'
                   and k.conname = 'case_connection_rules_approved_team_safe'
                   and pg_get_constraintdef(k.oid) like '%status <> ''approved''%team_safe%'), null
  -- F — functions
  union all
  select 7, 'F1 function exists exactly once: ' || a.name,
         (select count(*) from fn where fn.proname = a.name) = 1, null
  from all_funcs a
  union all
  select 8, 'F2 SECURITY DEFINER + search_path=public: ' || fn.proname,
         fn.prosecdef and coalesce('search_path=public' = any(fn.proconfig), false),
         array_to_string(fn.proconfig, ',')
  from fn
  union all
  select 9, 'F3 EXECUTE ' || r.name || ' on ' || fn.proname || ' expected '
              || case when a.is_rpc and r.name = 'authenticated' then 'YES' else 'NO' end,
         has_function_privilege(r.name, fn.oid, 'EXECUTE') = (a.is_rpc and r.name = 'authenticated'), null
  from fn join all_funcs a on a.name = fn.proname cross join client_roles r
  union all
  select 10, 'F4 EXECUTE PUBLIC (pseudo-role, via ACL) on ' || fn.proname || ' expected NO',
         not exists (select 1 from aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) a
                     where a.grantee = 0 and a.privilege_type = 'EXECUTE'), null
  from fn
  union all
  select 11, 'F5 027 internal helper still not executable by clients: ' || i.name,
         coalesce((select bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE')
                                   and not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
                   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = i.name), false), null
  from internal_027 i
  -- B — boundaries in the bodies
  union all
  select 12, 'B1 contribute: vouched by the contributor''s own readability, contributor = auth.uid(), one neutral refusal',
         position('public._connection_node_known(v_p.session_id, v_kind, v_id)' in s.body) > 0
         and position('values (p_proposal, v_p.session_id, v_kind, v_id, auth.uid())' in s.body) > 0
         and (length(s.body) - length(replace(s.body, 'raise exception', ''))) / length('raise exception') = 1
         and position('''NOT_CONTRIBUTABLE''' in s.body) > 0, null
  from src s where s.name = 'contribute_to_joint'
  union all
  select 13, 'B2 no joint RPC accepts a user id (contributor is server-owned)',
         not exists (select 1 from pg_proc p
                     where p.pronamespace = 'public'::regnamespace
                       and p.proname in ('open_joint_proposal', 'contribute_to_joint', 'withdraw_joint_contribution',
                                         'close_joint_proposal', 'test_joint_proposal', 'joint_proposals')
                       and pg_get_function_identity_arguments(p.oid) ~* 'p_(user|contributor|author|uid)'), null
  union all
  select 14, 'B3 withdraw: own contribution only, open proposals only',
         position('c.contributor = auth.uid()' in s.body) > 0 and position('p.status = ''open''' in s.body) > 0, null
  from src s where s.name = 'withdraw_joint_contribution'
  union all
  select 15, 'B4 joint test: live members only, session case authoritative, shared throttle + matcher, incomplete recorded',
         position('join public.session_members m on m.session_id = c.session_id and m.user_id = c.contributor' in s.body) > 0
         and position('select s.case_id into v_case from public.sessions s where s.id = v_p.session_id' in s.body) > 0
         and position('public._connection_throttled(v_p.session_id)' in s.body) > 0
         and position('public._connection_match(v_p.session_id, v_case, v_nodes, v_keys, v_p.relation)' in s.body) > 0
         and position('insert into public.session_connection_attempts' in s.body) > 0, null
  from src s where s.name = 'test_joint_proposal'
  union all
  select 16, 'B5 the one matcher: this case only, approved AND team_safe only',
         position('where r.case_id = p_case and r.status = ''approved'' and r.team_safe' in s.body) > 0, null
  from src s where s.name = '_connection_match'
  union all
  select 17, 'B6 shared budget unchanged: 6 / 60 s per player, 20 not_established / 10 min per team',
         position('c_player_per_min constant integer := 6;' in s.body) > 0
         and position('c_team_fail_max  constant integer := 20;' in s.body) > 0
         and position('c_team_window    constant interval := interval ''10 minutes'';' in s.body) > 0
         and position('interval ''60 seconds''' in s.body) > 0, null
  from src s where s.name = '_connection_throttled'
  union all
  select 18, 'B7 solo propose_connection keeps the 027 contract (member, shape, throttle first, privacy first, one matcher)',
         position('if not public.is_session_member(p_session) then' in s.body) > 0
         and position('jsonb_array_length(p_nodes) > 5' in s.body) > 0
         and position('octet_length(p_nodes::text) > 2000' in s.body) > 0
         and position('public._connection_throttled(p_session)' in s.body) > 0
         and position('public._connection_throttled(p_session)' in s.body) < position('public._connection_node_known(' in s.body)
         and position('public._connection_node_known(' in s.body) < position('public._connection_match(' in s.body)
         and position('return public._connection_match(p_session, v_case, p_nodes, v_keys, p_relation);' in s.body) > 0
         and position('case_connection_rules' in s.body) = 0, null
  from src s where s.name = 'propose_connection'
  union all
  select 19, 'B8 no rule id / reason / missing-node / score in any player response',
         not exists (select 1 from src s
                     where s.name in ('propose_connection', 'test_joint_proposal', '_connection_match', 'joint_proposals')
                       and s.body ~ 'jsonb_build_object\([^)]*''(rule|rule_id|reason|missing|score|effects|target)''')
         and (select count(*) from src s where s.name = '_connection_match'
                and position('jsonb_build_object(''status'', ''validated'', ''meaning'', v_match.meaning)' in s.body) > 0) = 1, null
  union all
  select 20, 'B9 effects stay idempotent: applied only by the transaction that recorded the validation',
         s.body ~ 'on conflict do nothing;\s+if found then\s+v_produced := v_produced \+ public\._apply_connection_effects\(p_session, v_match\.effects\);'
         and s.body ~ 'on conflict do nothing;\s+if found then\s+v_produced := v_produced \+ public\._apply_connection_effects\(p_session, v_cond\.effects\);', null
  from src s where s.name = '_connection_match'
  union all
  select 21, 'B10 masked team view: refs only for mine or team-visible material, live members only, never bodies',
         position('public._board_material_team_visible(p_session, c.node_kind, c.node_id)' in s.body) > 0
         and position('join public.session_members m on m.session_id = c.session_id and m.user_id = c.contributor' in s.body) > 0
         and position('evidence_index' in s.body) = 0 and position('body' in s.body) = 0, null
  from src s where s.name = 'joint_proposals'
  -- R — realtime
  union all
  select 22, 'R1 realtime publishes session_joint_proposals (no node data)',
         exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_joint_proposals'), null
  union all
  select 22, 'R2 realtime does NOT publish session_joint_contributions',
         not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_joint_contributions'), null
  -- S — nothing seeded
  union all
  select 23, 'S1 no approved rule (033 seeds nothing; 032 step 2 not run)',
         not exists (select 1 from public.case_connection_rules where status = 'approved'), null
  union all
  select 23, 'S2 rule rows are none, or only the known 032 drafts',
         not exists (select 1 from public.case_connection_rules r
                     where not (r.case_id = 'room-714' and r.status = 'draft'
                                and r.rule_id in ('R714_NO_VICTIM_BLOOD', 'R714_N17_PAYMENTS', 'R714_COPY_AFTER_MESSAGE'))),
         (select count(*)::text from public.case_connection_rules) || ' rule rows'
  union all
  select 23, 'S3 joint tables start empty',
         (select count(*) from public.session_joint_proposals) + (select count(*) from public.session_joint_contributions) = 0, null
  -- K — case content unchanged (expected = pre-033 baseline)
  union all
  select 24, 'K1 room-714 evidence = 34', (select count(*) from public.evidence where case_id = 'room-714') = 34, null
  union all
  select 25, 'K2 room-714 investigation_objects = 10', (select count(*) from public.investigation_objects where case_id = 'room-714') = 10, null
  union all
  select 26, 'K3 room-714 investigation_challenges = 3', (select count(*) from public.investigation_challenges where case_id = 'room-714') = 3, null
  union all
  select 27, 'K4 scene-17 has no evidence / objects / challenges',
         (select count(*) from public.evidence where case_id = 'scene-17')
         + (select count(*) from public.investigation_objects where case_id = 'scene-17')
         + (select count(*) from public.investigation_challenges where case_id = 'scene-17') = 0, null
  union all
  select 28, 'K5 catalogue unchanged (028 not applied: both cases published)',
         (select count(*) from public.cases where id in ('room-714', 'scene-17') and is_published) = 2, null
  -- V — 031 and 034 intact
  union all
  select 29, 'V1 031 board tables: authenticated SELECT only, no client writes',
         not exists (select 1 from board_tables t cross join client_roles r
                     where has_table_privilege(r.name, 'public.' || t.name, 'INSERT')
                        or has_table_privilege(r.name, 'public.' || t.name, 'UPDATE')
                        or has_table_privilege(r.name, 'public.' || t.name, 'DELETE'))
         and not exists (select 1 from board_tables t where not has_table_privilege('authenticated', 'public.' || t.name, 'SELECT')), null
  union all
  select 30, 'V2 031 test_board_selection still validates through propose_connection',
         exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'test_board_selection'
                   and position('public.propose_connection(p_session, v_nodes, null)' in p.prosrc) > 0), null
  union all
  select 31, 'V3 034 legacy lock intact — no client writes/truncate: ' || l.name,
         not exists (select 1 from client_roles r
                     where has_table_privilege(r.name, 'public.' || l.name, 'INSERT')
                        or has_table_privilege(r.name, 'public.' || l.name, 'UPDATE')
                        or has_table_privilege(r.name, 'public.' || l.name, 'DELETE')
                        or has_table_privilege(r.name, 'public.' || l.name, 'TRUNCATE')), null
  from legacy l
  -- INFO
  union all
  select 32, 'I1 Board V2 rows (items / threads / validations)', null::boolean,
         (select count(*)::text from public.board_items) || ' / ' || (select count(*)::text from public.board_threads)
         || ' / ' || (select count(*)::text from public.board_validations)
  union all
  select 33, 'I2 legacy board rows (expected 18 notes / 5 links)', null::boolean,
         (select count(*)::text from public.board_notes) || ' notes / ' || (select count(*)::text from public.board_links) || ' links'
) checks
order by ord, check_name;
