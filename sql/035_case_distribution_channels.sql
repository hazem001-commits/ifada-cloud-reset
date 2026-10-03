-- ============================================================
-- IFADA — 035_case_distribution_channels.sql   (ENGINE — server distribution layer)
--
-- STATUS: WRITTEN FOR REVIEW — NOT APPLIED.
-- Run manually in the Supabase SQL Editor only after Hazem approves:
--   BEFORE: sql/verify_035_preapply.sql  (every non-INFO row pass = true, else STOP)
--   AFTER:  sql/verify_035_postapply.sql (every non-INFO row pass = true)
-- Requires 017 (evidence functions), 026, 027, 031, 033, 034 (all live).
-- 029 / 030 stay proposals — 035 is a NEW design informed by 029, not 029.
--
-- INVARIANT: CASE DISTRIBUTION DECIDES READABILITY. SHARED SYSTEMS CONSUME
-- READABILITY. Nothing shared infers it from specialization or channel.
--
--   ONE server rule — public._evidence_readable(session, evidence):
--     case distribution 'specialization' (Room 714) → has_specialization(owner_spec)
--                                                     (exactly today's rule)
--     case distribution 'channels' (Scene 17 first) → evidence with no channel
--                                                     row = shared lane (every
--                                                     member reads it); a channel
--                                                     row = only members assigned
--                                                     that channel in THIS session
--     no engine-policy row / unknown                → NOT readable (fail closed)
--   ONE visibility rule — public._evidence_row_visible(session, evidence):
--     readable, OR the case policy is 'title' (Room 714 title-only rows).
--     Policy 'hidden' (Scene 17): a non-reader gets NO ROW at all.
--
-- Every consumer now routes through those two functions:
--   evidence_index · unlockable_evidence · unlock_evidence · expiring_evidence
--   (bodies verbatim from 017; only has_specialization(owner_spec) is replaced)
--   evidence_provenance (verbatim 026 + evidence visibility on both branches)
--   session_evidence SELECT policy + realtime (RLS-filtered INSERT events)
--   _board_material_team_visible (verbatim 031; hidden-policy evidence branch)
-- Inherited unchanged: 027 _connection_node_known (reads evidence_index.readable)
-- → propose_connection, 031 test_board_selection, 033 contribute_to_joint;
-- Grounded Search / AuthorizedKnowledge / Stress Test / evidence-media all read
-- evidence_index as the player.
--
-- Channels ≠ specializations: channels grant NO capability; specialization
-- helpers are untouched. Assignment is server-authoritative: a trigger on the
-- session's lobby → active transition fills session_member_channels from the
-- authored seat plan (no plan for the player count → the start fails).
--
-- SEEDS NOTHING for Scene 17: no channel catalogue, no seat plan, no
-- evidence↔channel mapping, no engine-policy row. Until those exist, a
-- Scene 17 session has nothing readable and nothing visible (fail closed).
-- Room 714: its existing case_engine_policy row gets distribution =
-- 'specialization' (column default) — its behaviour is unchanged.
--
-- Drift notes (expected, like 033 → 027): verify_live_state.sql body_md5 for
-- evidence_index / unlockable_evidence / unlock_evidence / expiring_evidence,
-- and verify_031_postapply B2 / verify_033_postapply, describe pre-035 bodies.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Case distribution model (server mirror of the case contract)
-- ------------------------------------------------------------
alter table public.case_engine_policy
  add column if not exists distribution text not null default 'specialization'
    check (distribution in ('specialization', 'channels'));

do $$
begin
  -- Channel-private evidence is never title-visible to a non-holder.
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.case_engine_policy'::regclass
                   and conname = 'case_engine_policy_channels_hidden') then
    alter table public.case_engine_policy
      add constraint case_engine_policy_channels_hidden
      check (distribution <> 'channels' or restricted_evidence = 'hidden');
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Channel schema (authored config + session state; all server-only)
-- ------------------------------------------------------------
-- A case's information lanes (ids only — labels live in the case contract).
create table if not exists public.case_channels (
  case_id    text not null references public.cases(id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[A-Z][A-Z0-9_]{0,15}$'),
  primary key (case_id, channel_id)
);

-- Authored seat plan: for N players, seat k holds these channels (one row per
-- channel; FK keeps every channel inside the same case).
create table if not exists public.case_channel_seats (
  case_id    text not null,
  players    smallint not null check (players between 1 and 8),
  seat       smallint not null check (seat between 1 and 8),
  channel_id text not null,
  primary key (case_id, players, seat, channel_id),
  foreign key (case_id, channel_id) references public.case_channels(case_id, channel_id) on delete cascade,
  check (seat <= players)
);

-- Evidence → lane. No row = shared lane. (Separate table: evidence untouched.)
create table if not exists public.case_evidence_channels (
  evidence_id uuid primary key references public.evidence(id) on delete cascade,
  case_id     text not null,
  channel_id  text not null,
  foreign key (case_id, channel_id) references public.case_channels(case_id, channel_id) on delete cascade
);

-- Per-session assignment. Written ONLY by _assign_session_channels (trigger).
-- Cascades away with the membership (a member who leaves holds nothing).
create table if not exists public.session_member_channels (
  session_id  uuid not null,
  user_id     uuid not null,
  case_id     text not null,
  channel_id  text not null,
  assigned_at timestamptz not null default now(),
  primary key (session_id, user_id, channel_id),
  foreign key (session_id, user_id) references public.session_members(session_id, user_id) on delete cascade,
  foreign key (case_id, channel_id) references public.case_channels(case_id, channel_id) on delete cascade
);

alter table public.case_channels            enable row level security;
alter table public.case_channel_seats       enable row level security;
alter table public.case_evidence_channels   enable row level security;
alter table public.session_member_channels  enable row level security;
-- No policies on any of them: RPC / definer access only.

-- ------------------------------------------------------------
-- 3. THE readability rule (single server boundary)
-- ------------------------------------------------------------
create or replace function public._evidence_readable(p_session uuid, p_evidence_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_case    text;
  v_ev_case text;
  v_owner   specialization;
  v_dist    text;
  v_channel text;
begin
  if p_session is null or p_evidence_id is null or not public.is_session_member(p_session) then
    return false;
  end if;
  select s.case_id into v_case from public.sessions s where s.id = p_session;
  select e.case_id, e.owner_spec into v_ev_case, v_owner from public.evidence e where e.id = p_evidence_id;
  if v_case is null or v_ev_case is distinct from v_case then
    return false;                                   -- other case / unknown evidence
  end if;
  select p.distribution into v_dist from public.case_engine_policy p where p.case_id = v_case;

  if v_dist = 'specialization' then
    return public.has_specialization(p_session, v_owner);   -- Room 714: today's rule
  elsif v_dist = 'channels' then
    select ec.channel_id into v_channel from public.case_evidence_channels ec where ec.evidence_id = p_evidence_id;
    if not found then
      return true;                                  -- shared lane: every member reads it
    end if;
    return exists (select 1 from public.session_member_channels m
                   where m.session_id = p_session and m.user_id = auth.uid()
                     and m.case_id = v_case and m.channel_id = v_channel);
  end if;
  return false;                                     -- no policy row: fail closed
end;
$$;

-- Does this row exist for the caller at all? Readable, or title-only by policy.
create or replace function public._evidence_row_visible(p_session uuid, p_evidence_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public._evidence_readable(p_session, p_evidence_id) then
    return true;
  end if;
  return public.is_session_member(p_session)
     and exists (select 1 from public.sessions s
                 join public.evidence e on e.id = p_evidence_id and e.case_id = s.case_id
                 join public.case_engine_policy p on p.case_id = s.case_id
                 where s.id = p_session and p.restricted_evidence = 'title');
end;
$$;

-- ------------------------------------------------------------
-- 4. Server-authoritative channel assignment (session start)
-- ------------------------------------------------------------
create or replace function public._assign_session_channels(p_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case    text;
  v_players integer;
begin
  select s.case_id into v_case from public.sessions s where s.id = p_session;
  if not exists (select 1 from public.case_engine_policy p where p.case_id = v_case and p.distribution = 'channels') then
    return;                                         -- not a channel case (Room 714): nothing to do
  end if;
  select count(*) into v_players from public.session_members m where m.session_id = p_session;
  if (select count(distinct cs.seat) from public.case_channel_seats cs
      where cs.case_id = v_case and cs.players = v_players) <> v_players then
    raise exception 'CHANNEL_PLAN_MISSING';         -- fail closed: never "everyone sees all"
  end if;
  delete from public.session_member_channels where session_id = p_session;
  insert into public.session_member_channels (session_id, user_id, case_id, channel_id)
  select p_session, m.user_id, v_case, cs.channel_id
  from (select sm.user_id, row_number() over (order by sm.joined_at, sm.user_id) as seat
        from public.session_members sm where sm.session_id = p_session) m
  join public.case_channel_seats cs
    on cs.case_id = v_case and cs.players = v_players and cs.seat = m.seat;
end;
$$;

create or replace function public._sessions_assign_channels_on_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'lobby' and new.status = 'active' then
    perform public._assign_session_channels(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_assign_channels_on_start on public.sessions;
create trigger sessions_assign_channels_on_start
  after update of status on public.sessions
  for each row execute function public._sessions_assign_channels_on_start();

-- The caller's OWN channels (lane badge). Never a teammate's.
create or replace function public.my_channels(p_session uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;
  return coalesce((select array_agg(m.channel_id order by m.channel_id)
                   from public.session_member_channels m
                   where m.session_id = p_session and m.user_id = auth.uid()), '{}');
end;
$$;

-- ------------------------------------------------------------
-- 5. evidence_index — verbatim 017; readability from the one rule, and a
--    row is returned only if visible (hidden policy: non-readers get nothing).
-- ------------------------------------------------------------
create or replace function public.evidence_index(
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
      when rd.can_read
      then e.body
      else null
    end,

    case
      when rd.can_read
      then (e.media_path is not null)
      else false
    end,

    rd.can_read,

    se.unlocked_at

  from public.session_evidence se
  join public.evidence e
    on e.id = se.evidence_id
  cross join lateral (
    select public._evidence_readable(p_session, e.id) as can_read
  ) rd

  where se.session_id = p_session
    and (rd.can_read or public._evidence_row_visible(p_session, e.id))

  order by e.sort_order, e.code;
end;
$$;

-- ------------------------------------------------------------
-- 6. unlockable_evidence — verbatim 017; who may unlock = who may read
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

    and public._evidence_readable(
      p_session,
      e.id
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

-- ------------------------------------------------------------
-- 7. unlock_evidence — verbatim 017; the error name stays
--    WRONG_SPECIALIZATION ("this caller cannot read it") because 027's
--    pending-effect settlement depends on it.
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

  if not public._evidence_readable(
    p_session,
    v_ev.id
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

-- ------------------------------------------------------------
-- 8. expiring_evidence — verbatim 017; only what the caller can read
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

    and public._evidence_readable(
      p_session,
      e.id
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

-- ------------------------------------------------------------
-- 9. evidence_provenance — verbatim 026 + the evidence itself must be
--    visible to the caller (a shared object never names a hidden item).
-- ------------------------------------------------------------
create or replace function public.evidence_provenance(p_session uuid)
returns table (evidence_code text, object_code text, object_title text, object_category text)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_case text;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;
  select s.case_id into v_case from public.sessions s where s.id = p_session;

  return query
  select src.evidence_code, o.code, o.title, o.category
  from public.session_evidence_sources src
  join public.investigation_objects o
    on o.case_id = v_case and o.code = src.object_code
  join public.session_object_state sos
    on sos.session_id = p_session and sos.object_code = o.code
  where src.session_id = p_session
    and sos.discovered
    and (sos.is_shared or sos.discovered_by = auth.uid())
    and public._object_ancestors_known(p_session, v_case, o.code)  -- 026
    and exists (select 1 from public.evidence ev                    -- 035
                where ev.case_id = v_case and ev.code = src.evidence_code
                  and public._evidence_row_visible(p_session, ev.id))

  union

  select y ->> 'evidence', o.code, o.title, o.category
  from public.investigation_objects o
  join public.session_object_state sos
    on sos.session_id = p_session and sos.object_code = o.code
  cross join lateral jsonb_array_elements(o.yields) y
  where o.case_id = v_case
    and sos.discovered
    and (sos.is_shared or sos.discovered_by = auth.uid())
    and public._object_ancestors_known(p_session, v_case, o.code)  -- 026
    and y ? 'when_state'
    and y ->> 'when_state' = sos.state
    and exists (
      select 1 from public.session_evidence se
      join public.evidence e on e.id = se.evidence_id
      where se.session_id = p_session and e.case_id = v_case and e.code = y ->> 'evidence'
        and public._evidence_row_visible(p_session, e.id)           -- 035
    );
end;
$$;

-- ------------------------------------------------------------
-- 10. session_evidence — direct SELECT + realtime: only rows visible to the
--     caller. Realtime applies this policy per subscriber, so a hidden
--     unlock produces no event, no count and no timing for a non-holder.
--     Room 714 (policy 'title'): every member still sees every row.
-- ------------------------------------------------------------
drop policy if exists session_evidence_select on public.session_evidence;
create policy session_evidence_select on public.session_evidence
  for select to authenticated
  using (public.is_session_member(session_id)
         and public._evidence_row_visible(session_id, evidence_id));

-- ------------------------------------------------------------
-- 11. Board V2 — verbatim 031; the evidence branch for 'hidden'-policy
--     cases: team-visible ONLY when every member reads it by distribution
--     (a shared-lane item of a channel case). Channel-private evidence is
--     never pinnable and never title-visible. Room 714 ('title') unchanged.
-- ------------------------------------------------------------
create or replace function public._board_material_team_visible(
  p_session uuid,
  p_kind    text,
  p_code    text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_case   text;
  v_code   text := upper(trim(coalesce(p_code, '')));
  v_cat    text;
  v_parent text;
  v_depth  integer := 0;
  v_eid    uuid;
begin
  select s.case_id into v_case from public.sessions s where s.id = p_session;
  if v_case is null or v_code = '' then
    return false;
  end if;

  if p_kind = 'evidence' then
    select e.id into v_eid
    from public.session_evidence se
    join public.evidence e on e.id = se.evidence_id
    where se.session_id = p_session and e.case_id = v_case and upper(e.code) = v_code;
    if v_eid is null then
      return false;                                 -- not unlocked in this session
    end if;
    -- Team-visible by title only where the case policy says so; no row = hidden.
    if coalesce((select p.restricted_evidence from public.case_engine_policy p where p.case_id = v_case), 'hidden') <> 'title' then
      -- 035: hidden policy — only a shared-lane item of a channel-distributed case.
      return exists (select 1 from public.case_engine_policy p where p.case_id = v_case and p.distribution = 'channels')
         and not exists (select 1 from public.case_evidence_channels ec where ec.evidence_id = v_eid);
    end if;
    return true;
  end if;

  if p_kind not in ('object', 'location') then
    return false;
  end if;

  -- 026 boundary first, for the caller: member, object exists in the case,
  -- state row exists, discovered, own privacy, full ancestor chain known;
  -- fails closed on missing parent / cycle / depth > 8.
  if not coalesce(public._object_state_row_visible(p_session, v_code), false) then
    return false;
  end if;

  select o.category, nullif(upper(trim(o.parent_code)), '') into v_cat, v_parent
  from public.investigation_objects o
  where o.case_id = v_case and upper(trim(o.code)) = v_code;
  if not found or (p_kind = 'location') <> (v_cat = 'location') then
    return false;
  end if;

  -- Stronger than the caller's view: the object and EVERY ancestor must be
  -- SHARED (not merely "mine"), so pinning cannot reveal a private find.
  if not exists (select 1 from public.session_object_state sos
                 where sos.session_id = p_session and upper(trim(sos.object_code)) = v_code
                   and sos.discovered and sos.is_shared) then
    return false;
  end if;
  while v_parent is not null loop
    v_depth := v_depth + 1;
    if v_depth > 8 then
      return false;  -- 026 already rejected cycles/depth; belt and braces
    end if;
    if not exists (select 1 from public.session_object_state sos
                   where sos.session_id = p_session and upper(trim(sos.object_code)) = v_parent
                     and sos.discovered and sos.is_shared) then
      return false;
    end if;
    select nullif(upper(trim(o.parent_code)), '') into v_parent
    from public.investigation_objects o
    where o.case_id = v_case and upper(trim(o.code)) = v_parent;
  end loop;
  return true;
end;
$$;

-- ------------------------------------------------------------
-- 12. Permissions — explicit final state
-- ------------------------------------------------------------
revoke all on table public.case_channels           from public, anon, authenticated;
revoke all on table public.case_channel_seats      from public, anon, authenticated;
revoke all on table public.case_evidence_channels  from public, anon, authenticated;
revoke all on table public.session_member_channels from public, anon, authenticated;

-- Internal only.
revoke all on function public._evidence_readable(uuid, uuid)          from public, anon, authenticated;
revoke all on function public._assign_session_channels(uuid)          from public, anon, authenticated;
revoke all on function public._sessions_assign_channels_on_start()    from public, anon, authenticated;
revoke all on function public._board_material_team_visible(uuid, text, text) from public, anon, authenticated;
-- Used inside the session_evidence RLS policy → the evaluating role needs
-- EXECUTE (same pattern as 026's _object_state_row_visible). It answers only
-- "does this row exist for ME", member-checked.
revoke all on function public._evidence_row_visible(uuid, uuid)       from public, anon;
grant execute on function public._evidence_row_visible(uuid, uuid)    to authenticated;

-- Public RPCs (same grants as before 035, plus my_channels).
revoke all on function public.evidence_index(uuid)              from public, anon;
revoke all on function public.unlockable_evidence(uuid)         from public, anon;
revoke all on function public.unlock_evidence(uuid, text)       from public, anon;
revoke all on function public.expiring_evidence(uuid)           from public, anon;
revoke all on function public.evidence_provenance(uuid)         from public, anon;
revoke all on function public.my_channels(uuid)                 from public, anon;
grant execute on function public.evidence_index(uuid)           to authenticated;
grant execute on function public.unlockable_evidence(uuid)      to authenticated;
grant execute on function public.unlock_evidence(uuid, text)    to authenticated;
grant execute on function public.expiring_evidence(uuid)        to authenticated;
grant execute on function public.evidence_provenance(uuid)      to authenticated;
grant execute on function public.my_channels(uuid)              to authenticated;
