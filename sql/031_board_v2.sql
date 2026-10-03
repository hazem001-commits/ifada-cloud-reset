-- ============================================================
-- IFADA — 031_board_v2.sql            (ENGINE SCHEMA + engine policy mirror)
--
-- STATUS: WRITTEN FOR REVIEW — NOT APPLIED (security-reviewed revision 2).
-- Run manually in the Supabase SQL Editor only after Hazem approves:
--   BEFORE: sql/verify_031_preapply.sql  (every row pass = true, else STOP)
--   AFTER:  sql/verify_031_postapply.sql (every non-INFO row pass = true)
--
-- Board V2 becomes the authoritative DB boundary for the shared board.
--
--   1. PIN PRIVACY (server-enforced) — pin_board_material accepts only
--      material the WHOLE TEAM may already know exists:
--        evidence → unlocked in this session AND the case's engine policy
--                   says restricted evidence is team-visible by title
--                   ('title', Room 714). No policy row = 'hidden' = refused
--                   (fail closed: Scene 17 private channels, future cases).
--                   Title visibility is NOT reasoning authority: connection
--                   tests still require the tester to READ each node (027).
--        object / location → the caller passes 026's full row boundary
--                   (_object_state_row_visible) AND the object plus every
--                   ancestor is discovered AND shared (team-visible chain).
--   2. NO STORED LABELS — a material row stores only (kind, code); its text
--      is forced empty. Every member renders titles from their own data.
--   3. VALIDATED LOCK FOR EVERYONE — only test_board_selection (via 027's
--      propose_connection, as the caller) writes board_validations. Clients
--      have SELECT only: no insert, no "tentative → validated", no meaning,
--      no rule id (none is stored anywhere here).
--   4. TEAM REASONING (fact/question/hypothesis) — notes, not case truth;
--      ≤ 400 chars; only the author (still a member) edits or deletes;
--      threads are deleted by their author only; materials by any member.
--
-- Not in this file (deploy order): the legacy board_notes / board_links
-- remain writable so the current board keeps working until the app
-- switches to these RPCs; then sql/034_lock_legacy_board.sql locks them.
-- Depends on: 004/017 (evidence, session_evidence), 019/020 (objects),
-- 026 (_object_state_row_visible), 027 (propose_connection). Adds no
-- authored case content (no rules, no evidence, no objects).
-- ============================================================

-- ------------------------------------------------------------
-- Engine policy (server-only mirror of src/cases/<case>/contract.ts →
-- restrictedEvidence). Not case canon: one switch per case saying whether
-- unlocked-but-unreadable evidence is team-visible by title.
-- ------------------------------------------------------------
create table if not exists public.case_engine_policy (
  case_id             text primary key references public.cases(id) on delete cascade,
  restricted_evidence text not null check (restricted_evidence in ('title', 'hidden'))
);
alter table public.case_engine_policy enable row level security;
-- Room 714 product rule (contract: restrictedEvidence = 'title'). Scene 17
-- has NO row on purpose → 'hidden' → its evidence is never pinnable here.
insert into public.case_engine_policy (case_id, restricted_evidence)
select 'room-714', 'title'
where exists (select 1 from public.cases where id = 'room-714')
on conflict (case_id) do nothing;

-- ------------------------------------------------------------
-- Board tables
-- ------------------------------------------------------------
create table if not exists public.board_items (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions(id) on delete cascade,
  kind          text not null check (kind in ('material','fact','question','hypothesis')),
  material_kind text check (material_kind in ('evidence','object','location')),
  material_code text check (material_code ~ '^[A-Z0-9_-]{1,64}$'),
  text          text not null default '' check (char_length(text) <= 400),
  x             real not null default 0.5 check (x between 0 and 1),
  y             real not null default 0.5 check (y between 0 and 1),
  author_id     uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((kind = 'material') = (material_kind is not null and material_code is not null)),
  check (kind <> 'material' or text = ''),            -- materials never carry a label
  check (kind = 'material' or char_length(text) > 0)
);
create index if not exists board_items_session_idx on public.board_items (session_id);
create unique index if not exists board_items_material_once
  on public.board_items (session_id, material_kind, material_code) where kind = 'material';

create table if not exists public.board_threads (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  kind        text not null check (kind in ('tentative','support','tension')),  -- never 'validated'
  from_item   uuid not null references public.board_items(id) on delete cascade,
  to_item     uuid not null references public.board_items(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (from_item <> to_item)
);
create index if not exists board_threads_session_idx on public.board_threads (session_id);

-- Server-written only (test_board_selection): the validated item group and
-- its authored, team-shared meaning. No rule id is ever stored.
create table if not exists public.board_validations (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  item_ids     uuid[] not null check (cardinality(item_ids) between 2 and 5),
  meaning      text not null,
  validated_by uuid references auth.users(id) on delete set null,
  validated_at timestamptz not null default now()
);
create index if not exists board_validations_session_idx on public.board_validations (session_id);

alter table public.board_items       enable row level security;
alter table public.board_threads     enable row level security;
alter table public.board_validations enable row level security;

-- Members read their own session's board. NO insert/update/delete policies:
-- every write goes through the SECURITY DEFINER RPCs below.
drop policy if exists board_items_select on public.board_items;
create policy board_items_select on public.board_items
  for select to authenticated using (public.is_session_member(session_id));
drop policy if exists board_threads_select on public.board_threads;
create policy board_threads_select on public.board_threads
  for select to authenticated using (public.is_session_member(session_id));
drop policy if exists board_validations_select on public.board_validations;
create policy board_validations_select on public.board_validations
  for select to authenticated using (public.is_session_member(session_id));

-- ------------------------------------------------------------
-- Internal: may the WHOLE TEAM know this material exists? (fail closed)
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
begin
  select s.case_id into v_case from public.sessions s where s.id = p_session;
  if v_case is null or v_code = '' then
    return false;
  end if;

  if p_kind = 'evidence' then
    -- Team-visible by title only where the case policy says so; no row = hidden.
    if coalesce((select p.restricted_evidence from public.case_engine_policy p where p.case_id = v_case), 'hidden') <> 'title' then
      return false;
    end if;
    return exists (
      select 1 from public.session_evidence se
      join public.evidence e on e.id = se.evidence_id
      where se.session_id = p_session and e.case_id = v_case and upper(e.code) = v_code
    );
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
-- RPCs
-- ------------------------------------------------------------
create or replace function public.pin_board_material(
  p_session uuid, p_kind text, p_code text, p_x real, p_y real
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if not public._board_material_team_visible(p_session, p_kind, p_code) then
    raise exception 'NOT_PINNABLE';  -- one neutral answer: hidden, private, unknown, other case
  end if;
  insert into public.board_items (session_id, kind, material_kind, material_code, text, x, y, author_id)
  values (p_session, 'material', p_kind, upper(trim(p_code)), '',
          least(greatest(coalesce(p_x, 0.5), 0), 1), least(greatest(coalesce(p_y, 0.5), 0), 1), auth.uid())
  on conflict (session_id, material_kind, material_code) where kind = 'material' do nothing
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.add_board_reasoning(
  p_session uuid, p_kind text, p_text text, p_x real, p_y real
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if p_kind not in ('fact', 'question', 'hypothesis') or char_length(v_text) not between 1 and 400 then
    raise exception 'INVALID_REQUEST';
  end if;
  insert into public.board_items (session_id, kind, text, x, y, author_id)
  values (p_session, p_kind, v_text,
          least(greatest(coalesce(p_x, 0.5), 0), 1), least(greatest(coalesce(p_y, 0.5), 0), 1), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Any member may arrange the shared board. Position only — never authorization.
create or replace function public.move_board_item(p_item uuid, p_x real, p_y real)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.board_items i
  set x = least(greatest(coalesce(p_x, i.x), 0), 1),
      y = least(greatest(coalesce(p_y, i.y), 0), 1),
      updated_at = now()
  where i.id = p_item and public.is_session_member(i.session_id);
end;
$$;

create or replace function public.edit_board_reasoning(p_item uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
begin
  if char_length(v_text) not between 1 and 400 then
    raise exception 'INVALID_REQUEST';
  end if;
  update public.board_items i
  set text = v_text, updated_at = now()
  where i.id = p_item and i.kind <> 'material' and i.author_id = auth.uid()
    and public.is_session_member(i.session_id);
end;
$$;

-- Materials: any member may take them off the shared board (authorization
-- and discovery state are untouched). Team reasoning: only its author.
create or replace function public.remove_board_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.board_items i
  where i.id = p_item and public.is_session_member(i.session_id)
    and (i.kind = 'material' or i.author_id = auth.uid());
end;
$$;

create or replace function public.link_board_items(p_session uuid, p_from uuid, p_to uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;
  -- both ends must be items of THIS session's board (already authorized at pin time)
  if p_kind not in ('tentative', 'support', 'tension') or p_from = p_to
     or (select count(*) from public.board_items where id in (p_from, p_to) and session_id = p_session) <> 2 then
    raise exception 'INVALID_REQUEST';
  end if;
  insert into public.board_threads (session_id, kind, from_item, to_item, author_id)
  values (p_session, p_kind, p_from, p_to, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.unlink_board_thread(p_thread uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.board_threads t
  where t.id = p_thread and t.author_id = auth.uid() and public.is_session_member(t.session_id);
end;
$$;

-- ------------------------------------------------------------
-- RPC: test_board_selection — the ONLY board path to the validator.
-- Maps 2–5 material items of THIS session's board to nodes and calls 027's
-- propose_connection AS THE CALLER (same privacy: the caller must READ every
-- evidence node; neutral misses; per-player + team throttles; idempotent
-- effects). There is no second connection-truth implementation here.
-- On success only, records the group + authored meaning for the whole team.
-- ------------------------------------------------------------
create or replace function public.test_board_selection(p_session uuid, p_items uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nodes  jsonb;
  v_result jsonb;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if p_items is null or cardinality(p_items) not between 2 and 5
     or cardinality(p_items) <> (select count(distinct x) from unnest(p_items) x) then
    raise exception 'INVALID_REQUEST';
  end if;

  select jsonb_agg(jsonb_build_object('kind', i.material_kind, 'id', i.material_code))
  into v_nodes
  from public.board_items i
  where i.id = any(p_items) and i.session_id = p_session and i.kind = 'material';

  if v_nodes is null or jsonb_array_length(v_nodes) <> cardinality(p_items) then
    raise exception 'INVALID_REQUEST';  -- only materials of this session's board
  end if;

  v_result := public.propose_connection(p_session, v_nodes, null);

  if v_result ->> 'status' = 'validated' then
    insert into public.board_validations (session_id, item_ids, meaning, validated_by)
    select p_session, p_items, v_result ->> 'meaning', auth.uid()
    where not exists (select 1 from public.board_validations v
                      where v.session_id = p_session and v.item_ids @> p_items and v.item_ids <@ p_items);
  end if;

  return v_result;  -- exactly 027's player response ({status} or {status, meaning})
end;
$$;

-- ------------------------------------------------------------
-- Permissions — explicit final state
-- ------------------------------------------------------------
revoke all on table public.case_engine_policy from public, anon, authenticated;
revoke all on table public.board_items       from public, anon, authenticated;
revoke all on table public.board_threads     from public, anon, authenticated;
revoke all on table public.board_validations from public, anon, authenticated;
grant select on table public.board_items       to authenticated;
grant select on table public.board_threads     to authenticated;
grant select on table public.board_validations to authenticated;

revoke all on function public._board_material_team_visible(uuid, text, text) from public, anon, authenticated;
revoke all on function public.pin_board_material(uuid, text, text, real, real) from public, anon;
revoke all on function public.add_board_reasoning(uuid, text, text, real, real) from public, anon;
revoke all on function public.move_board_item(uuid, real, real)                 from public, anon;
revoke all on function public.edit_board_reasoning(uuid, text)                  from public, anon;
revoke all on function public.remove_board_item(uuid)                           from public, anon;
revoke all on function public.link_board_items(uuid, uuid, uuid, text)          from public, anon;
revoke all on function public.unlink_board_thread(uuid)                         from public, anon;
revoke all on function public.test_board_selection(uuid, uuid[])                from public, anon;
grant execute on function public.pin_board_material(uuid, text, text, real, real) to authenticated;
grant execute on function public.add_board_reasoning(uuid, text, text, real, real) to authenticated;
grant execute on function public.move_board_item(uuid, real, real)                 to authenticated;
grant execute on function public.edit_board_reasoning(uuid, text)                  to authenticated;
grant execute on function public.remove_board_item(uuid)                           to authenticated;
grant execute on function public.link_board_items(uuid, uuid, uuid, text)          to authenticated;
grant execute on function public.unlink_board_thread(uuid)                         to authenticated;
grant execute on function public.test_board_selection(uuid, uuid[])                to authenticated;

-- Realtime: board changes signal teammates (RLS filters per member).
do $$
declare t text;
begin
  foreach t in array array['board_items', 'board_threads', 'board_validations'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
