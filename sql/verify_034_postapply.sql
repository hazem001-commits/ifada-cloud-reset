-- ============================================================
-- IFADA 034 — POST-APPLY VERIFICATION (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor right after applying 034.
-- Every row with a non-null pass must show pass = true.
-- Rows with pass = null are INFO.
--
-- L — legacy board tables are read-only history for members, nothing more.
-- V — 031 Board V2 is untouched and still the working board.
-- U — nothing unrelated changed.
-- ============================================================
with
legacy(name, select_policy) as (values ('board_notes', 'board_notes_select'), ('board_links', 'board_links_select')),
board_tables(name) as (values ('board_items'), ('board_threads'), ('board_validations')),
rpcs(name) as (values ('pin_board_material'), ('add_board_reasoning'), ('move_board_item'), ('edit_board_reasoning'),
                      ('remove_board_item'), ('link_board_items'), ('unlink_board_thread'), ('test_board_selection')),
-- Real client roles only. PUBLIC is checked through object ACLs (grantee 0).
client_roles(name) as (values ('anon'), ('authenticated'))
select check_name, pass, detail from (
  -- L — legacy locked
  select 1 as ord, 'L1 no INSERT/UPDATE/DELETE/TRUNCATE for ' || r.name || ': ' || l.name as check_name,
         not (has_table_privilege(r.name, 'public.' || l.name, 'INSERT')
           or has_table_privilege(r.name, 'public.' || l.name, 'UPDATE')
           or has_table_privilege(r.name, 'public.' || l.name, 'DELETE')
           or has_table_privilege(r.name, 'public.' || l.name, 'TRUNCATE')) as pass,
         null::text as detail
  from legacy l cross join client_roles r
  union all
  select 2, 'L2 anon cannot read: ' || l.name, not has_table_privilege('anon', 'public.' || l.name, 'SELECT'), null
  from legacy l
  union all
  select 3, 'L3 authenticated keeps SELECT (member history stays readable): ' || l.name,
         has_table_privilege('authenticated', 'public.' || l.name, 'SELECT'), null
  from legacy l
  union all
  select 4, 'L4 no privileges for PUBLIC (pseudo-role, via ACL): ' || l.name,
         not exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                     where c.relnamespace = 'public'::regnamespace and c.relname = l.name and a.grantee = 0), null
  from legacy l
  union all
  select 5, 'L5 only the member SELECT policy remains: ' || l.name,
         (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = l.name) = 1
         and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = l.name
                       and p.policyname = l.select_policy and p.cmd = 'SELECT'
                       and p.qual like '%is_session_member(session_id)%'),
         (select string_agg(p.policyname::text, ', ') from pg_policies p where p.schemaname = 'public' and p.tablename = l.name)
  from legacy l
  union all
  select 6, 'L6 RLS still enabled: ' || l.name,
         coalesce((select c.relrowsecurity from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = l.name), false), null
  from legacy l
  -- V — 031 untouched
  union all
  select 7, 'V1 031 board table: authenticated SELECT only, no client writes: ' || t.name,
         has_table_privilege('authenticated', 'public.' || t.name, 'SELECT')
         and not exists (select 1 from client_roles r
                         where has_table_privilege(r.name, 'public.' || t.name, 'INSERT')
                            or has_table_privilege(r.name, 'public.' || t.name, 'UPDATE')
                            or has_table_privilege(r.name, 'public.' || t.name, 'DELETE')), null
  from board_tables t
  union all
  select 8, 'V2 031 board table keeps exactly its one member SELECT policy: ' || t.name,
         (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.name) = 1
         and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.name
                       and p.cmd = 'SELECT' and p.qual like '%is_session_member(session_id)%'), null
  from board_tables t
  union all
  select 9, 'V3 authenticated can still EXECUTE 031 RPC: ' || f.name,
         coalesce((select bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) from pg_proc p
                   where p.pronamespace = 'public'::regnamespace and p.proname = f.name), false), null
  from rpcs f
  union all
  select 10, 'V4 realtime still publishes: ' || t.name,
         exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t.name), null
  from board_tables t
  -- U — unrelated state unchanged
  union all
  select 11, 'U1 realtime publication unchanged for legacy table (verify_live_state expects it): ' || l.name,
         exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = l.name), null
  from legacy l
  union all
  select 12, 'U2 session_evidence member SELECT policy untouched',
         exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'session_evidence'
                   and p.policyname = 'session_evidence_select'), null
  union all
  select 13, 'I1 legacy rows preserved (expected 18 notes / 5 links — nothing deleted)', null::boolean,
         (select count(*)::text from public.board_notes) || ' notes / ' || (select count(*)::text from public.board_links) || ' links'
) checks
order by ord, check_name;
