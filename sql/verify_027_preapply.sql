-- ============================================================
-- IFADA 027 — PRE-APPLY CHECKS (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor as the role that will apply 027.
-- Every row must show pass = true. If ANY row is false: STOP, do not apply.
-- ============================================================
with
dep_funcs(name) as (values ('is_session_member'), ('evidence_index'), ('unlock_evidence'),
                           ('check_milestones'), ('_object_state_row_visible')),
read_tables(name) as (values ('sessions'), ('session_members'), ('session_evidence'),
                             ('evidence'), ('session_object_state'), ('investigation_objects')),
new_tables(name) as (values ('case_connection_rules'), ('case_connection_conditions'),
                            ('session_connection_attempts'), ('session_validated_connections'),
                            ('session_connection_effects')),
new_funcs(name) as (values ('_connection_node_known'), ('_apply_connection_effects'),
                           ('propose_connection'), ('settle_connection_effects'),
                           ('session_connection_state')),
-- Real client roles only. PUBLIC (a pseudo-role, not a pg_roles row) is
-- checked separately through the schema ACL itself (grantee = 0).
client_roles(name) as (values ('anon'), ('authenticated'))
select check_name, pass, detail from (
  -- P1 — dependencies live (026 privacy model + evidence engine), names free
  select 1 as ord, 'P1a dependency exists: ' || d.name as check_name,
         exists (select 1 from pg_proc p
                 where p.pronamespace = 'public'::regnamespace and p.proname = d.name) as pass,
         null::text as detail
  from dep_funcs d
  union all
  select 2, 'P1b 026 policy live (session_object_state_select uses _object_state_row_visible)',
         exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'session_object_state'
                   and policyname = 'session_object_state_select'
                   and qual like '%_object_state_row_visible%'),
         null
  union all
  select 3, 'P1c evidence_index(p_session uuid) returns a readable column',
         exists (select 1 from pg_proc p
                 where p.pronamespace = 'public'::regnamespace and p.proname = 'evidence_index'
                   and pg_get_function_identity_arguments(p.oid) = 'p_session uuid'
                   and pg_get_function_result(p.oid) like '%readable boolean%'),
         null
  union all
  select 4, 'P1d unlock_evidence(p_session uuid, p_code text) signature',
         exists (select 1 from pg_proc p
                 where p.pronamespace = 'public'::regnamespace and p.proname = 'unlock_evidence'
                   and pg_get_function_identity_arguments(p.oid) = 'p_session uuid, p_code text'),
         null
  union all
  select 5, 'P1e new table does not exist yet: ' || t.name,
         to_regclass('public.' || t.name) is null, null
  from new_tables t
  union all
  select 6, 'P1f new function name unused: ' || f.name,
         not exists (select 1 from pg_proc p
                     where p.pronamespace = 'public'::regnamespace and p.proname = f.name),
         null
  from new_funcs f
  -- P2 — SECURITY DEFINER assumptions: owner bypasses RLS on what 027 reads
  union all
  select 7, 'P2a read table owned by current_user: ' || t.name,
         coalesce(pg_get_userbyid(c.relowner) = current_user, false),
         'owner = ' || coalesce(pg_get_userbyid(c.relowner)::text, 'MISSING')
  from read_tables t
  left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.name
  union all
  select 8, 'P2b FORCE RLS off: ' || t.name,
         coalesce(not c.relforcerowsecurity, false),
         'rls_enabled = ' || coalesce(c.relrowsecurity::text, 'MISSING')
  from read_tables t
  left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = t.name
  union all
  select 9, 'P2c no CREATE on schema public for role: ' || r.name,
         not has_schema_privilege(r.name, 'public', 'CREATE'), null
  from client_roles r
  union all
  -- PUBLIC via ACL: grantee 0 = PUBLIC; a NULL ACL means the type default (acldefault).
  select 9, 'P2c no CREATE on schema public for PUBLIC (pseudo-role, via ACL)',
         not exists (select 1
                     from pg_namespace n,
                          aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
                     where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'CREATE'),
         null
  union all
  select 10, 'P2d current_user can create in schema public',
         has_schema_privilege(current_user, 'public', 'CREATE'),
         'current_user = ' || current_user
) checks
order by ord, check_name;
