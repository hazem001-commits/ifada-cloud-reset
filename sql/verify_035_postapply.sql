-- ============================================================
-- IFADA 035 — POST-APPLY VERIFICATION (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor right after applying 035.
-- Every row with a non-null pass must show pass = true.
-- Rows with pass = null are INFO (live-play counters).
--
-- T — channel tables: RLS, no policies, no client access at all
-- C — distribution model on case_engine_policy
-- F — functions: once each, SECURITY DEFINER, search_path, exact EXECUTE
-- B — the single readability boundary in every consumer body
-- R — realtime
-- S — nothing seeded (no Scene 17 config, no rules, 032 not applied)
-- K — case content unchanged
-- V — 031 / 033 / 034 intact
-- ============================================================
with
chan_tables(name) as (values ('case_channels'), ('case_channel_seats'), ('case_evidence_channels'), ('session_member_channels')),
all_funcs(name, auth_exec) as (values
  ('_evidence_readable', false), ('_assign_session_channels', false), ('_sessions_assign_channels_on_start', false),
  ('_board_material_team_visible', false),
  ('_evidence_row_visible', true),                 -- used by the session_evidence RLS policy
  ('evidence_index', true), ('unlockable_evidence', true), ('unlock_evidence', true), ('expiring_evidence', true),
  ('evidence_provenance', true), ('my_channels', true)),
board_tables(name) as (values ('board_items'), ('board_threads'), ('board_validations')),
legacy(name) as (values ('board_notes'), ('board_links')),
-- Real client roles only. PUBLIC is checked through object ACLs (grantee 0).
client_roles(name) as (values ('anon'), ('authenticated')),
fn as (select p.proname, p.oid, p.prosrc, p.prosecdef, p.proconfig, p.proacl, p.proowner
       from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname in (select name from all_funcs)),
src(name, body) as (select p.proname, p.prosrc from pg_proc p
                    where p.pronamespace = 'public'::regnamespace
                      and p.proname in (select name from all_funcs union all
                                        select unnest(array['_connection_node_known', 'contribute_to_joint', '_connection_match', 'test_board_selection'])))
select check_name, pass, detail from (
  -- T — tables
  select 1 as ord, 'T1 table exists: ' || t.name as check_name, to_regclass('public.' || t.name) is not null as pass, null::text as detail
  from chan_tables t
  union all
  select 2, 'T2 RLS enabled and not forced: ' || t.name,
         coalesce(c.relrowsecurity and not c.relforcerowsecurity, false), null
  from chan_tables t left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.name
  union all
  select 3, 'T3 no policies (server-only): ' || t.name,
         not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.name), null
  from chan_tables t
  union all
  select 4, 'T4 no client access (select/insert/update/delete) for ' || r.name || ': ' || t.name,
         not (has_table_privilege(r.name, 'public.' || t.name, 'SELECT')
           or has_table_privilege(r.name, 'public.' || t.name, 'INSERT')
           or has_table_privilege(r.name, 'public.' || t.name, 'UPDATE')
           or has_table_privilege(r.name, 'public.' || t.name, 'DELETE')), null
  from chan_tables t cross join client_roles r
  union all
  select 5, 'T5 no privileges for PUBLIC (pseudo-role, via ACL): ' || t.name,
         to_regclass('public.' || t.name) is not null
         and not exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                         where c.oid = to_regclass('public.' || t.name) and a.grantee = 0), null
  from chan_tables t
  -- C — distribution model
  union all
  select 6, 'C1 case_engine_policy.distribution: text NOT NULL default specialization',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'case_engine_policy' and column_name = 'distribution'
                   and is_nullable = 'NO' and column_default like '''specialization''%'), null
  union all
  select 6, 'C2 constraint: a channel-distributed case must use the hidden policy',
         exists (select 1 from pg_constraint k
                 where k.conrelid = 'public.case_engine_policy'::regclass and k.conname = 'case_engine_policy_channels_hidden'
                   and pg_get_constraintdef(k.oid) like '%distribution <> ''channels''%restricted_evidence = ''hidden''%'), null
  union all
  select 6, 'C3 room-714 keeps specialization distribution + title policy',
         exists (select 1 from public.case_engine_policy
                 where case_id = 'room-714' and distribution = 'specialization' and restricted_evidence = 'title'), null
  union all
  select 6, 'C4 exactly one engine-policy row (no Scene 17 configuration seeded)',
         (select count(*) from public.case_engine_policy) = 1, null
  -- F — functions
  union all
  select 7, 'F1 function exists exactly once: ' || a.name, (select count(*) from fn where fn.proname = a.name) = 1, null
  from all_funcs a
  union all
  select 8, 'F2 SECURITY DEFINER + search_path=public: ' || fn.proname,
         fn.prosecdef and coalesce('search_path=public' = any(fn.proconfig), false), array_to_string(fn.proconfig, ',')
  from fn
  union all
  select 9, 'F3 EXECUTE ' || r.name || ' on ' || fn.proname || ' expected '
              || case when a.auth_exec and r.name = 'authenticated' then 'YES' else 'NO' end,
         has_function_privilege(r.name, fn.oid, 'EXECUTE') = (a.auth_exec and r.name = 'authenticated'), null
  from fn join all_funcs a on a.name = fn.proname cross join client_roles r
  union all
  select 10, 'F4 EXECUTE PUBLIC (pseudo-role, via ACL) on ' || fn.proname || ' expected NO',
         not exists (select 1 from aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) a
                     where a.grantee = 0 and a.privilege_type = 'EXECUTE'), null
  from fn
  -- B — the single boundary
  union all
  select 11, 'B1 evidence_index: readability from _evidence_readable; hidden rows never returned',
         position('public._evidence_readable(p_session, e.id) as can_read' in s.body) > 0
         and position('(rd.can_read or public._evidence_row_visible(p_session, e.id))' in s.body) > 0
         and position('has_specialization' in s.body) = 0, null
  from src s where s.name = 'evidence_index'
  union all
  select 12, 'B2 one readability rule (no has_specialization) in: ' || s.name,
         position('public._evidence_readable(' in s.body) > 0 and position('has_specialization' in s.body) = 0, null
  from src s where s.name in ('unlockable_evidence', 'unlock_evidence', 'expiring_evidence')
  union all
  select 13, 'B3 _evidence_readable: specialization branch = today''s rule; channels = own session assignment; else closed',
         position('if v_dist = ''specialization'' then' in s.body) > 0
         and position('return public.has_specialization(p_session, v_owner);' in s.body) > 0
         and position('m.session_id = p_session and m.user_id = auth.uid()' in s.body) > 0
         and position('m.case_id = v_case and m.channel_id = v_channel' in s.body) > 0
         and position('v_ev_case is distinct from v_case' in s.body) > 0
         and s.body ~ 'end if;\s+return false;\s+(-{2}[^\n]*\s+)?end;\s*$', null
  from src s where s.name = '_evidence_readable'
  union all
  select 14, 'B4 _evidence_row_visible: readable, or title-only only where the case policy is title',
         position('public._evidence_readable(p_session, p_evidence_id)' in s.body) > 0
         and position('p.restricted_evidence = ''title''' in s.body) > 0, null
  from src s where s.name = '_evidence_row_visible'
  union all
  select 15, 'B5 evidence_provenance: evidence visibility on both branches',
         (length(s.body) - length(replace(s.body, '_evidence_row_visible', ''))) / length('_evidence_row_visible') = 2, null
  from src s where s.name = 'evidence_provenance'
  union all
  select 16, 'B6 session_evidence: exactly one SELECT policy, filtered by row visibility (realtime too)',
         (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'session_evidence') = 1
         and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'session_evidence'
                       and p.cmd = 'SELECT' and p.qual like '%is_session_member(session_id)%'
                       and p.qual like '%_evidence_row_visible(session_id, evidence_id)%'), null
  union all
  select 17, 'B7 Board V2: title policy unchanged; hidden policy pins only shared-lane channel evidence; 026 object boundary kept',
         position('''hidden'') <> ''title''' in s.body) > 0
         and position('p.distribution = ''channels''' in s.body) > 0
         and position('not exists (select 1 from public.case_evidence_channels ec where ec.evidence_id = v_eid)' in s.body) > 0
         and position('public._object_state_row_visible(p_session, v_code)' in s.body) > 0
         and position('sos.discovered and sos.is_shared' in s.body) > 0, null
  from src s where s.name = '_board_material_team_visible'
  union all
  select 18, 'B8 027 node authorization unchanged — it consumes evidence_index.readable',
         position('from public.evidence_index(p_session) e' in s.body) > 0 and position('e.readable' in s.body) > 0, null
  from src s where s.name = '_connection_node_known'
  union all
  select 19, 'B9 033 joint contribution still vouched by the contributor''s readability',
         position('public._connection_node_known(v_p.session_id, v_kind, v_id)' in s.body) > 0, null
  from src s where s.name = 'contribute_to_joint'
  union all
  select 20, 'B10 unlock_evidence still answers WRONG_SPECIALIZATION (027 pending settlement)',
         position('''WRONG_SPECIALIZATION''' in s.body) > 0, null
  from src s where s.name = 'unlock_evidence'
  union all
  select 21, 'B11 trigger: channels assigned on lobby → active (server-only)',
         exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.sessions'::regclass and t.tgname = 'sessions_assign_channels_on_start'
                   and t.tgenabled = 'O' and not t.tgisinternal
                   and t.tgfoid = 'public._sessions_assign_channels_on_start'::regproc), null
  union all
  select 22, 'B12 assignment: channel cases only, fails closed without a seat plan',
         position('p.distribution = ''channels''' in s.body) > 0 and position('''CHANNEL_PLAN_MISSING''' in s.body) > 0, null
  from src s where s.name = '_assign_session_channels'
  union all
  select 23, 'B13 my_channels returns only the caller''s own channels',
         position('m.session_id = p_session and m.user_id = auth.uid()' in s.body) > 0, null
  from src s where s.name = 'my_channels'
  -- R — realtime
  union all
  select 24, 'R1 session_evidence still published (now RLS-filtered per subscriber)',
         exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_evidence'), null
  union all
  select 24, 'R2 channel tables are NOT published',
         not exists (select 1 from pg_publication_tables p join chan_tables t on t.name = p.tablename
                     where p.pubname = 'supabase_realtime' and p.schemaname = 'public'), null
  -- S — nothing seeded
  union all
  select 25, 'S1 channel tables are empty (no Scene 17 catalogue / seats / mapping / assignment)',
         (select count(*) from public.case_channels) + (select count(*) from public.case_channel_seats)
         + (select count(*) from public.case_evidence_channels) + (select count(*) from public.session_member_channels) = 0, null
  union all
  select 25, 'S2 no approved connection rule (032 not applied)',
         not exists (select 1 from public.case_connection_rules where status = 'approved'), null
  union all
  select 25, 'S3 rule rows are none, or only the known 032 drafts',
         not exists (select 1 from public.case_connection_rules r
                     where not (r.case_id = 'room-714' and r.status = 'draft'
                                and r.rule_id in ('R714_NO_VICTIM_BLOOD', 'R714_N17_PAYMENTS', 'R714_COPY_AFTER_MESSAGE'))),
         (select count(*)::text from public.case_connection_rules) || ' rule rows'
  -- K — case content unchanged
  union all
  select 26, 'K1 room-714 evidence = 34', (select count(*) from public.evidence where case_id = 'room-714') = 34, null
  union all
  select 26, 'K2 room-714 investigation_objects = 10', (select count(*) from public.investigation_objects where case_id = 'room-714') = 10, null
  union all
  select 26, 'K3 room-714 investigation_challenges = 3', (select count(*) from public.investigation_challenges where case_id = 'room-714') = 3, null
  union all
  select 26, 'K4 scene-17 has no evidence / objects / challenges',
         (select count(*) from public.evidence where case_id = 'scene-17')
         + (select count(*) from public.investigation_objects where case_id = 'scene-17')
         + (select count(*) from public.investigation_challenges where case_id = 'scene-17') = 0, null
  union all
  select 26, 'K5 catalogue unchanged (028 not applied: both cases published)',
         (select count(*) from public.cases where id in ('room-714', 'scene-17') and is_published) = 2, null
  -- V — 031 / 033 / 034 intact
  union all
  select 27, 'V1 031 board tables: authenticated SELECT only, no client writes',
         not exists (select 1 from board_tables t cross join client_roles r
                     where has_table_privilege(r.name, 'public.' || t.name, 'INSERT')
                        or has_table_privilege(r.name, 'public.' || t.name, 'UPDATE')
                        or has_table_privilege(r.name, 'public.' || t.name, 'DELETE'))
         and not exists (select 1 from board_tables t where not has_table_privilege('authenticated', 'public.' || t.name, 'SELECT')), null
  union all
  select 27, 'V2 031 test_board_selection still validates through propose_connection',
         exists (select 1 from src s where s.name = 'test_board_selection'
                   and position('public.propose_connection(p_session, v_nodes, null)' in s.body) > 0), null
  union all
  select 27, 'V3 033 matcher unchanged: this case only, approved AND team_safe',
         exists (select 1 from src s where s.name = '_connection_match'
                   and position('where r.case_id = p_case and r.status = ''approved'' and r.team_safe' in s.body) > 0), null
  union all
  select 28, 'V4 034 legacy lock intact — no client writes/truncate: ' || l.name,
         not exists (select 1 from client_roles r
                     where has_table_privilege(r.name, 'public.' || l.name, 'INSERT')
                        or has_table_privilege(r.name, 'public.' || l.name, 'UPDATE')
                        or has_table_privilege(r.name, 'public.' || l.name, 'DELETE')
                        or has_table_privilege(r.name, 'public.' || l.name, 'TRUNCATE')), null
  from legacy l
  -- INFO
  union all
  select 29, 'I1 session_evidence rows (live play)', null::boolean, (select count(*)::text from public.session_evidence)
  union all
  select 30, 'I2 sessions per case (room-714 / scene-17)', null::boolean,
         (select count(*)::text from public.sessions where case_id = 'room-714') || ' / '
         || (select count(*)::text from public.sessions where case_id = 'scene-17')
) checks
order by ord, check_name;
