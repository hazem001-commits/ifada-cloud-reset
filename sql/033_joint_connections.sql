-- ============================================================
-- IFADA — 033_joint_connections.sql   (ENGINE — additive over live 027)
--
-- STATUS: WRITTEN FOR REVIEW — NOT APPLIED (security-reviewed revision 2).
-- Run manually in the Supabase SQL Editor only after Hazem approves:
--   BEFORE: sql/verify_033_preapply.sql  (every non-INFO row pass = true, else STOP)
--   AFTER:  sql/verify_033_postapply.sql (every non-INFO row pass = true)
-- Requires 026, 027, 031 (live). 034 (live) is unaffected.
-- 027 is APPLIED + VERIFIED and its file is NOT edited: this migration only
-- adds, and re-creates propose_connection with 027's membership, shape and
-- privacy sections VERBATIM so that solo and joint tests share ONE throttle
-- and ONE matcher. The one intended behaviour change for solo tests: an
-- approved rule must now ALSO be team_safe to validate (every meaning is
-- shown to the whole team) — with no rule rows live, nothing changes today.
--
-- JOINT CONNECTION ("ربط مشترك") — cooperative cross-specialization proof:
--   An authored relationship may span what different members can READ.
--   Each member contributes node(s) THEY can read; the server vouches each
--   contribution against the contributor's own authorization (027's
--   _connection_node_known evaluated as auth.uid()); a participant
--   explicitly tests; the server matches against APPROVED + TEAM-SAFE
--   authored rules; only the team-safe meaning is shared.
--
-- Lifecycle:  open ──test(validated)──▶ validated   (meaning stored, final)
--             open ──close by a participant──▶ closed (final, no truth)
--   Contributions are withdrawn (deleted) by their contributor while open.
--   No expiry (a design decision left to Hazem; closing covers stale ones).
--
--   * Title-only ("محجوب") is never enough to contribute: readability is
--     the solo 027 rule (readable evidence_index row / 026 object row).
--   * Contributing exposes no body. Teammates see a contribution's ref only
--     where the team may already know the node exists (031's
--     _board_material_team_visible, evaluated as the viewer) — otherwise
--     only that a member contributed. Never titles from here, never bodies.
--   * No oracle: a test answers exactly like 027 — {validated, meaning} or
--     {not_established}. Wrong, incomplete, draft, not-team-safe, other-case
--     and departed-member proposals are all the same not_established, and
--     every one is recorded against the SAME budgets.
--   * No spoofing: contributor = auth.uid(), written only by RPC.
--   * Member leaves → their contributions are ignored at test time and
--     hidden from the team view.
--   * Brute force: the SAME per-player (6 / 60 s) and team (20 failed /
--     10 min) budgets as 027, shared by solo and joint tests.
--   * Case-agnostic: "can read" is whatever evidence_index says for that
--     member (Room 714 specializations, future Scene 17 channels — 029).
--   * The AI is never the validator.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rule metadata: explicit team-safe classification.
--    An approved rule MUST be team-safe (solo and joint alike).
-- ------------------------------------------------------------
alter table public.case_connection_rules
  add column if not exists team_safe boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.case_connection_rules'::regclass
                   and conname = 'case_connection_rules_approved_team_safe') then
    alter table public.case_connection_rules
      add constraint case_connection_rules_approved_team_safe check (status <> 'approved' or team_safe);
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Joint proposals + contributions (session state)
-- ------------------------------------------------------------
-- Proposal rows carry NO node identities: members may read them (realtime
-- signal for the board). The meaning is set by the server only on
-- validation and is team-safe by construction.
create table if not exists public.session_joint_proposals (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  created_by  uuid references auth.users(id) on delete set null,
  relation    text check (relation in ('supports','contradicts','same_entity','sequence','located_at','explains')),
  status      text not null default 'open' check (status in ('open', 'validated', 'closed')),
  meaning     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  closed_at   timestamptz,
  check ((status = 'validated') = (meaning is not null)),
  check ((status = 'open') = (closed_at is null))
);
create index if not exists session_joint_proposals_session on public.session_joint_proposals (session_id, status);

-- Contributions carry node identities → RPC-only (masked view below).
create table if not exists public.session_joint_contributions (
  proposal_id    uuid not null references public.session_joint_proposals(id) on delete cascade,
  session_id     uuid not null references public.sessions(id) on delete cascade,
  node_kind      text not null check (node_kind in ('evidence','object','location')),
  node_id        text not null check (node_id ~ '^[A-Z0-9_:-]{1,64}$'),
  contributor    uuid not null references auth.users(id) on delete cascade,
  contributed_at timestamptz not null default now(),
  primary key (proposal_id, node_kind, node_id)
);

alter table public.session_joint_proposals     enable row level security;
alter table public.session_joint_contributions enable row level security;

-- Members read their session's proposal rows (no node data). No write
-- policies anywhere; contributions have no policy at all (RPC-only).
drop policy if exists session_joint_proposals_select on public.session_joint_proposals;
create policy session_joint_proposals_select on public.session_joint_proposals
  for select to authenticated using (public.is_session_member(session_id));

-- ------------------------------------------------------------
-- 3. Shared internals (extracted from 027, behaviour unchanged)
-- ------------------------------------------------------------
-- 027's throttle, verbatim constants: 6 proposals / 60 s per player;
-- 20 not_established / 10 min per team. Shared by solo and joint tests.
create or replace function public._connection_throttled(p_session uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_player_per_min constant integer := 6;
  c_team_fail_max  constant integer := 20;
  c_team_window    constant interval := interval '10 minutes';
begin
  return (select count(*) from public.session_connection_attempts a
          where a.session_id = p_session and a.user_id = auth.uid()
            and a.created_at > now() - interval '60 seconds') >= c_player_per_min
      or (select count(*) from public.session_connection_attempts a
          where a.session_id = p_session and a.outcome = 'not_established'
            and a.created_at > now() - c_team_window) >= c_team_fail_max;
end;
$$;

-- 027's match + record + effects + conditions + milestones, verbatim,
-- taking already-authorized nodes. The ONLY connection-truth matcher.
create or replace function public._connection_match(
  p_session  uuid,
  p_case     text,
  p_nodes    jsonb,
  p_keys     text[],
  p_relation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule     public.case_connection_rules%rowtype;
  v_req      text[];
  v_match    public.case_connection_rules%rowtype;
  v_found    boolean := false;
  v_cond     public.case_connection_conditions%rowtype;
  v_valid    text[];
  v_produced integer := 0;
begin
  for v_rule in
    select * from public.case_connection_rules r
    where r.case_id = p_case and r.status = 'approved' and r.team_safe
    order by r.sort_order, r.rule_id
  loop
    select array_agg((n ->> 'kind') || ':' || upper(n ->> 'id')) into v_req
    from jsonb_array_elements(v_rule.requires) n;
    if v_req <@ p_keys
       and cardinality(p_keys) - cardinality(v_req) <= v_rule.allow_extra
       and (v_rule.relation is null or p_relation is null or v_rule.relation = p_relation) then
      v_match := v_rule;
      v_found := true;
      exit;
    end if;
  end loop;

  if not v_found then
    insert into public.session_connection_attempts (session_id, user_id, nodes, relation, outcome)
    values (p_session, auth.uid(), p_nodes, p_relation, 'not_established');
    return jsonb_build_object('status', 'not_established');
  end if;

  insert into public.session_connection_attempts (session_id, user_id, nodes, relation, outcome, rule_id)
  values (p_session, auth.uid(), p_nodes, p_relation, 'validated', v_match.rule_id);

  insert into public.session_validated_connections (session_id, rule_id, validated_by)
  values (p_session, v_match.rule_id, auth.uid())
  on conflict do nothing;
  if found then
    v_produced := v_produced + public._apply_connection_effects(p_session, v_match.effects);
  end if;

  select array_agg(rule_id) into v_valid
  from public.session_validated_connections where session_id = p_session;

  for v_cond in
    select * from public.case_connection_conditions c
    where c.case_id = p_case and c.status = 'approved'
      and not exists (select 1 from public.session_connection_effects e
                      where e.session_id = p_session and e.effect_kind = 'condition'
                        and e.effect_id = c.condition_id)
    order by c.condition_id
  loop
    if (v_cond.all_rules is null or v_cond.all_rules <@ v_valid)
       and (v_cond.any_rules is null
            or (select count(*) from unnest(v_cond.any_rules) x where x = any(v_valid)) >= v_cond.any_min) then
      insert into public.session_connection_effects (session_id, effect_kind, effect_id)
      values (p_session, 'condition', v_cond.condition_id)
      on conflict do nothing;
      if found then
        v_produced := v_produced + public._apply_connection_effects(p_session, v_cond.effects);
      end if;
    end if;
  end loop;

  if v_produced > 0 then
    begin
      perform public.check_milestones(p_session);
    exception when others then
      raise exception 'CONNECTION_INTERNAL_ERROR';
    end;
  end if;

  return jsonb_build_object('status', 'validated', 'meaning', v_match.meaning);
end;
$$;

-- ------------------------------------------------------------
-- 4. propose_connection — 027 verbatim up to "every node known", then the
--    shared internals. Same player contract, same privacy, same limits.
-- ------------------------------------------------------------
create or replace function public.propose_connection(
  p_session  uuid,
  p_nodes    jsonb,
  p_relation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case     text;
  v_node     jsonb;
  v_kind     text;
  v_id       text;
  v_keys     text[] := '{}';
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  -- Shape only (never about truth).
  if p_nodes is null or jsonb_typeof(p_nodes) <> 'array'
     or jsonb_array_length(p_nodes) < 2 or jsonb_array_length(p_nodes) > 5
     or octet_length(p_nodes::text) > 2000 then
    raise exception 'INVALID_REQUEST';
  end if;
  if p_relation is not null
     and p_relation not in ('supports','contradicts','same_entity','sequence','located_at','explains') then
    raise exception 'INVALID_REQUEST';
  end if;
  for v_node in select * from jsonb_array_elements(p_nodes) loop
    v_kind := v_node ->> 'kind';
    v_id   := upper(trim(coalesce(v_node ->> 'id', '')));
    if v_kind is null
       or v_kind not in ('evidence','object','entity','location','event','claim','question','hypothesis')
       or v_id !~ '^[A-Z0-9_:-]{1,64}$' then
      raise exception 'INVALID_REQUEST';
    end if;
    if (v_kind || ':' || v_id) = any(v_keys) then
      raise exception 'INVALID_REQUEST';
    end if;
    v_keys := v_keys || (v_kind || ':' || v_id);
  end loop;

  -- Throttle BEFORE any truth is touched (player burst + team failure budget).
  if public._connection_throttled(p_session) then
    return jsonb_build_object('status', 'throttled');
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;

  -- Privacy FIRST: every node must be known to me, before any rule is read.
  for v_node in select * from jsonb_array_elements(p_nodes) loop
    if not public._connection_node_known(
         p_session, v_node ->> 'kind', upper(trim(v_node ->> 'id'))) then
      insert into public.session_connection_attempts (session_id, user_id, nodes, relation, outcome)
      values (p_session, auth.uid(), p_nodes, p_relation, 'not_established');
      return jsonb_build_object('status', 'not_established');
    end if;
  end loop;

  return public._connection_match(p_session, v_case, p_nodes, v_keys, p_relation);
end;
$$;

-- ------------------------------------------------------------
-- 5. Joint RPCs
-- ------------------------------------------------------------
create or replace function public.open_joint_proposal(p_session uuid, p_relation text default null)
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
  if p_relation is not null
     and p_relation not in ('supports','contradicts','same_entity','sequence','located_at','explains') then
    raise exception 'INVALID_REQUEST';
  end if;
  if (select count(*) from public.session_joint_proposals
      where session_id = p_session and status = 'open') >= 6 then
    raise exception 'TOO_MANY_OPEN';  -- keeps the shared space readable; not about truth
  end if;
  insert into public.session_joint_proposals (session_id, created_by, relation)
  values (p_session, auth.uid(), p_relation)
  returning id into v_id;
  return v_id;
end;
$$;

-- Contribute ONE node I can READ. Every refusal is the same neutral error.
create or replace function public.contribute_to_joint(p_proposal uuid, p_kind text, p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p    public.session_joint_proposals%rowtype;
  v_kind text := coalesce(p_kind, '');
  v_id   text := upper(trim(coalesce(p_id, '')));
begin
  select * into v_p from public.session_joint_proposals where id = p_proposal for update;
  if not found or not public.is_session_member(v_p.session_id) or v_p.status <> 'open'
     or v_kind not in ('evidence', 'object', 'location') or v_id !~ '^[A-Z0-9_:-]{1,64}$'
     or not public._connection_node_known(v_p.session_id, v_kind, v_id)          -- vouched by the reader
     or (select count(*) from public.session_joint_contributions where proposal_id = p_proposal) >= 5 then
    raise exception 'NOT_CONTRIBUTABLE';
  end if;
  insert into public.session_joint_contributions (proposal_id, session_id, node_kind, node_id, contributor)
  values (p_proposal, v_p.session_id, v_kind, v_id, auth.uid())
  on conflict do nothing;
  update public.session_joint_proposals set updated_at = now() where id = p_proposal;  -- realtime signal
end;
$$;

-- Only the contributor, only while open. Withdrawn = deleted = never tested.
create or replace function public.withdraw_joint_contribution(p_proposal uuid, p_kind text, p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.session_joint_contributions c
  using public.session_joint_proposals p
  where c.proposal_id = p_proposal and p.id = c.proposal_id and p.status = 'open'
    and c.node_kind = p_kind and c.node_id = upper(trim(coalesce(p_id, '')))
    and c.contributor = auth.uid();
  if found then
    update public.session_joint_proposals set updated_at = now() where id = p_proposal;
  end if;
end;
$$;

-- Close an open proposal: participants only (creator or a live contributor).
create or replace function public.close_joint_proposal(p_proposal uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.session_joint_proposals p
  set status = 'closed', closed_at = now(), updated_at = now()
  where p.id = p_proposal and p.status = 'open'
    and public.is_session_member(p.session_id)
    and (p.created_by = auth.uid()
         or exists (select 1 from public.session_joint_contributions c
                    where c.proposal_id = p.id and c.contributor = auth.uid()));
end;
$$;

-- Test a joint proposal: participants only (creator or a contributor).
-- Contributions of members who left are ignored. Same throttle, same
-- matcher, same record: an incomplete proposal is an ordinary recorded miss.
create or replace function public.test_joint_proposal(p_proposal uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p      public.session_joint_proposals%rowtype;
  v_case   text;
  v_nodes  jsonb;
  v_keys   text[];
  v_result jsonb;
begin
  select * into v_p from public.session_joint_proposals where id = p_proposal for update;
  if not found or not public.is_session_member(v_p.session_id) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if v_p.created_by is distinct from auth.uid()
     and not exists (select 1 from public.session_joint_contributions
                     where proposal_id = p_proposal and contributor = auth.uid()) then
    raise exception 'NOT_A_PARTICIPANT';
  end if;
  if v_p.status = 'validated' then
    return jsonb_build_object('status', 'validated', 'meaning', v_p.meaning);
  end if;
  if v_p.status <> 'open' then
    raise exception 'INVALID_REQUEST';
  end if;

  if public._connection_throttled(v_p.session_id) then
    return jsonb_build_object('status', 'throttled');
  end if;

  select jsonb_agg(jsonb_build_object('kind', c.node_kind, 'id', c.node_id) order by c.node_kind, c.node_id),
         array_agg(c.node_kind || ':' || c.node_id)
  into v_nodes, v_keys
  from public.session_joint_contributions c
  join public.session_members m on m.session_id = c.session_id and m.user_id = c.contributor
  where c.proposal_id = p_proposal;

  -- Incomplete (fewer than 2 live contributions): an ordinary recorded miss.
  if v_nodes is null or cardinality(v_keys) not between 2 and 5 then
    insert into public.session_connection_attempts (session_id, user_id, nodes, relation, outcome)
    values (v_p.session_id, auth.uid(), coalesce(v_nodes, '[]'::jsonb), v_p.relation, 'not_established');
    return jsonb_build_object('status', 'not_established');
  end if;

  select s.case_id into v_case from public.sessions s where s.id = v_p.session_id;
  v_result := public._connection_match(v_p.session_id, v_case, v_nodes, v_keys, v_p.relation);

  if v_result ->> 'status' = 'validated' then
    update public.session_joint_proposals
    set status = 'validated', meaning = v_result ->> 'meaning', closed_at = now(), updated_at = now()
    where id = p_proposal;
  end if;
  return v_result;
end;
$$;

-- Masked team view: who (still a member) contributed, and a node ref ONLY
-- where the whole team may already know that node exists. Never titles,
-- never bodies, never hints.
create or replace function public.joint_proposals(p_session uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'created_by', p.created_by,
      'status', p.status,
      'meaning', p.meaning,
      'contributions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'contributor', c.contributor,
          'mine', c.contributor = auth.uid(),
          'ref', case
                   when c.contributor = auth.uid()
                     or public._board_material_team_visible(p_session, c.node_kind, c.node_id)
                   then jsonb_build_object('kind', c.node_kind, 'id', c.node_id)
                   else null
                 end) order by c.contributed_at)
        from public.session_joint_contributions c
        join public.session_members m on m.session_id = c.session_id and m.user_id = c.contributor
        where c.proposal_id = p.id), '[]'::jsonb)
    ) order by p.created_at)
    from public.session_joint_proposals p
    where p.session_id = p_session and p.status <> 'closed'), '[]'::jsonb);
end;
$$;

-- ------------------------------------------------------------
-- 6. Permissions — explicit final state
-- ------------------------------------------------------------
revoke all on table public.session_joint_proposals     from public, anon, authenticated;
revoke all on table public.session_joint_contributions from public, anon, authenticated;
grant select on table public.session_joint_proposals to authenticated;

revoke all on function public._connection_throttled(uuid)                         from public, anon, authenticated;
revoke all on function public._connection_match(uuid, text, jsonb, text[], text)  from public, anon, authenticated;
revoke all on function public.propose_connection(uuid, jsonb, text)               from public, anon;
revoke all on function public.open_joint_proposal(uuid, text)                     from public, anon;
revoke all on function public.contribute_to_joint(uuid, text, text)               from public, anon;
revoke all on function public.withdraw_joint_contribution(uuid, text, text)       from public, anon;
revoke all on function public.close_joint_proposal(uuid)                          from public, anon;
revoke all on function public.test_joint_proposal(uuid)                           from public, anon;
revoke all on function public.joint_proposals(uuid)                               from public, anon;
grant execute on function public.propose_connection(uuid, jsonb, text)            to authenticated;
grant execute on function public.open_joint_proposal(uuid, text)                  to authenticated;
grant execute on function public.contribute_to_joint(uuid, text, text)            to authenticated;
grant execute on function public.withdraw_joint_contribution(uuid, text, text)    to authenticated;
grant execute on function public.close_joint_proposal(uuid)                       to authenticated;
grant execute on function public.test_joint_proposal(uuid)                        to authenticated;
grant execute on function public.joint_proposals(uuid)                            to authenticated;

-- Realtime: proposal rows only (no node data) — a signal for teammates'
-- boards to re-read the masked joint_proposals() view. RLS filters per member.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public'
                   and tablename = 'session_joint_proposals') then
    alter publication supabase_realtime add table public.session_joint_proposals;
  end if;
end $$;
