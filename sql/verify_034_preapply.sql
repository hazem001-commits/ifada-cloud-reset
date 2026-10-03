-- ============================================================
-- IFADA 034 — PRE-APPLY CHECKS (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor as the role that will apply 034.
-- Every row with a non-null pass must show pass = true. If ANY is false:
-- STOP, do not apply. Rows with pass = null are INFO.
--
-- P1 — 031 Board V2 is live and complete (the app's only board store).
-- P2 — the legacy tables are exactly what 034 expects to lock.
-- P3 — nothing still depends on legacy writes: no server function or view
--      touches them, and no client has written them since the Board V2
--      switch baseline (18 notes / 5 links, newest row 2026-10-01 02:43:43
--      UTC). A false P3c means a stale client still writes legacy rows —
--      find it before locking.
-- ============================================================
with
v2_tables(name) as (values ('case_engine_policy'), ('board_items'), ('board_threads'), ('board_validations')),
v2_funcs(name) as (values ('_board_material_team_visible'), ('pin_board_material'), ('add_board_reasoning'),
                          ('move_board_item'), ('edit_board_reasoning'), ('remove_board_item'),
                          ('link_board_items'), ('unlink_board_thread'), ('test_board_selection')),
board_tables(name) as (values ('board_items'), ('board_threads'), ('board_validations')),
legacy(name, known_policies) as (values
  ('board_notes', array['board_notes_delete', 'board_notes_insert', 'board_notes_select', 'board_notes_update']),
  ('board_links', array['board_links_delete', 'board_links_insert', 'board_links_select']))
select check_name, pass, detail from (
  -- P1 — 031 live
  select 1 as ord, 'P1a 031 table exists: ' || t.name as check_name,
         to_regclass('public.' || t.name) is not null as pass, null::text as detail
  from v2_tables t
  union all
  select 2, 'P1b 031 function exists exactly once: ' || f.name,
         (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f.name) = 1, null
  from v2_funcs f
  union all
  select 3, 'P1c realtime publishes 031 board table: ' || t.name,
         exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t.name), null
  from board_tables t
  union all
  select 4, 'P1d engine policy: room-714 = title',
         exists (select 1 from public.case_engine_policy where case_id = 'room-714' and restricted_evidence = 'title'), null
  -- P2 — legacy tables as 034 expects
  union all
  select 5, 'P2a legacy table exists with RLS enabled: ' || l.name,
         coalesce((select c.relrowsecurity from pg_class c
                   where c.relnamespace = 'public'::regnamespace and c.relname = l.name), false), null
  from legacy l
  union all
  select 6, 'P2b legacy table owned by current_user: ' || l.name,
         coalesce((select pg_get_userbyid(c.relowner) = current_user from pg_class c
                   where c.relnamespace = 'public'::regnamespace and c.relname = l.name), false),
         'owner = ' || coalesce((select pg_get_userbyid(c.relowner)::text from pg_class c
                                 where c.relnamespace = 'public'::regnamespace and c.relname = l.name), 'MISSING')
  from legacy l
  union all
  select 7, 'P2c legacy policies are exactly the known 004 set: ' || l.name,
         coalesce((select array_agg(p.policyname::text order by p.policyname) from pg_policies p
                   where p.schemaname = 'public' and p.tablename = l.name), '{}') = l.known_policies,
         (select string_agg(p.policyname::text, ', ' order by p.policyname) from pg_policies p
          where p.schemaname = 'public' and p.tablename = l.name)
  from legacy l
  union all
  select 8, 'P2d authenticated holds a DIRECT SELECT grant (reads survive 034): ' || l.name,
         exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                 where c.relnamespace = 'public'::regnamespace and c.relname = l.name
                   and a.grantee = 'authenticated'::regrole and a.privilege_type = 'SELECT'), null
  from legacy l
  -- P3 — nothing depends on legacy writes
  union all
  select 9, 'P3a no function in public references a legacy board table',
         not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                       and (p.prosrc ilike '%board_notes%' or p.prosrc ilike '%board_links%')),
         (select string_agg(p.proname::text, ', ') from pg_proc p where p.pronamespace = 'public'::regnamespace
            and (p.prosrc ilike '%board_notes%' or p.prosrc ilike '%board_links%'))
  union all
  select 10, 'P3b no view references a legacy board table',
         not exists (select 1 from pg_views v where v.definition ilike '%board_notes%' or v.definition ilike '%board_links%'), null
  union all
  select 11, 'P3c no legacy writes since the Board V2 switch baseline (18 notes / 5 links, newest 2026-10-01 02:43:43 UTC)',
         (select count(*) from public.board_notes) = 18
         and (select count(*) from public.board_links) = 5
         and coalesce((select max(created_at) from public.board_notes), 'epoch') <= timestamptz '2026-10-01 02:43:44+00'
         and coalesce((select max(created_at) from public.board_links), 'epoch') <= timestamptz '2026-10-01 02:43:44+00',
         (select count(*)::text from public.board_notes) || ' notes / ' || (select count(*)::text from public.board_links) || ' links'
  union all
  select 12, 'I1 Board V2 in use (items / threads / validations)', null::boolean,
         (select count(*)::text from public.board_items) || ' / ' || (select count(*)::text from public.board_threads)
         || ' / ' || (select count(*)::text from public.board_validations)
) checks
order by ord, check_name;
