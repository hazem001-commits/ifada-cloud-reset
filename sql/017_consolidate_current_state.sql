-- ============================================================
-- IFADA — 017_consolidate_current_state.sql
--
-- LAST file in the migration sequence (see sql/MIGRATIONS.md).
-- Idempotently reasserts the CURRENT authoritative definitions of
-- every object that an older file can silently overwrite if it is
-- re-run out of order:
--
--   join_session          (002 defines the old single-spec version)
--   evidence_index        (004 / fix_multiplayer return media_path)
--   unlockable_evidence   (004 / expiring_unlockable.sql = single-spec)
--   unlock_evidence       (004 / 010 = single-spec)
--   expiring_evidence     (010 / fix_expiring_evidence.sql = single-spec)
--   cases.max_players     (003 re-run resets it to 4)
--   session_members_unique_spec index (001 re-run recreates it)
--   case_config room-714 start_ck (011/016 value 1380)
--   case-media bucket privacy (014)
--   realtime publication membership (002/004/006/008/010/012)
--
-- Function bodies below are VERBATIM copies of the definitions that
-- are already authoritative:
--   join_session, unlockable_evidence, unlock_evidence,
--   expiring_evidence  <- fix_multiplayer_specialization_access.sql
--   evidence_index     <- 015_evidence_media_safe.sql (has_media)
--
-- It also tightens ONE grant: assign_session_specializations is an
-- internal helper with no caller check; only `from public` was
-- revoked before, which does not remove Supabase's default direct
-- EXECUTE grants to anon/authenticated. start_session (SECURITY
-- DEFINER) keeps calling it as the function owner.
--
-- Safe to run more than once. Touches NO gameplay data: no session,
-- member, evidence, unlock, board, verdict or assignment rows are
-- deleted or rewritten. Grants nothing new.
--
-- DO NOT RUN without Hazem's approval.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. Preconditions — objects this file relies on but does not own.
--    Fail loudly (whole transaction rolls back) instead of
--    half-applying on a database that skipped a migration.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.session_member_specializations') is null then
    raise exception '017: session_member_specializations missing — run fix_multiplayer_specialization_access.sql first';
  end if;
  if to_regprocedure('public.has_specialization(uuid, specialization)') is null
     or to_regprocedure('public.my_specializations(uuid)') is null
     or to_regprocedure('public.assign_session_specializations(uuid)') is null
     or to_regprocedure('public.start_session(uuid)') is null then
    raise exception '017: multi-specialization helpers missing — run fix_multiplayer_specialization_access.sql first';
  end if;
  if to_regprocedure('public.case_clock(uuid)') is null
     or to_regclass('public.case_config') is null then
    raise exception '017: automation objects missing — run 010_automation.sql first';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'evidence' and column_name = 'expires_ck'
  ) then
    raise exception '017: evidence.expires_ck missing — run 010_automation.sql first';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. Catalogue / config
-- ------------------------------------------------------------
alter table public.cases
  alter column max_players set default 8;

update public.cases
set max_players = 8
where max_players < 8;

-- Unique-primary-specialization index blocks 5–8 players.
drop index if exists public.session_members_unique_spec;

update public.case_config
set start_ck = 1380
where case_id = 'room-714'
  and start_ck is distinct from 1380;

update storage.buckets
set public = false
where id = 'case-media'
  and public is distinct from false;

-- ------------------------------------------------------------
-- 2. join_session  (verbatim: fix_multiplayer_specialization_access.sql)
-- ------------------------------------------------------------
create or replace function public.join_session(
  p_code text,
  p_specialization specialization
)
returns table (
  session_id uuid,
  case_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_session   public.sessions%rowtype;
  v_count     integer;
  v_max       integer;
  v_distinct  integer;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_session
  from public.sessions
  where code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_session.status <> 'lobby' then
    raise exception 'SESSION_ALREADY_STARTED';
  end if;

  -- إعادة اتصال.
  if exists (
    select 1
    from public.session_members sm
    where sm.session_id = v_session.id
      and sm.user_id = v_user
  ) then
    return query
    select v_session.id, v_session.case_id;
    return;
  end if;

  select c.max_players
  into v_max
  from public.cases c
  where c.id = v_session.case_id;

  select count(*)
  into v_count
  from public.session_members sm
  where sm.session_id = v_session.id;

  if v_count >= v_max then
    raise exception 'SESSION_FULL';
  end if;

  select count(distinct sm.specialization)
  into v_distinct
  from public.session_members sm
  where sm.session_id = v_session.id;

  -- طالما التخصصات الأربعة لم تكتمل:
  -- يجب اختيار تخصص غير مستخدم.
  if v_distinct < 4
     and exists (
       select 1
       from public.session_members sm
       where sm.session_id = v_session.id
         and sm.specialization = p_specialization
     )
  then
    raise exception 'SPECIALIZATION_TAKEN';
  end if;

  insert into public.session_members (
    session_id,
    user_id,
    specialization,
    is_host
  )
  values (
    v_session.id,
    v_user,
    p_specialization,
    false
  );

  return query
  select v_session.id, v_session.case_id;
end;
$$;

revoke all
  on function public.join_session(text, specialization)
  from public;

grant execute
  on function public.join_session(text, specialization)
  to authenticated;

-- ------------------------------------------------------------
-- 3. evidence_index  (verbatim: 015_evidence_media_safe.sql — has_media, never media_path)
-- ------------------------------------------------------------
drop function if exists public.evidence_index(uuid);

create function public.evidence_index(
  p_session uuid
)
returns table (
  code         text,
  title        text,
  kind         evidence_kind,
  owner_spec   specialization,
  clock_label  text,
  body         text,
  has_media    boolean,
  readable     boolean,
  unlocked_at  timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  return query
  select
    e.code,
    e.title,
    e.kind,
    e.owner_spec,
    e.clock_label,

    case
      when public.has_specialization(p_session, e.owner_spec)
      then e.body
      else null
    end,

    case
      when public.has_specialization(p_session, e.owner_spec)
      then (e.media_path is not null)
      else false
    end,

    public.has_specialization(p_session, e.owner_spec),

    se.unlocked_at

  from public.session_evidence se
  join public.evidence e
    on e.id = se.evidence_id

  where se.session_id = p_session

  order by e.sort_order, e.code;
end;
$$;

revoke all
  on function public.evidence_index(uuid)
  from public;

grant execute
  on function public.evidence_index(uuid)
  to authenticated;

-- ------------------------------------------------------------
-- 4. unlockable_evidence  (verbatim: fix_multiplayer_specialization_access.sql)
-- ------------------------------------------------------------
create or replace function public.unlockable_evidence(
  p_session uuid
)
returns table (
  code text,
  title text,
  kind evidence_kind
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_case text;
  v_now  numeric;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id
  into v_case
  from public.sessions s
  where s.id = p_session;

  select cc.now_ck
  into v_now
  from public.case_clock(p_session) cc;

  return query
  select
    e.code,
    e.title,
    e.kind
  from public.evidence e
  where e.case_id = v_case

    and public.has_specialization(
      p_session,
      e.owner_spec
    )

    and not exists (
      select 1
      from public.session_evidence se
      where se.session_id = p_session
        and se.evidence_id = e.id
    )

    and (
      e.expires_ck is null
      or v_now is null
      or v_now <= e.expires_ck
    )

    and (
      cardinality(e.requires) = 0

      or not exists (
        select 1
        from unnest(e.requires) as req(c)
        where not exists (
          select 1
          from public.session_evidence se2
          join public.evidence e2
            on e2.id = se2.evidence_id
          where se2.session_id = p_session
            and e2.code = req.c
        )
      )
    )

  order by e.sort_order, e.code;
end;
$$;

revoke all
  on function public.unlockable_evidence(uuid)
  from public;

grant execute
  on function public.unlockable_evidence(uuid)
  to authenticated;

-- ------------------------------------------------------------
-- 5. unlock_evidence  (verbatim: fix_multiplayer_specialization_access.sql)
-- ------------------------------------------------------------
create or replace function public.unlock_evidence(
  p_session uuid,
  p_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case text;
  v_ev   public.evidence%rowtype;
  v_req  text;
  v_now  numeric;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id
  into v_case
  from public.sessions s
  where s.id = p_session;

  select *
  into v_ev
  from public.evidence
  where case_id = v_case
    and code = upper(trim(p_code));

  if not found then
    raise exception 'EVIDENCE_NOT_FOUND';
  end if;

  if not public.has_specialization(
    p_session,
    v_ev.owner_spec
  ) then
    raise exception 'WRONG_SPECIALIZATION';
  end if;

  if v_ev.expires_ck is not null then

    select cc.now_ck
    into v_now
    from public.case_clock(p_session) cc;

    if v_now is not null
       and v_now > v_ev.expires_ck
    then
      raise exception 'EVIDENCE_EXPIRED';
    end if;

  end if;

  foreach v_req in array v_ev.requires
  loop

    if not exists (
      select 1
      from public.session_evidence se
      join public.evidence e2
        on e2.id = se.evidence_id
      where se.session_id = p_session
        and e2.code = v_req
    ) then
      raise exception 'REQUIREMENTS_NOT_MET';
    end if;

  end loop;

  insert into public.session_evidence (
    session_id,
    evidence_id,
    unlocked_by
  )
  values (
    p_session,
    v_ev.id,
    auth.uid()
  )
  on conflict do nothing;

  return true;
end;
$$;

revoke all
  on function public.unlock_evidence(uuid, text)
  from public;

grant execute
  on function public.unlock_evidence(uuid, text)
  to authenticated;

-- ------------------------------------------------------------
-- 6. expiring_evidence  (verbatim: fix_multiplayer_specialization_access.sql)
-- ------------------------------------------------------------
create or replace function public.expiring_evidence(
  p_session uuid
)
returns table (
  code text,
  title text,
  expires_ck integer,
  minutes_left numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_case text;
  v_now  numeric;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id
  into v_case
  from public.sessions s
  where s.id = p_session;

  select cc.now_ck
  into v_now
  from public.case_clock(p_session) cc;

  return query
  select
    e.code,
    e.title,
    e.expires_ck,

    (
      (e.expires_ck - v_now)
      /
      nullif(
        (
          select cc.multiplier
          from public.case_config cc
          where cc.case_id = v_case
        ),
        0
      )
    )::numeric

  from public.evidence e
  where e.case_id = v_case

    and public.has_specialization(
      p_session,
      e.owner_spec
    )

    and e.expires_ck is not null

    and not exists (
      select 1
      from public.session_evidence se
      where se.session_id = p_session
        and se.evidence_id = e.id
    )

  order by e.expires_ck;
end;
$$;

revoke all
  on function public.expiring_evidence(uuid)
  from public;

grant execute
  on function public.expiring_evidence(uuid)
  to authenticated;
-- ------------------------------------------------------------
-- 7. Internal helper — not callable from the browser
-- ------------------------------------------------------------
revoke all
  on function public.assign_session_specializations(uuid)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 8. Realtime publication — every table the client subscribes to.
--    Add-only; never removes a table.
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'sessions', 'session_members', 'session_evidence',
    'board_notes', 'board_links', 'theory_placements',
    'interrogation_log', 'session_character_state',
    'session_events', 'session_verdict'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;
