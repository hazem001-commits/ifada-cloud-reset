-- ============================================================
-- IFADA — 027_validated_connections.sql
--
-- STATUS: WRITTEN FOR REVIEW — NOT APPLIED. Run manually in the
-- Supabase SQL Editor only after Hazem approves (see MIGRATIONS.md).
--
-- VALIDATED CONNECTION ENGINE (shared, case-agnostic).
--
--   player proposes a connection → the SERVER validates it against
--   AUTHORED case truth → game state may react (derived evidence,
--   chapter, marked contradiction).
--
-- The AI is never the source of truth here: matching is deterministic
-- over authored rows. The TypeScript mirror (src/lib/connections/) is
-- the authoring/test harness; THIS file is the enforcement.
--
-- Three layers, kept separate:
--   case_connection_rules        authored valid connections (server-only)
--   case_connection_conditions   derived unlock conditions   (server-only)
--   propose_connection(...)      player proposal → validated / not_established
--
-- NO ORACLE. To a proposer these are indistinguishable — all return
-- exactly {"status":"not_established"}:
--   wrong connection · a rule needing a node I don't hold · a node I'm
--   not authorized to know (hidden, teammate-private, other case) ·
--   a draft rule · another case's rule · nonexistent codes.
-- Never exposed to players: rule ids, which part matched, missing-node
-- hints, unlock targets (evidence appears only via evidence_index, under
-- its own visibility rules), condition ids, contradiction ids.
-- A validated proposal returns only {"status":"validated","meaning":…}.
-- Effects can never turn a valid hit into a different error: expected
-- unlock refusals are deferred, anything else is logged server-side.
--
-- Node authorization (026 privacy model, fail closed):
--   evidence          → in the caller's evidence_index with readable = true
--                       ("محجوب" title-only items are NOT known)
--   object / location → public._object_state_row_visible (026)
--   entity / event / claim / question / hypothesis → not modelled → unknown
--
-- Derived evidence: unlock_evidence requires the caller's specialization.
-- If the proposer can't unlock it (WRONG_SPECIALIZATION /
-- REQUIREMENTS_NOT_MET), the unlock is recorded as PENDING and any member
-- who can unlock it settles it later via settle_connection_effects() —
-- never lost, never doubled, never an error to the proposer.
--
-- Rate limits (brute-force rule discovery):
--   * per player: 6 proposals / 60 s                       (unchanged)
--   * per team:   20 NOT-ESTABLISHED proposals / 10 min     (added — see
--     MIGRATIONS.md row 27 for the reasoning; tune before applying)
--
-- Seeds NOTHING. Until rows with status = 'approved' exist, every
-- proposal returns not_established.
--
-- Depends on: 004/017 (evidence_index, unlock_evidence), 010
-- (check_milestones), 026 (_object_state_row_visible). Touches no
-- existing table, function, policy or grant. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- Authored truth (server-only; RLS on, no policies → RPC-only)
-- ------------------------------------------------------------
create table if not exists public.case_connection_rules (
  case_id     text not null references public.cases(id) on delete cascade,
  rule_id     text not null check (rule_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  -- [{"kind":"evidence","id":"E06"}, …] — 2..5 nodes, ids stored UPPER.
  requires    jsonb not null check (jsonb_typeof(requires) = 'array'
                                    and jsonb_array_length(requires) between 2 and 5),
  relation    text check (relation in ('supports','contradicts','same_entity','sequence','located_at','explains')),
  allow_extra smallint not null default 0 check (allow_extra between 0 and 3),
  meaning     text not null,
  -- [{"kind":"unlock_evidence","evidence":"E15"}, {"kind":"unlock_chapter","chapter":"3"},
  --  {"kind":"mark_contradiction","id":"S17_PAGES_DIFFER"}]
  effects     jsonb not null default '[]'::jsonb check (jsonb_typeof(effects) = 'array'),
  status      text not null default 'draft' check (status in ('draft','approved')),
  sort_order  integer not null default 0,
  primary key (case_id, rule_id)
);

create table if not exists public.case_connection_conditions (
  case_id      text not null references public.cases(id) on delete cascade,
  condition_id text not null check (condition_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  all_rules    text[],
  any_rules    text[],
  any_min      smallint,
  effects      jsonb not null default '[]'::jsonb check (jsonb_typeof(effects) = 'array'),
  status       text not null default 'draft' check (status in ('draft','approved')),
  primary key (case_id, condition_id),
  check (all_rules is not null or any_rules is not null),
  check (any_rules is null or (any_min between 1 and cardinality(any_rules)))
);

-- ------------------------------------------------------------
-- Session state (RPC-written only)
-- ------------------------------------------------------------
create table if not exists public.session_connection_attempts (
  id         bigserial primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  nodes      jsonb not null,
  relation   text,
  outcome    text not null check (outcome in ('validated','not_established')),
  rule_id    text,
  created_at timestamptz not null default now()
);
create index if not exists session_connection_attempts_rate
  on public.session_connection_attempts (session_id, user_id, created_at desc);
create index if not exists session_connection_attempts_team
  on public.session_connection_attempts (session_id, outcome, created_at desc);

-- Team-level: a validated connection is shared knowledge of the team.
create table if not exists public.session_validated_connections (
  session_id   uuid not null references public.sessions(id) on delete cascade,
  rule_id      text not null,
  validated_by uuid references auth.users(id) on delete set null,
  validated_at timestamptz not null default now(),
  primary key (session_id, rule_id)
);

-- Applied effects + condition ledger. Every kind is idempotent by PK.
--   evidence          produced derived evidence
--   evidence_pending  valid unlock the proposer could not perform yet
--   effect_error      content fault (operators only; never shown)
create table if not exists public.session_connection_effects (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  effect_kind text not null check (effect_kind in
                ('unlock_chapter','mark_contradiction','condition','evidence','evidence_pending','effect_error')),
  effect_id   text not null,
  applied_at  timestamptz not null default now(),
  primary key (session_id, effect_kind, effect_id)
);

alter table public.case_connection_rules         enable row level security;
alter table public.case_connection_conditions    enable row level security;
alter table public.session_connection_attempts   enable row level security;
alter table public.session_validated_connections enable row level security;
alter table public.session_connection_effects    enable row level security;
-- No policies: every read/write goes through the SECURITY DEFINER RPCs below.

-- ------------------------------------------------------------
-- Internal: is this node known to the caller? (fail closed)
-- ------------------------------------------------------------
create or replace function public._connection_node_known(
  p_session uuid,
  p_kind    text,
  p_id      text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_kind = 'evidence' then
    return exists (
      select 1 from public.evidence_index(p_session) e
      where upper(e.code) = p_id and e.readable
    );
  elsif p_kind in ('object', 'location') then
    return coalesce(public._object_state_row_visible(p_session, p_id), false);
  end if;
  -- entity / event / claim / question / hypothesis: not modelled yet.
  return false;
end;
$$;

-- ------------------------------------------------------------
-- Internal: apply one effect list. NEVER raises to the caller for an
-- effect outcome (no oracle): expected unlock refusals → pending,
-- expiry → not produced, anything else → effect_error (logged).
-- Returns how many evidence items were produced now.
-- ------------------------------------------------------------
create or replace function public._apply_connection_effects(
  p_session uuid,
  p_effects jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eff      jsonb;
  v_kind     text;
  v_code     text;
  v_produced integer := 0;
begin
  for v_eff in select * from jsonb_array_elements(coalesce(p_effects, '[]'::jsonb)) loop
    v_kind := v_eff ->> 'kind';
    if v_kind = 'unlock_evidence' then
      v_code := upper(trim(coalesce(v_eff ->> 'evidence', '')));
      if exists (select 1 from public.session_connection_effects
                 where session_id = p_session and effect_kind = 'evidence' and effect_id = v_code) then
        continue;  -- already produced: never twice
      end if;
      begin
        perform public.unlock_evidence(p_session, v_code);
        insert into public.session_connection_effects (session_id, effect_kind, effect_id)
        values (p_session, 'evidence', v_code)
        on conflict do nothing;
        delete from public.session_connection_effects
        where session_id = p_session and effect_kind = 'evidence_pending' and effect_id = v_code;
        v_produced := v_produced + 1;
      exception when others then
        if sqlerrm in ('WRONG_SPECIALIZATION', 'REQUIREMENTS_NOT_MET') then
          insert into public.session_connection_effects (session_id, effect_kind, effect_id)
          values (p_session, 'evidence_pending', v_code)
          on conflict do nothing;
        elsif sqlerrm = 'EVIDENCE_EXPIRED' then
          null;  -- the window passed: not produced (same rule as challenges)
        else
          insert into public.session_connection_effects (session_id, effect_kind, effect_id)
          values (p_session, 'effect_error', v_code)
          on conflict do nothing;
        end if;
      end;
    elsif v_kind = 'unlock_chapter' and coalesce(v_eff ->> 'chapter', '') <> '' then
      insert into public.session_connection_effects (session_id, effect_kind, effect_id)
      values (p_session, 'unlock_chapter', v_eff ->> 'chapter')
      on conflict do nothing;
    elsif v_kind = 'mark_contradiction' and coalesce(v_eff ->> 'id', '') <> '' then
      insert into public.session_connection_effects (session_id, effect_kind, effect_id)
      values (p_session, 'mark_contradiction', v_eff ->> 'id')
      on conflict do nothing;
    else
      -- unknown kind or missing id: content fault, logged — never an error to the player
      insert into public.session_connection_effects (session_id, effect_kind, effect_id)
      values (p_session, 'effect_error', 'kind:' || coalesce(v_kind, '?'))
      on conflict do nothing;
    end if;
  end loop;
  return v_produced;
end;
$$;

-- ------------------------------------------------------------
-- RPC: propose_connection
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
  c_player_per_min constant integer := 6;
  c_team_fail_max  constant integer := 20;
  c_team_window    constant interval := interval '10 minutes';
  v_case     text;
  v_node     jsonb;
  v_kind     text;
  v_id       text;
  v_keys     text[] := '{}';
  v_rule     public.case_connection_rules%rowtype;
  v_req      text[];
  v_match    public.case_connection_rules%rowtype;
  v_found    boolean := false;
  v_cond     public.case_connection_conditions%rowtype;
  v_valid    text[];
  v_produced integer := 0;
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
  if (select count(*) from public.session_connection_attempts a
      where a.session_id = p_session and a.user_id = auth.uid()
        and a.created_at > now() - interval '60 seconds') >= c_player_per_min
     or (select count(*) from public.session_connection_attempts a
         where a.session_id = p_session and a.outcome = 'not_established'
           and a.created_at > now() - c_team_window) >= c_team_fail_max then
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

  -- Deterministic match: first approved rule of THIS case in authored order.
  for v_rule in
    select * from public.case_connection_rules r
    where r.case_id = v_case and r.status = 'approved'
    order by r.sort_order, r.rule_id
  loop
    select array_agg((n ->> 'kind') || ':' || upper(n ->> 'id')) into v_req
    from jsonb_array_elements(v_rule.requires) n;
    if v_req <@ v_keys
       and cardinality(v_keys) - cardinality(v_req) <= v_rule.allow_extra
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

  -- First validation applies the rule's effects; repeats are no-ops.
  insert into public.session_validated_connections (session_id, rule_id, validated_by)
  values (p_session, v_match.rule_id, auth.uid())
  on conflict do nothing;
  if found then
    v_produced := v_produced + public._apply_connection_effects(p_session, v_match.effects);
  end if;

  -- Derived conditions newly satisfied — each applied once per session,
  -- and only by the transaction that actually recorded it (race-safe).
  select array_agg(rule_id) into v_valid
  from public.session_validated_connections where session_id = p_session;

  for v_cond in
    select * from public.case_connection_conditions c
    where c.case_id = v_case and c.status = 'approved'
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

  -- Only the authored meaning — no rule id, no targets, no counts.
  return jsonb_build_object('status', 'validated', 'meaning', v_match.meaning);
end;
$$;

-- ------------------------------------------------------------
-- RPC: settle_connection_effects — any member retries the team's
-- pending derived-evidence unlocks AS THEMSELVES (unlock_evidence
-- enforces their specialization). Returns nothing (no oracle); new
-- evidence appears through evidence_index under its own rules.
-- ------------------------------------------------------------
create or replace function public.settle_connection_effects(p_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code     text;
  v_produced integer := 0;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;
  for v_code in
    select effect_id from public.session_connection_effects
    where session_id = p_session and effect_kind = 'evidence_pending'
    order by effect_id
  loop
    v_produced := v_produced + public._apply_connection_effects(
      p_session, jsonb_build_array(jsonb_build_object('kind', 'unlock_evidence', 'evidence', v_code)));
  end loop;
  if v_produced > 0 then
    begin
      perform public.check_milestones(p_session);
    exception when others then
      raise exception 'CONNECTION_INTERNAL_ERROR';
    end;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- RPC: session_connection_state — what the TEAM has established:
-- validated meanings (no rule ids) + unlocked chapters.
-- ------------------------------------------------------------
create or replace function public.session_connection_state(p_session uuid)
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
  return jsonb_build_object(
    'connections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'meaning', r.meaning,
               'validated_at', v.validated_at,
               'validated_by', v.validated_by) order by v.validated_at)
      from public.session_validated_connections v
      join public.sessions s on s.id = v.session_id
      join public.case_connection_rules r on r.case_id = s.case_id and r.rule_id = v.rule_id
      where v.session_id = p_session), '[]'::jsonb),
    'chapters', coalesce((
      select jsonb_agg(e.effect_id order by e.applied_at)
      from public.session_connection_effects e
      where e.session_id = p_session and e.effect_kind = 'unlock_chapter'), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------
-- Permissions — explicit final state.
-- ------------------------------------------------------------
revoke all on table public.case_connection_rules         from public, anon, authenticated;
revoke all on table public.case_connection_conditions    from public, anon, authenticated;
revoke all on table public.session_connection_attempts   from public, anon, authenticated;
revoke all on table public.session_validated_connections from public, anon, authenticated;
revoke all on table public.session_connection_effects    from public, anon, authenticated;
revoke all on sequence public.session_connection_attempts_id_seq from public, anon, authenticated;

revoke all on function public._connection_node_known(uuid, text, text)    from public, anon, authenticated;
revoke all on function public._apply_connection_effects(uuid, jsonb)      from public, anon, authenticated;
revoke all on function public.propose_connection(uuid, jsonb, text)       from public, anon;
revoke all on function public.settle_connection_effects(uuid)             from public, anon;
revoke all on function public.session_connection_state(uuid)              from public, anon;
grant execute on function public.propose_connection(uuid, jsonb, text)    to authenticated;
grant execute on function public.settle_connection_effects(uuid)          to authenticated;
grant execute on function public.session_connection_state(uuid)           to authenticated;

-- ============================================================
-- VERIFICATION (READ-ONLY) — run in the SQL Editor, never part of this file:
--   BEFORE applying:  sql/verify_027_preapply.sql   (every row pass = true, else STOP)
--   AFTER applying:   sql/verify_027_postapply.sql  (every non-null pass = true)
-- Live gameplay test (mutating) belongs in a throwaway test session only:
--   with no approved rules, any proposal of two readable evidence codes, or
--   one including a title-only code, returns {"status":"not_established"};
--   a 7th proposal within 60 s returns {"status":"throttled"}.
-- ============================================================
