-- ============================================================
-- IFADA 035 — PRE-APPLY CHECKS (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor as the role that will apply 035.
-- Every row with a non-null pass must show pass = true. If ANY is false:
-- STOP, do not apply. Rows with pass = null are INFO (live-play counters).
--
-- P1 — dependencies live with the exact signatures 035 calls or replaces.
-- P2 — the functions/policy 035 replaces are still in their pre-035 shape.
-- P3 — nothing from 035 / 029 / 030 exists yet.
-- P4 — content baseline: Room 714 intact, Scene 17 empty, 034 lock intact,
--      engine policy exactly room-714 = title.
-- P5 — SECURITY DEFINER assumptions + ability to apply.
-- ============================================================
with
dep_funcs(name, args) as (values
  ('is_session_member',            'p_session uuid'),
  ('has_specialization',           'p_session uuid, p_specialization specialization'),
  ('_object_state_row_visible',    'p_session uuid, p_object_code text'),
  ('_object_ancestors_known',      'p_session uuid, p_case text, p_object_code text'),
  ('case_clock',                   'p_session uuid'),
  ('_connection_node_known',       'p_session uuid, p_kind text, p_id text'),
  ('propose_connection',           'p_session uuid, p_nodes jsonb, p_relation text'),
  ('test_board_selection',         'p_session uuid, p_items uuid[]'),
  ('contribute_to_joint',          'p_proposal uuid, p_kind text, p_id text'),
  ('joint_proposals',              'p_session uuid'),
  ('evidence_index',               'p_session uuid'),
  ('unlockable_evidence',          'p_session uuid'),
  ('unlock_evidence',              'p_session uuid, p_code text'),
  ('expiring_evidence',            'p_session uuid'),
  ('evidence_provenance',          'p_session uuid'),
  ('_board_material_team_visible', 'p_session uuid, p_kind text, p_code text')),
replaced(name) as (values ('evidence_index'), ('unlockable_evidence'), ('unlock_evidence'), ('expiring_evidence'),
                          ('evidence_provenance'), ('_board_material_team_visible')),
absent_tables(name) as (values
  ('case_channels'), ('case_channel_seats'), ('case_evidence_channels'), ('session_member_channels'),  -- 035
  ('case_channel_plans'), ('evidence_channels'),                                                       -- 029
  ('case_entities'), ('case_entity_descriptors'), ('session_entity_handles')),                         -- 030
new_funcs(name) as (values ('_evidence_readable'), ('_evidence_row_visible'), ('_assign_session_channels'),
                           ('_sessions_assign_channels_on_start'), ('my_channels')),
definer_tables(name) as (values ('sessions'), ('session_members'), ('session_member_specializations'), ('evidence'),
                                ('session_evidence'), ('case_engine_policy'), ('investigation_objects'),
                                ('session_object_state'), ('session_evidence_sources')),
legacy(name) as (values ('board_notes'), ('board_links')),
client_roles(name) as (values ('anon'), ('authenticated')),
src(name, body) as (select p.proname, p.prosrc from pg_proc p
                    where p.pronamespace = 'public'::regnamespace
                      and p.proname in ('evidence_index', 'unlockable_evidence', 'unlock_evidence', 'expiring_evidence',
                                        'evidence_provenance', '_board_material_team_visible', '_connection_node_known'))
select check_name, pass, detail from (
  -- P1 — dependencies
  select 1 as ord, 'P1 dependency live: ' || d.name || '(' || d.args || ')' as check_name,
         exists (select 1 from pg_proc p
                 where p.pronamespace = 'public'::regnamespace and p.proname = d.name
                   and pg_get_function_identity_arguments(p.oid) = d.args) as pass,
         null::text as detail
  from dep_funcs d
  -- P2 — pre-035 shapes
  union all
  select 2, 'P2a pre-035 readability (specialization) in: ' || s.name,
         position('public.has_specialization(' in s.body) > 0 and position('_evidence_readable' in s.body) = 0, null
  from src s where s.name in ('evidence_index', 'unlockable_evidence', 'unlock_evidence', 'expiring_evidence')
  union all
  select 3, 'P2b _connection_node_known reads evidence_index.readable (027)',
         exists (select 1 from src s where s.name = '_connection_node_known'
                   and position('from public.evidence_index(p_session) e' in s.body) > 0
                   and position('e.readable' in s.body) > 0), null
  union all
  select 4, 'P2c _board_material_team_visible is the 031 body (title policy; no channel branch)',
         exists (select 1 from src s where s.name = '_board_material_team_visible'
                   and position('''hidden'') <> ''title''' in s.body) > 0
                   and position('case_evidence_channels' in s.body) = 0), null
  union all
  select 5, 'P2d evidence_provenance is the 026 body (no evidence-visibility clause yet)',
         exists (select 1 from src s where s.name = 'evidence_provenance'
                   and position('_object_ancestors_known' in s.body) > 0
                   and position('_evidence_row_visible' in s.body) = 0), null
  union all
  select 6, 'P2e session_evidence has exactly the 004 member SELECT policy',
         (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'session_evidence') = 1
         and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'session_evidence'
                       and p.policyname = 'session_evidence_select' and p.cmd = 'SELECT'
                       and p.qual like '%is_session_member(session_id)%' and p.qual not like '%_evidence_row_visible%'), null
  -- P3 — absent
  union all
  select 7, 'P3a table does not exist yet (035 / 029 / 030): ' || t.name, to_regclass('public.' || t.name) is null, null
  from absent_tables t
  union all
  select 8, 'P3b new function name unused: ' || f.name,
         not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f.name), null
  from new_funcs f
  union all
  select 9, 'P3c case_engine_policy.distribution column does not exist yet',
         not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'case_engine_policy' and column_name = 'distribution'), null
  union all
  select 9, 'P3d trigger sessions_assign_channels_on_start does not exist yet',
         not exists (select 1 from pg_trigger where tgname = 'sessions_assign_channels_on_start'), null
  -- P4 — content baseline
  union all
  select 10, 'P4a room-714 evidence = 34', (select count(*) from public.evidence where case_id = 'room-714') = 34, null
  union all
  select 10, 'P4b room-714 investigation_objects = 10', (select count(*) from public.investigation_objects where case_id = 'room-714') = 10, null
  union all
  select 10, 'P4c room-714 investigation_challenges = 3', (select count(*) from public.investigation_challenges where case_id = 'room-714') = 3, null
  union all
  select 11, 'P4d scene-17 has no evidence / objects / challenges',
         (select count(*) from public.evidence where case_id = 'scene-17')
         + (select count(*) from public.investigation_objects where case_id = 'scene-17')
         + (select count(*) from public.investigation_challenges where case_id = 'scene-17') = 0, null
  union all
  select 12, 'P4e engine policy: exactly room-714 = title',
         (select count(*) from public.case_engine_policy) = 1
         and exists (select 1 from public.case_engine_policy where case_id = 'room-714' and restricted_evidence = 'title'), null
  union all
  select 13, 'P4f 034 legacy lock intact — no client writes: ' || l.name,
         not exists (select 1 from client_roles r
                     where has_table_privilege(r.name, 'public.' || l.name, 'INSERT')
                        or has_table_privilege(r.name, 'public.' || l.name, 'UPDATE')
                        or has_table_privilege(r.name, 'public.' || l.name, 'DELETE')
                        or has_table_privilege(r.name, 'public.' || l.name, 'TRUNCATE')), null
  from legacy l
  -- P5 — definer assumptions + ability to apply
  union all
  select 14, 'P5a table owned by current_user: ' || t.name,
         coalesce(pg_get_userbyid(c.relowner) = current_user, false),
         'owner = ' || coalesce(pg_get_userbyid(c.relowner)::text, 'MISSING')
  from definer_tables t
  left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.name
  union all
  select 15, 'P5b FORCE RLS off: ' || t.name, coalesce(not c.relforcerowsecurity, false),
         'rls_enabled = ' || coalesce(c.relrowsecurity::text, 'MISSING')
  from definer_tables t
  left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.name
  union all
  select 16, 'P5c current_user owns the function 035 replaces: ' || r.name,
         coalesce((select bool_and(pg_get_userbyid(p.proowner) = current_user) from pg_proc p
                   where p.pronamespace = 'public'::regnamespace and p.proname = r.name), false), null
  from replaced r
  union all
  select 17, 'P5d no CREATE on schema public for role: ' || r.name,
         not has_schema_privilege(r.name, 'public', 'CREATE'), null
  from client_roles r
  union all
  select 17, 'P5d no CREATE on schema public for PUBLIC (pseudo-role, via ACL)',
         not exists (select 1 from pg_namespace n,
                          aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
                     where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'CREATE'), null
  union all
  select 18, 'P5e current_user can create in schema public',
         has_schema_privilege(current_user, 'public', 'CREATE'), 'current_user = ' || current_user
  -- INFO — live-play counters
  union all
  select 19, 'I1 sessions per case (room-714 / scene-17)', null::boolean,
         (select count(*)::text from public.sessions where case_id = 'room-714') || ' / '
         || (select count(*)::text from public.sessions where case_id = 'scene-17')
  union all
  select 20, 'I2 session_evidence rows (live play)', null::boolean,
         (select count(*)::text from public.session_evidence)
) checks
order by ord, check_name;
