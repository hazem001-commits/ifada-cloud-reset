-- ============================================================
-- IFADA 036 — PRE-APPLY CHECKS (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor as the role that will apply 036.
-- Every row with a non-null pass must show pass = true. If ANY is false:
-- STOP, do not apply. Rows with pass = null are INFO (live-play counters).
--
-- P1 — 035 is live and complete (the distribution layer 036 configures).
-- P2 — Scene 17 is still empty: no content, no policy row, no channels.
-- P3 — Room 714 baseline intact (every row keeps its capability owner).
-- P4 — 032 / 028 / 029 / 030 still unapplied; 034 lock intact.
-- P5 — the applying role owns what 036 writes (tables + open_case); FORCE RLS off.
-- ============================================================
with
f035(name) as (values ('_evidence_readable'), ('_evidence_row_visible'), ('_assign_session_channels'),
                      ('_sessions_assign_channels_on_start'), ('my_channels')),
chan_tables(name) as (values ('case_channels'), ('case_channel_seats'), ('case_evidence_channels'), ('session_member_channels')),
proposal_tables(name) as (values ('case_channel_plans'), ('evidence_channels'),                          -- 029
                                 ('case_entities'), ('case_entity_descriptors'), ('session_entity_handles')),  -- 030
written(name) as (values ('case_engine_policy'), ('case_channels'), ('case_channel_seats'), ('case_evidence_channels'), ('evidence')),
legacy(name) as (values ('board_notes'), ('board_links')),
client_roles(name) as (values ('anon'), ('authenticated'))
select check_name, pass, detail from (
  -- P1 — 035 live
  select 1 as ord, 'P1a 035 function live: ' || f.name as check_name,
         exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f.name) as pass,
         null::text as detail
  from f035 f
  union all
  select 2, 'P1b evidence_index reads the 035 readability rule',
         exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'evidence_index'
                   and position('public._evidence_readable(p_session, e.id)' in p.prosrc) > 0
                   and position('has_specialization' in p.prosrc) = 0), null
  union all
  select 3, 'P1c channel-assignment trigger live on sessions',
         exists (select 1 from pg_trigger t where t.tgrelid = 'public.sessions'::regclass
                   and t.tgname = 'sessions_assign_channels_on_start' and t.tgenabled = 'O'), null
  union all
  select 4, 'P1d case_engine_policy.distribution column + channels ⇒ hidden constraint',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'case_engine_policy' and column_name = 'distribution')
         and exists (select 1 from pg_constraint where conname = 'case_engine_policy_channels_hidden'), null
  union all
  select 5, 'P1e 035 table exists: ' || t.name, to_regclass('public.' || t.name) is not null, null
  from chan_tables t
  union all
  -- NULL owner_spec fails closed only because has_specialization can never return NULL:
  -- non-STRICT, EXISTS-based (EXISTS(... = NULL) is false), and 035 returns it unwrapped.
  select 5, 'P1f has_specialization is non-STRICT + EXISTS-based (NULL owner_spec → false, never NULL)',
         exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'has_specialization'
                   and not p.proisstrict and position('exists' in lower(p.prosrc)) > 0
                   and position('= p_specialization' in p.prosrc) > 0)
         and exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = '_evidence_readable'
                       and position('return public.has_specialization(p_session, v_owner);' in p.prosrc) > 0), null
  union all
  select 5, 'P1g open_case(uuid) exists: SECURITY DEFINER, returns integer (036 §0b replaces its body, same signature)',
         exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'open_case'
                   and pg_get_function_identity_arguments(p.oid) = 'p_session uuid'
                   and p.prorettype = 'integer'::regtype and p.prosecdef), null
  union all
  select 5, 'I0 evidence.owner_spec nullable before 036 (036 §0 makes it so; either state is fine)', null::boolean,
         (select is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'evidence' and column_name = 'owner_spec')
  -- P2 — Scene 17 empty
  union all
  select 6, 'P2a scene-17 case row exists and allows a 2-player session',
         exists (select 1 from public.cases where id = 'scene-17' and min_players <= 2 and max_players >= 2), null
  union all
  select 7, 'P2b scene-17 has no evidence / objects / challenges (slice codes absent)',
         (select count(*) from public.evidence where case_id = 'scene-17')
         + (select count(*) from public.investigation_objects where case_id = 'scene-17')
         + (select count(*) from public.investigation_challenges where case_id = 'scene-17') = 0, null
  union all
  select 8, 'P2c no scene-17 engine-policy row yet',
         not exists (select 1 from public.case_engine_policy where case_id = 'scene-17'), null
  union all
  select 9, 'P2d no scene-17 channel catalogue / seats yet',
         not exists (select 1 from public.case_channels where case_id = 'scene-17')
         and not exists (select 1 from public.case_channel_seats where case_id = 'scene-17'), null
  union all
  select 10, 'P2e no evidence → channel mapping rows at all',
         not exists (select 1 from public.case_evidence_channels), null
  -- P3 — Room 714 baseline
  union all
  select 11, 'P3a room-714 evidence = 34', (select count(*) from public.evidence where case_id = 'room-714') = 34, null
  union all
  select 11, 'P3b room-714 investigation_objects = 10', (select count(*) from public.investigation_objects where case_id = 'room-714') = 10, null
  union all
  select 11, 'P3c room-714 investigation_challenges = 3', (select count(*) from public.investigation_challenges where case_id = 'room-714') = 3, null
  union all
  select 11, 'P3e room-714 every evidence row has an owner_spec',
         not exists (select 1 from public.evidence where case_id = 'room-714' and owner_spec is null), null
  union all
  select 11, 'P3d room-714 engine policy: specialization + title',
         exists (select 1 from public.case_engine_policy
                 where case_id = 'room-714' and distribution = 'specialization' and restricted_evidence = 'title'), null
  -- P4 — other migrations
  union all
  select 12, 'P4a 032 not applied: no approved connection rule', not exists (select 1 from public.case_connection_rules where status = 'approved'), null
  union all
  select 12, 'P4b rule rows are none, or only the known 032 drafts',
         not exists (select 1 from public.case_connection_rules r
                     where not (r.case_id = 'room-714' and r.status = 'draft'
                                and r.rule_id in ('R714_NO_VICTIM_BLOOD', 'R714_N17_PAYMENTS', 'R714_COPY_AFTER_MESSAGE'))),
         (select count(*)::text from public.case_connection_rules) || ' rule rows'
  union all
  select 12, 'P4c 028 not applied: scene-17 still published (catalogue unchanged)',
         exists (select 1 from public.cases where id = 'scene-17' and is_published), null
  union all
  select 13, 'P4d 029 / 030 not live — table absent: ' || t.name, to_regclass('public.' || t.name) is null, null
  from proposal_tables t
  union all
  select 14, 'P4e 034 legacy lock intact — no client writes/truncate: ' || l.name,
         not exists (select 1 from client_roles r
                     where has_table_privilege(r.name, 'public.' || l.name, 'INSERT')
                        or has_table_privilege(r.name, 'public.' || l.name, 'UPDATE')
                        or has_table_privilege(r.name, 'public.' || l.name, 'DELETE')
                        or has_table_privilege(r.name, 'public.' || l.name, 'TRUNCATE')), null
  from legacy l
  -- P5 — ability to apply
  union all
  select 15, 'P5a table written by 036 owned by current_user: ' || w.name,
         coalesce(pg_get_userbyid(c.relowner) = current_user, false),
         'owner = ' || coalesce(pg_get_userbyid(c.relowner)::text, 'MISSING')
  from written w left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = w.name
  union all
  select 15, 'P5c open_case(uuid) owned by current_user (create or replace needs it)',
         coalesce((select bool_and(pg_get_userbyid(p.proowner) = current_user) from pg_proc p
                   where p.pronamespace = 'public'::regnamespace and p.proname = 'open_case'), false),
         'owner = ' || coalesce((select string_agg(pg_get_userbyid(p.proowner)::text, ', ') from pg_proc p
                                 where p.pronamespace = 'public'::regnamespace and p.proname = 'open_case'), 'MISSING')
  union all
  select 16, 'P5b FORCE RLS off: ' || w.name, coalesce(not c.relforcerowsecurity, false), null
  from written w left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = w.name
  -- INFO
  union all
  select 17, 'I1 sessions per case (room-714 / scene-17)', null::boolean,
         (select count(*)::text from public.sessions where case_id = 'room-714') || ' / '
         || (select count(*)::text from public.sessions where case_id = 'scene-17')
  union all
  select 18, 'I2 session_member_channels rows (live play)', null::boolean,
         (select count(*)::text from public.session_member_channels)
) checks
order by ord, check_name;
