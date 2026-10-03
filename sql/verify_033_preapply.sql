-- ============================================================
-- IFADA 033 — PRE-APPLY CHECKS (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor as the role that will apply 033.
-- Every row with a non-null pass must show pass = true. If ANY is false:
-- STOP, do not apply. Rows with pass = null are INFO (live-play counters).
--
-- P1 — 026 / 027 / 031 / 034 are live with the exact signatures 033 calls,
--      and the live propose_connection is still 027's own body.
-- P2 — nothing 033 creates exists yet.
-- P3 — SECURITY DEFINER assumptions (owner, FORCE RLS off, ownership of the
--      function 033 replaces) and schema privileges.
-- P4 — rule data compatible with the new approved ⇒ team_safe constraint.
-- ============================================================
with
dep_funcs(name, args) as (values
  ('is_session_member',            'p_session uuid'),
  ('_object_state_row_visible',    'p_session uuid, p_object_code text'),
  ('evidence_index',               'p_session uuid'),
  ('check_milestones',             'p_session uuid'),
  ('_connection_node_known',       'p_session uuid, p_kind text, p_id text'),
  ('_apply_connection_effects',    'p_session uuid, p_effects jsonb'),
  ('propose_connection',           'p_session uuid, p_nodes jsonb, p_relation text'),
  ('settle_connection_effects',    'p_session uuid'),
  ('session_connection_state',     'p_session uuid'),
  ('_board_material_team_visible', 'p_session uuid, p_kind text, p_code text'),
  ('test_board_selection',         'p_session uuid, p_items uuid[]')),
t027(name) as (values ('case_connection_rules'), ('case_connection_conditions'), ('session_connection_attempts'),
                      ('session_validated_connections'), ('session_connection_effects')),
t031(name) as (values ('case_engine_policy'), ('board_items'), ('board_threads'), ('board_validations')),
legacy(name) as (values ('board_notes'), ('board_links')),
new_tables(name) as (values ('session_joint_proposals'), ('session_joint_contributions')),
new_funcs(name) as (values ('_connection_throttled'), ('_connection_match'), ('open_joint_proposal'),
                           ('contribute_to_joint'), ('withdraw_joint_contribution'), ('close_joint_proposal'),
                           ('test_joint_proposal'), ('joint_proposals')),
-- Tables the 033 SECURITY DEFINER functions read or write directly.
definer_tables(name) as (values ('case_connection_rules'), ('case_connection_conditions'),
                                ('session_connection_attempts'), ('session_validated_connections'),
                                ('session_connection_effects'), ('sessions'), ('session_members')),
-- Real client roles only; PUBLIC is checked through ACLs (grantee 0).
client_roles(name) as (values ('anon'), ('authenticated'))
select check_name, pass, detail from (
  -- P1 — dependencies live
  select 1 as ord, 'P1a dependency live: ' || d.name || '(' || d.args || ')' as check_name,
         exists (select 1 from pg_proc p
                 where p.pronamespace = 'public'::regnamespace and p.proname = d.name
                   and pg_get_function_identity_arguments(p.oid) = d.args) as pass,
         null::text as detail
  from dep_funcs d
  union all
  select 2, 'P1b 027 table live: ' || t.name, to_regclass('public.' || t.name) is not null, null
  from t027 t
  union all
  select 3, 'P1c 031 table live: ' || t.name, to_regclass('public.' || t.name) is not null, null
  from t031 t
  union all
  select 4, 'P1d 034 lock live — no client writes: ' || l.name,
         to_regclass('public.' || l.name) is not null
         and not exists (select 1 from client_roles r
                         where has_table_privilege(r.name, 'public.' || l.name, 'INSERT')
                            or has_table_privilege(r.name, 'public.' || l.name, 'UPDATE')
                            or has_table_privilege(r.name, 'public.' || l.name, 'DELETE')), null
  from legacy l
  union all
  select 5, 'P1e live propose_connection is still the 027 body (inline throttle, approved-only matcher)',
         exists (select 1 from pg_proc p
                 where p.pronamespace = 'public'::regnamespace and p.proname = 'propose_connection'
                   and position('c_player_per_min constant integer := 6' in p.prosrc) > 0
                   and position('r.status = ''approved''' in p.prosrc) > 0
                   and position('_connection_match' in p.prosrc) = 0), null
  union all
  select 6, 'P1f realtime publication supabase_realtime exists',
         exists (select 1 from pg_publication where pubname = 'supabase_realtime'), null
  -- P2 — 033 objects absent
  union all
  select 7, 'P2a column case_connection_rules.team_safe does not exist yet',
         not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'case_connection_rules' and column_name = 'team_safe'), null
  union all
  select 8, 'P2b constraint case_connection_rules_approved_team_safe does not exist yet',
         not exists (select 1 from pg_constraint where conname = 'case_connection_rules_approved_team_safe'), null
  union all
  select 9, 'P2c new table does not exist yet: ' || t.name, to_regclass('public.' || t.name) is null, null
  from new_tables t
  union all
  select 10, 'P2d new function name unused: ' || f.name,
         not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f.name), null
  from new_funcs f
  -- P3 — definer assumptions + privileges
  union all
  select 11, 'P3a table owned by current_user: ' || t.name,
         coalesce(pg_get_userbyid(c.relowner) = current_user, false),
         'owner = ' || coalesce(pg_get_userbyid(c.relowner)::text, 'MISSING')
  from definer_tables t
  left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.name
  union all
  select 12, 'P3b FORCE RLS off: ' || t.name, coalesce(not c.relforcerowsecurity, false),
         'rls_enabled = ' || coalesce(c.relrowsecurity::text, 'MISSING')
  from definer_tables t
  left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.name
  union all
  select 13, 'P3c current_user owns propose_connection (033 replaces it in place)',
         coalesce((select bool_and(pg_get_userbyid(p.proowner) = current_user) from pg_proc p
                   where p.pronamespace = 'public'::regnamespace and p.proname = 'propose_connection'), false),
         (select string_agg(pg_get_userbyid(p.proowner)::text, ', ') from pg_proc p
          where p.pronamespace = 'public'::regnamespace and p.proname = 'propose_connection')
  union all
  select 14, 'P3d no CREATE on schema public for role: ' || r.name,
         not has_schema_privilege(r.name, 'public', 'CREATE'), null
  from client_roles r
  union all
  select 14, 'P3d no CREATE on schema public for PUBLIC (pseudo-role, via ACL)',
         not exists (select 1 from pg_namespace n,
                          aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
                     where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'CREATE'), null
  union all
  select 15, 'P3e current_user can create in schema public',
         has_schema_privilege(current_user, 'public', 'CREATE'), 'current_user = ' || current_user
  union all
  select 16, 'P3f clients still cannot read 027 rule truth: case_connection_rules',
         not has_table_privilege('authenticated', 'public.case_connection_rules', 'SELECT')
         and not has_table_privilege('anon', 'public.case_connection_rules', 'SELECT'), null
  -- P4 — rule data compatible with "approved ⇒ team_safe"
  union all
  select 17, 'P4a no approved rule exists (the new constraint would reject it)',
         not exists (select 1 from public.case_connection_rules where status = 'approved'), null
  union all
  select 18, 'P4b rule rows are none, or only the known 032 drafts',
         not exists (select 1 from public.case_connection_rules r
                     where not (r.case_id = 'room-714' and r.status = 'draft'
                                and r.rule_id in ('R714_NO_VICTIM_BLOOD', 'R714_N17_PAYMENTS', 'R714_COPY_AFTER_MESSAGE'))),
         (select count(*)::text from public.case_connection_rules) || ' rule rows'
  -- INFO — live-play counters
  union all
  select 19, 'I1 connection attempts (live play)', null::boolean,
         (select count(*)::text from public.session_connection_attempts)
  union all
  select 20, 'I2 validated connections (live play)', null::boolean,
         (select count(*)::text from public.session_validated_connections)
) checks
order by ord, check_name;
