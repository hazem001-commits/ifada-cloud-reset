-- ============================================================
-- IFADA 031 — PRE-APPLY CHECKS (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor as the role that will apply 031.
-- Every row must show pass = true. If ANY row is false: STOP, do not apply.
-- ============================================================
with
dep_funcs(name, args) as (values
  ('is_session_member',          'p_session uuid'),
  ('_object_state_row_visible',  'p_session uuid, p_object_code text'),
  ('propose_connection',         'p_session uuid, p_nodes jsonb, p_relation text'),
  ('_connection_node_known',     'p_session uuid, p_kind text, p_id text')),
read_tables(name) as (values ('cases'), ('sessions'), ('session_members'), ('session_evidence'),
                             ('evidence'), ('investigation_objects'), ('session_object_state')),
new_tables(name) as (values ('case_engine_policy'), ('board_items'), ('board_threads'), ('board_validations')),
new_funcs(name) as (values ('_board_material_team_visible'), ('pin_board_material'), ('add_board_reasoning'),
                           ('move_board_item'), ('edit_board_reasoning'), ('remove_board_item'),
                           ('link_board_items'), ('unlink_board_thread'), ('test_board_selection')),
-- Real client roles only; PUBLIC is checked through the schema ACL (grantee 0).
client_roles(name) as (values ('anon'), ('authenticated'))
select check_name, pass, detail from (
  -- P1 — 026 + 027 are live with the exact signatures 031 calls
  select 1 as ord, 'P1a dependency live: ' || d.name || '(' || d.args || ')' as check_name,
         exists (select 1 from pg_proc p
                 where p.pronamespace = 'public'::regnamespace and p.proname = d.name
                   and pg_get_function_identity_arguments(p.oid) = d.args) as pass,
         null::text as detail
  from dep_funcs d
  union all
  select 2, 'P1b 027 tables live (rules + attempts)',
         to_regclass('public.case_connection_rules') is not null
         and to_regclass('public.session_connection_attempts') is not null, null
  union all
  select 3, 'P1c room-714 case row exists (engine policy row target)',
         exists (select 1 from public.cases where id = 'room-714'), null
  union all
  select 4, 'P1d new table does not exist yet: ' || t.name, to_regclass('public.' || t.name) is null, null
  from new_tables t
  union all
  select 5, 'P1e new function name unused: ' || f.name,
         not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f.name), null
  from new_funcs f
  union all
  select 6, 'P1f realtime publication supabase_realtime exists',
         exists (select 1 from pg_publication where pubname = 'supabase_realtime'), null
  -- P2 — SECURITY DEFINER assumptions: the owner bypasses RLS on what 031 reads
  union all
  select 7, 'P2a read table owned by current_user: ' || t.name,
         coalesce(pg_get_userbyid(c.relowner) = current_user, false),
         'owner = ' || coalesce(pg_get_userbyid(c.relowner)::text, 'MISSING')
  from read_tables t
  left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.name
  union all
  select 8, 'P2b FORCE RLS off: ' || t.name, coalesce(not c.relforcerowsecurity, false),
         'rls_enabled = ' || coalesce(c.relrowsecurity::text, 'MISSING')
  from read_tables t
  left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.name
  union all
  select 9, 'P2c no CREATE on schema public for role: ' || r.name,
         not has_schema_privilege(r.name, 'public', 'CREATE'), null
  from client_roles r
  union all
  select 9, 'P2c no CREATE on schema public for PUBLIC (pseudo-role, via ACL)',
         not exists (select 1 from pg_namespace n,
                          aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
                     where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'CREATE'), null
  union all
  select 10, 'P2d current_user can create in schema public',
         has_schema_privilege(current_user, 'public', 'CREATE'), 'current_user = ' || current_user
) checks
order by ord, check_name;
