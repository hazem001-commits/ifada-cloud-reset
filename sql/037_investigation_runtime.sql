-- ============================================================
-- IFADA — 037_investigation_runtime.sql
-- RESET-1 · Investigation Runtime Foundation (ENGINE, case-agnostic).
--
-- STATUS: REVIEW ONLY — NOT APPLIED. Written for Hazem's review per
-- sql/MIGRATIONS.md. Never run without explicit approval. Requires
-- 020, 026, 027, 031, 035 live (verify_037_preapply.sql checks it).
--
-- Seeds NO case data: no Room 714 rows, no Scene 17 rows, no rules, no
-- leads, no world states, no pulse categories, no gated objects. With
-- no approved rule the runtime is inert and every existing flow is
-- byte-for-byte unchanged (verify_037_postapply.sql §Z).
--
-- THE LOOP: observe → act → discover → PULSE → follow → connect → test
-- → WORLD REACTS. The runtime sits ABOVE the existing secure primitives
-- (objects/state machines 019–026, challenges 024/025, validated and
-- joint connections 027/033, distribution 035). It never unlocks
-- "the next evidence" as a journey: authored rules react to real play
-- (object states, followed leads, validated connections, prior world
-- states) and change the world (leads, gated places, object states,
-- world states, aftermath material).
--
-- 1. AUTHORED (server-only; RLS on, no policies, every grant revoked):
--      case_runtime_nodes   node → coarse PULSE category (fixed taxonomy)
--      case_leads           authored leads (player-facing label only)
--      case_world_states    world states (RAMI_FOUND-style), major flag,
--                           presentation via the existing session_events
--      case_runtime_rules   THE ONLY LIVE RULE SOURCE. conditions (all-of)
--                           → effects, scope actor|team, draft|approved.
--                           Validated by a trigger (shape always;
--                           references + causality when approved).
-- 2. SESSION (member-readable, realtime signal → refetch):
--      session_leads        private (holder) or team; RLS like 022
--      session_world_state  team-wide by definition
--      session_pulses       SAFE COLUMNS ONLY: actor, category, time
--    SESSION (server-only, RPC-only):
--      session_pulse_sources       pulse idempotency (one per logical event)
--      session_runtime_firings     once-only rule-firing ledger
--      session_runtime_effects     reveal / delivery / world idempotency
--      session_runtime_provenance  how a runtime node came to exist
-- 3. GATED OBJECTS: investigation_objects.gated. open_investigation never
--    seeds a gated object; investigation_object_index never lists a gated
--    object that is not revealed AND visible to the caller (no code, title,
--    category, breadcrumb or count). Children of an unrevealed gated object
--    stay invisible through 026's ancestor chain (missing row → fail closed).
--    Only two protected functions are re-created, each verbatim from its
--    canonical body (020 / 026) plus ONE marked clause.
-- 4. CASCADE: deferred constraint triggers (fire at COMMIT, after the
--    player's action is complete) call _runtime_cascade, which:
--      • takes pg_advisory_xact_lock per session (one cascade per session
--        at a time; held to commit);
--      • fires each approved rule at most once per (session, actor-key)
--        through the firing ledger (cycle-proof by construction);
--      • is bounded: ≤ 32 firings per transaction and ≤ 8 productive
--        passes; an overrun raises RUNTIME_CASCADE_LIMIT and every runtime
--        effect of that cascade rolls back (subtransaction, ledger claims
--        included) — the player's own action still commits and the fault is
--        logged (_runtime_cascade_safe), so bad content cannot lock a session;
--      • is deterministic: rules in (sort_order, rule_id) order, passes
--        until a pass fires nothing;
--      • never deadlocks a player's action: while holding the session lock
--        an effect waits ≤ 250 ms for a row another transaction holds; on
--        timeout only that firing is undone (subtransaction, ledger claim
--        included) and it fires in the holder's own commit-time cascade.
-- 5. PRIVACY INVARIANTS (engine rules, not content flags):
--      • team-scope rules see TEAM-KNOWN state only (shared objects with a
--        fully shared ancestor chain, team-visible evidence per 035's
--        _board_material_team_visible, shared leads, world states,
--        validated connections) — a private find can never cause a team
--        effect;
--      • actor-scope rules see the actor's own authorized view and may only
--        open/follow/close the actor's OWN UNSHARED lead, reveal privately, or
--        advance an object that is the actor's own unshared find — never a
--        world state, a team-visible lead, or material delivery;
--      • world-delivered material is RUNTIME-ONLY (requires = {@RUNTIME}):
--        unlock_evidence refuses it for every player path, so aftermath can
--        never be fetched before the world event that causes it;
--      • a cascade caused by read-time processing completion (auto-advance)
--        is a SYSTEM cascade (actor NULL): it evaluates team rules only and
--        is never attributed to the player whose read settled it.
-- 6. PULSE: a teammate learns THAT a private discovery happened, never
--    WHAT. Emitted only for private discoveries of nodes with an authored
--    category; never for initial/open-case grants or team-visible changes;
--    unmapped → no pulse (fail closed). session_pulses carries no code,
--    title, body, place, time context, channel, specialization, rule or
--    count. Pulses never feed AuthorizedKnowledge, search, connections,
--    entities, AI or hypothesis testing (application rule + tests).
--    Fixed taxonomy (coarse activity only, never why it matters):
--    PERSON PLACE TIME DEVICE MOVEMENT PHYSICAL_TRACE RECORD NEW_ACTION.
-- 7. PROCESSING JOBS: unchanged (processing_until + auto_advance settled
--    on the next authoritative read/action, sql/019). No scheduler.
-- 8. OPEN-CASE GRANTS ARE NOT DISCOVERIES. A non-gated ROOT object is
--    seeded known + shared by open_investigation: `object_discovered` on it
--    never holds at runtime and an approved rule may not name it (it would
--    fire at case open). discovered = true is never proof of discovery on
--    its own: object_discovered holds only for a gated object (a runtime
--    reveal — never progress) or a non-gated CHILD found through play
--    (progress). A root still yields progress through a non-initial
--    object_state reached by a player action.
-- 9. APPROVED-RULE GUARDS. Authored content an APPROVED rule was validated
--    against cannot change meaning underneath it (set the rule to draft
--    first, edit, re-approve → the validator re-checks):
--      evidence            code / case_id / delete (any approved reference);
--                          + requires / is_initial when an approved rule
--                          delivers it (runtime-only must stay runtime-only)
--      investigation_objects  code / case_id / gated / initial_state /
--                          parent_code / delete — for a referenced object
--                          AND every ancestor of one (topology)
--      case_leads          lead_code / case_id / delete
--      case_world_states   state_code / case_id / major / delete
--      TRUNCATE of any of them while any approved rule exists
--    INTENTIONALLY MUTABLE (no invariant depends on them): titles, bodies,
--    descriptions, media, interactions, auto_advance, state_descriptions,
--    sort orders, lead label (re-run the TS lint), lead / node pulse
--    category, world-state headline / body / presentation.
-- 10. ATOMIC: the whole migration runs in one transaction (BEGIN … COMMIT).
--     Every statement below is transaction-safe (no CONCURRENTLY, no VACUUM,
--     no ALTER TYPE … ADD VALUE); any failure rolls everything back.
-- ============================================================

begin;

-- ============================================================
-- 0. GATED OBJECTS — static column on the locked content table
-- ============================================================
alter table public.investigation_objects
  add column if not exists gated boolean not null default false;

comment on column public.investigation_objects.gated is
  '037: true = the object does not exist for players until a runtime reveal effect creates its session row (private to the actor or team-wide). Never seeded by open_investigation; never listed unrevealed.';

-- ============================================================
-- 1. AUTHORED RUNTIME CONTENT (server-only)
-- ============================================================
create table if not exists public.case_runtime_nodes (
  case_id        text not null references public.cases(id) on delete cascade,
  node_kind      text not null check (node_kind in ('object', 'evidence')),
  node_code      text not null check (node_code ~ '^[A-Z0-9_-]{1,64}$'),
  pulse_category text not null check (pulse_category in
                   ('PERSON','PLACE','TIME','DEVICE','MOVEMENT','PHYSICAL_TRACE','RECORD','NEW_ACTION')),
  primary key (case_id, node_kind, node_code)
);

create table if not exists public.case_leads (
  case_id        text not null references public.cases(id) on delete cascade,
  lead_code      text not null check (lead_code ~ '^[A-Z0-9_-]{1,64}$'),
  -- player-facing, safe: a direction ("someone used the service route"),
  -- never the answer. Shown only to players who hold/see the lead.
  label          text not null check (char_length(label) between 1 and 200),
  pulse_category text check (pulse_category in
                   ('PERSON','PLACE','TIME','DEVICE','MOVEMENT','PHYSICAL_TRACE','RECORD','NEW_ACTION')),
  sort_order     integer not null default 0,
  primary key (case_id, lead_code)
);

create table if not exists public.case_world_states (
  case_id      text not null references public.cases(id) on delete cascade,
  state_code   text not null check (state_code ~ '^[A-Z0-9_-]{1,64}$'),
  -- major = case reality changes (found / died / reclassified). A major
  -- world state can never be reached by evidence conditions alone.
  major        boolean not null default true,
  presentation text not null default 'broadcast' check (presentation in ('broadcast', 'blackout', 'silent')),
  headline     text not null check (char_length(headline) between 1 and 200),
  body         text not null default '' check (char_length(body) <= 1000),
  sort_order   integer not null default 0,
  primary key (case_id, state_code)
);

create table if not exists public.case_runtime_rules (
  case_id    text not null references public.cases(id) on delete cascade,
  rule_id    text not null check (rule_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  status     text not null default 'draft' check (status in ('draft', 'approved')),
  scope      text not null check (scope in ('actor', 'team')),
  -- all-of. [{"kind":"object_state","object":"X","states":["S"]}, …]
  conditions jsonb not null check (jsonb_typeof(conditions) = 'array'
                                   and jsonb_array_length(conditions) between 1 and 8),
  -- [{"kind":"reveal_object","object":"M1"}, {"kind":"reach_world_state","state":"W"}, …]
  effects    jsonb not null check (jsonb_typeof(effects) = 'array'
                                   and jsonb_array_length(effects) between 1 and 8),
  sort_order integer not null default 0,
  note       text check (note is null or char_length(note) <= 500),
  primary key (case_id, rule_id)
);

alter table public.case_runtime_nodes  enable row level security;
alter table public.case_leads          enable row level security;
alter table public.case_world_states   enable row level security;
alter table public.case_runtime_rules  enable row level security;
-- (no policies — locked, RPC-only, same as evidence / investigation_objects)

-- ============================================================
-- 2. SESSION RUNTIME STATE
-- ============================================================
create table if not exists public.session_leads (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  lead_code   text not null,
  holder      uuid references auth.users(id) on delete set null,  -- null = team lead
  is_shared   boolean not null default false,
  shared_by   uuid references auth.users(id) on delete set null,
  shared_at   timestamptz,
  status      text not null default 'open' check (status in ('open', 'followed', 'closed')),
  opened_at   timestamptz not null default now(),
  followed_at timestamptz,
  closed_at   timestamptz,
  primary key (session_id, lead_code),                           -- one lead instance per session
  check (is_shared or holder is not null),                       -- private ⇒ has a holder
  check ((status = 'closed') = (closed_at is not null))
);

create table if not exists public.session_world_state (
  session_id uuid not null references public.sessions(id) on delete cascade,
  state_code text not null,
  reached_at timestamptz not null default now(),
  primary key (session_id, state_code)                           -- reached once
);

-- SAFE COLUMNS ONLY. Nothing here may identify the discovery.
create table if not exists public.session_pulses (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete set null,  -- null = system (e.g. lab result)
  category   text not null check (category in
               ('PERSON','PLACE','TIME','DEVICE','MOVEMENT','PHYSICAL_TRACE','RECORD','NEW_ACTION')),
  created_at timestamptz not null default now()
);
create index if not exists session_pulses_session_idx on public.session_pulses (session_id, created_at desc);

-- One pulse per logical event (server-only: the key names the source).
create table if not exists public.session_pulse_sources (
  session_id uuid not null references public.sessions(id) on delete cascade,
  source_key text not null,
  pulse_id   uuid not null references public.session_pulses(id) on delete cascade,
  primary key (session_id, source_key)
);

-- Once-only rule-firing ledger. actor_key = '' for team rules, the actor's
-- uuid for actor rules (each player can earn an actor rule once).
create table if not exists public.session_runtime_firings (
  session_id uuid not null references public.sessions(id) on delete cascade,
  rule_id    text not null,
  actor_key  text not null,
  actor_id   uuid references auth.users(id) on delete set null,
  fired_at   timestamptz not null default now(),
  primary key (session_id, rule_id, actor_key)
);

create table if not exists public.session_runtime_effects (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  effect_kind text not null check (effect_kind in ('reveal_object', 'deliver_evidence', 'reach_world_state', 'open_lead', 'effect_error')),
  effect_id   text not null,
  status      text not null check (status in ('applied', 'pending', 'expired', 'skipped', 'error')),
  rule_id     text not null,
  updated_at  timestamptz not null default now(),
  primary key (session_id, effect_kind, effect_id)
);

create table if not exists public.session_runtime_provenance (
  session_id uuid not null references public.sessions(id) on delete cascade,
  node_kind  text not null check (node_kind in ('lead', 'world_state', 'object', 'evidence')),
  node_code  text not null,
  rule_id    text not null,                                       -- server-only, never returned
  actor_id   uuid references auth.users(id) on delete set null,  -- null = system / world
  created_at timestamptz not null default now(),
  primary key (session_id, node_kind, node_code)
);

alter table public.session_leads              enable row level security;
alter table public.session_world_state        enable row level security;
alter table public.session_pulses             enable row level security;
alter table public.session_pulse_sources      enable row level security;
alter table public.session_runtime_firings    enable row level security;
alter table public.session_runtime_effects    enable row level security;
alter table public.session_runtime_provenance enable row level security;

drop policy if exists session_leads_select on public.session_leads;
create policy session_leads_select on public.session_leads
  for select to authenticated
  using (public.is_session_member(session_id) and (is_shared or holder = auth.uid()));

drop policy if exists session_world_state_select on public.session_world_state;
create policy session_world_state_select on public.session_world_state
  for select to authenticated
  using (public.is_session_member(session_id));

drop policy if exists session_pulses_select on public.session_pulses;
create policy session_pulses_select on public.session_pulses
  for select to authenticated
  using (public.is_session_member(session_id));
-- session_pulse_sources / _firings / _effects / _provenance: no policies (RPC-only).

-- ============================================================
-- 3. AUTHORING VALIDATION (shape always; references + causality on approval)
-- ============================================================
create or replace function public._runtime_code_ok(p text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p is not null and p ~ '^[A-Z0-9_-]{1,64}$';
$$;

create or replace function public._runtime_rules_validate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_c        jsonb;
  v_e        jsonb;
  v_kind     text;
  v_progress boolean := false;
  v_world    text;
  v_ev       text;
  v_req      text[];
  v_init     boolean;
begin
  new.rule_id := trim(new.rule_id);

  -- ---- conditions: shape ----
  for v_c in select * from jsonb_array_elements(new.conditions) loop
    v_kind := v_c ->> 'kind';
    if jsonb_typeof(v_c) <> 'object' then
      raise exception 'RUNTIME_RULE_INVALID: condition must be an object';
    elsif v_kind = 'object_discovered' then
      if not public._runtime_code_ok(v_c ->> 'object') then raise exception 'RUNTIME_RULE_INVALID: object_discovered.object'; end if;
    elsif v_kind = 'object_state' then
      if not public._runtime_code_ok(v_c ->> 'object')
         or jsonb_typeof(v_c -> 'states') <> 'array' or jsonb_array_length(v_c -> 'states') not between 1 and 8
         or exists (select 1 from jsonb_array_elements(v_c -> 'states') s
                    where jsonb_typeof(s) <> 'string' or not public._runtime_code_ok(s #>> '{}')) then
        raise exception 'RUNTIME_RULE_INVALID: object_state';
      end if;
    elsif v_kind = 'evidence_unlocked' then
      if not public._runtime_code_ok(v_c ->> 'evidence') then raise exception 'RUNTIME_RULE_INVALID: evidence_unlocked.evidence'; end if;
    elsif v_kind = 'connection_validated' then
      if coalesce(v_c ->> 'rule', '') !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'RUNTIME_RULE_INVALID: connection_validated.rule'; end if;
    elsif v_kind = 'world_state' then
      if not public._runtime_code_ok(v_c ->> 'state') then raise exception 'RUNTIME_RULE_INVALID: world_state.state'; end if;
    elsif v_kind = 'lead' then
      if not public._runtime_code_ok(v_c ->> 'lead')
         or coalesce(v_c ->> 'status', '') not in ('open', 'followed', 'closed') then
        raise exception 'RUNTIME_RULE_INVALID: lead';
      end if;
    else
      raise exception 'RUNTIME_RULE_INVALID: unknown condition kind';
    end if;
  end loop;

  -- ---- effects: shape + scope restrictions ----
  for v_e in select * from jsonb_array_elements(new.effects) loop
    v_kind := v_e ->> 'kind';
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'RUNTIME_RULE_INVALID: effect must be an object';
    elsif v_kind in ('open_lead', 'follow_lead', 'close_lead') then
      if not public._runtime_code_ok(v_e ->> 'lead') then raise exception 'RUNTIME_RULE_INVALID: %.lead', v_kind; end if;
    elsif v_kind = 'reveal_object' then
      if not public._runtime_code_ok(v_e ->> 'object') then raise exception 'RUNTIME_RULE_INVALID: reveal_object.object'; end if;
    elsif v_kind = 'advance_object_state' then
      if not public._runtime_code_ok(v_e ->> 'object') or not public._runtime_code_ok(v_e ->> 'from')
         or not public._runtime_code_ok(v_e ->> 'to') or (v_e ->> 'from') = (v_e ->> 'to') then
        raise exception 'RUNTIME_RULE_INVALID: advance_object_state';
      end if;
    elsif v_kind = 'reach_world_state' then
      if not public._runtime_code_ok(v_e ->> 'state') then raise exception 'RUNTIME_RULE_INVALID: reach_world_state.state'; end if;
      if new.scope = 'actor' then raise exception 'RUNTIME_RULE_SCOPE: an actor rule cannot change the world'; end if;
    elsif v_kind = 'deliver_evidence' then
      if not public._runtime_code_ok(v_e ->> 'evidence') then raise exception 'RUNTIME_RULE_INVALID: deliver_evidence.evidence'; end if;
      if new.scope = 'actor' then raise exception 'RUNTIME_RULE_SCOPE: an actor rule cannot deliver material'; end if;
    else
      raise exception 'RUNTIME_RULE_INVALID: unknown effect kind';
    end if;
  end loop;

  if new.status <> 'approved' then
    return new;
  end if;

  -- ---- approved: every reference exists in THIS case ----
  for v_c in select * from jsonb_array_elements(new.conditions) loop
    v_kind := v_c ->> 'kind';
    if v_kind in ('object_discovered', 'object_state')
       and not exists (select 1 from public.investigation_objects o where o.case_id = new.case_id and o.code = v_c ->> 'object') then
      raise exception 'RUNTIME_RULE_REFERENCE: unknown object';
    elsif v_kind = 'object_discovered'
       and exists (select 1 from public.investigation_objects o
                   where o.case_id = new.case_id and o.code = v_c ->> 'object'
                     and not o.gated and nullif(trim(o.parent_code), '') is null) then
      -- OPEN-CASE GRANT ≠ DISCOVERY: a non-gated root is seeded known by
      -- open_investigation, so this condition would "fire" at case open.
      raise exception 'RUNTIME_RULE_CAUSALITY: object % is known from case open (non-gated root); an open-case grant is not a discovery', v_c ->> 'object';
    elsif v_kind = 'evidence_unlocked'
       and not exists (select 1 from public.evidence e where e.case_id = new.case_id and e.code = v_c ->> 'evidence') then
      raise exception 'RUNTIME_RULE_REFERENCE: unknown evidence';
    elsif v_kind = 'connection_validated'
       and not exists (select 1 from public.case_connection_rules r where r.case_id = new.case_id and r.rule_id = v_c ->> 'rule' and r.status = 'approved') then
      raise exception 'RUNTIME_RULE_REFERENCE: unknown or unapproved connection rule';
    elsif v_kind = 'world_state'
       and not exists (select 1 from public.case_world_states w where w.case_id = new.case_id and w.state_code = v_c ->> 'state') then
      raise exception 'RUNTIME_RULE_REFERENCE: unknown world state';
    elsif v_kind = 'lead'
       and not exists (select 1 from public.case_leads l where l.case_id = new.case_id and l.lead_code = v_c ->> 'lead') then
      raise exception 'RUNTIME_RULE_REFERENCE: unknown lead';
    end if;
  end loop;

  for v_e in select * from jsonb_array_elements(new.effects) loop
    v_kind := v_e ->> 'kind';
    if v_kind in ('open_lead', 'follow_lead', 'close_lead')
       and not exists (select 1 from public.case_leads l where l.case_id = new.case_id and l.lead_code = v_e ->> 'lead') then
      raise exception 'RUNTIME_RULE_REFERENCE: unknown lead';
    elsif v_kind = 'reveal_object'
       and not exists (select 1 from public.investigation_objects o
                       where o.case_id = new.case_id and o.code = v_e ->> 'object' and o.gated) then
      raise exception 'RUNTIME_RULE_REFERENCE: reveal target must be a gated object of this case';
    elsif v_kind = 'advance_object_state'
       and not exists (select 1 from public.investigation_objects o where o.case_id = new.case_id and o.code = v_e ->> 'object') then
      raise exception 'RUNTIME_RULE_REFERENCE: unknown object';
    elsif v_kind = 'reach_world_state'
       and not exists (select 1 from public.case_world_states w where w.case_id = new.case_id and w.state_code = v_e ->> 'state') then
      raise exception 'RUNTIME_RULE_REFERENCE: unknown world state';
    elsif v_kind = 'deliver_evidence' then
      select e.requires, e.is_initial into v_req, v_init from public.evidence e where e.case_id = new.case_id and e.code = v_e ->> 'evidence';
      if not found then
        raise exception 'RUNTIME_RULE_REFERENCE: unknown evidence';
      end if;
      -- RUNTIME-ONLY MATERIAL: delivered material must carry exactly the
      -- unsatisfiable sentinel requires '{@RUNTIME}' (no evidence row can have
      -- that code), so the authoritative unlock_evidence — and every player
      -- path through it (direct RPC, challenges, connections, legacy panel) —
      -- refuses it forever. Only the world (_runtime_try_deliver) delivers it.
      -- is_initial material is granted by open_case regardless of requires,
      -- so runtime-only material can never be initial either.
      if coalesce(v_req, '{}') <> array['@RUNTIME']::text[] or v_init then
        raise exception 'RUNTIME_RULE_CAUSALITY: delivered material must be runtime-only (requires = {@RUNTIME}, not initial)';
      end if;
    end if;
  end loop;

  -- ---- approved: INVESTIGATION PROGRESS (inductive — no laundering) ----
  -- A condition is progress only if no evidence-only rule could have made
  -- it true on its own:
  --   object_discovered  — only a NON-gated CHILD object found through play
  --                        (a reveal is not an act; an open-case root is
  --                        not a discovery and is refused above)
  --   object_state       — only states that exclude the object's initial state
  --                        (reached by a player action or a progress-gated advance)
  --   connection_validated, lead followed/closed — player acts / progress-gated effects
  --   world_state        — only a MAJOR world state (itself progress-gated)
  -- and every effect that manufactures progress (follow/close lead, advance
  -- object state, reach a major world state) itself requires progress.
  for v_c in select * from jsonb_array_elements(new.conditions) loop
    v_kind := v_c ->> 'kind';
    if (v_kind = 'object_discovered'
          and exists (select 1 from public.investigation_objects o
                      where o.case_id = new.case_id and o.code = v_c ->> 'object' and not o.gated
                        and nullif(trim(o.parent_code), '') is not null))
       or (v_kind = 'object_state'
          and exists (select 1 from public.investigation_objects o
                      where o.case_id = new.case_id and o.code = v_c ->> 'object'
                        and not (v_c -> 'states') @> to_jsonb(o.initial_state)))
       or v_kind = 'connection_validated'
       or (v_kind = 'lead' and v_c ->> 'status' in ('followed', 'closed'))
       or (v_kind = 'world_state'
          and exists (select 1 from public.case_world_states w
                      where w.case_id = new.case_id and w.state_code = v_c ->> 'state' and w.major)) then
      v_progress := true;
    end if;
  end loop;
  if not v_progress and exists (select 1 from jsonb_array_elements(new.effects) e
                                where e ->> 'kind' in ('follow_lead', 'close_lead', 'advance_object_state')) then
    raise exception 'RUNTIME_RULE_CAUSALITY: following/closing a lead or advancing an object needs investigation progression, not evidence alone';
  end if;

  -- ---- approved: WORLD-STATE CAUSALITY INVARIANT ----
  for v_e in select * from jsonb_array_elements(new.effects) where value ->> 'kind' = 'reach_world_state' loop
    v_world := v_e ->> 'state';
    if exists (select 1 from public.case_world_states w where w.case_id = new.case_id and w.state_code = v_world and w.major) then
      -- (a) a major world state needs real investigation progression, never evidence alone
      if not v_progress then
        raise exception 'RUNTIME_RULE_CAUSALITY: major world state % needs investigation progression, not evidence alone', v_world;
      end if;
      -- (b) never caused by its own aftermath: no condition may be material
      --     that an approved rule delivers BECAUSE this world state was reached
      for v_ev in select c ->> 'evidence' from jsonb_array_elements(new.conditions) c where c ->> 'kind' = 'evidence_unlocked' loop
        if exists (
          select 1 from public.case_runtime_rules r
          where r.case_id = new.case_id and r.status = 'approved' and r.rule_id <> new.rule_id
            and r.conditions @> jsonb_build_array(jsonb_build_object('kind', 'world_state', 'state', v_world))
            and r.effects @> jsonb_build_array(jsonb_build_object('kind', 'deliver_evidence', 'evidence', v_ev))
        ) then
          raise exception 'RUNTIME_RULE_CAUSALITY: % is aftermath of % and cannot cause it', v_ev, v_world;
        end if;
      end loop;
    end if;
    -- (c) a rule cannot require the world state it reaches
    if new.conditions @> jsonb_build_array(jsonb_build_object('kind', 'world_state', 'state', v_world)) then
      raise exception 'RUNTIME_RULE_CAUSALITY: rule requires the world state it reaches';
    end if;
  end loop;

  -- (b') the other direction: this rule delivers aftermath of W — refuse if an
  --      approved rule reaching a MAJOR W conditions on that same material.
  for v_e in select * from jsonb_array_elements(new.effects) where value ->> 'kind' = 'deliver_evidence' loop
    for v_world in select c ->> 'state' from jsonb_array_elements(new.conditions) c where c ->> 'kind' = 'world_state' loop
      if exists (
        select 1 from public.case_runtime_rules r
        join public.case_world_states w on w.case_id = r.case_id and w.state_code = v_world and w.major
        where r.case_id = new.case_id and r.status = 'approved' and r.rule_id <> new.rule_id
          and r.effects @> jsonb_build_array(jsonb_build_object('kind', 'reach_world_state', 'state', v_world))
          and r.conditions @> jsonb_build_array(jsonb_build_object('kind', 'evidence_unlocked', 'evidence', v_e ->> 'evidence'))
      ) then
        raise exception 'RUNTIME_RULE_CAUSALITY: % is aftermath of % and cannot cause it', v_e ->> 'evidence', v_world;
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- APPROVED-RULE GUARDS (header §9). Authored content that an APPROVED rule
-- was validated against cannot change meaning underneath it. The author
-- sets the dependent rules to draft, edits, then re-approves (the
-- validator re-checks; `update case_runtime_rules set status = status
-- where case_id = … and status = 'approved'` re-runs it on every rule).
-- SECURITY DEFINER: the lookup must always see every approved rule,
-- whatever role edits content (an RLS-limited editor must not see zero
-- rules and pass — fail closed). When the CASE row itself is gone (ON
-- DELETE CASCADE from cases), the whole case is going: nothing to protect.
-- ------------------------------------------------------------

-- A world state's causality class / identity cannot change under approved rules.
create or replace function public._runtime_world_states_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.major is not distinct from old.major and new.state_code is not distinct from old.state_code
     and new.case_id is not distinct from old.case_id then
    return new;
  end if;
  if not exists (select 1 from public.cases c where c.id = old.case_id) then
    return coalesce(new, old);
  end if;
  if exists (select 1 from public.case_runtime_rules r
             where r.case_id = old.case_id and r.status = 'approved'
               and (r.conditions @> jsonb_build_array(jsonb_build_object('kind', 'world_state', 'state', old.state_code))
                    or r.effects @> jsonb_build_array(jsonb_build_object('kind', 'reach_world_state', 'state', old.state_code)))) then
    raise exception 'RUNTIME_RULE_CAUSALITY: world state % is used by approved rules; set them to draft first', old.state_code;
  end if;
  return coalesce(new, old);
end;
$$;

-- Leads: identity (lead_code, case_id) and existence. label / pulse_category /
-- sort_order stay editable (no invariant depends on them).
create or replace function public._runtime_leads_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.lead_code is not distinct from old.lead_code and new.case_id is not distinct from old.case_id then
    return new;
  end if;
  if not exists (select 1 from public.cases c where c.id = old.case_id) then
    return coalesce(new, old);
  end if;
  if exists (select 1 from public.case_runtime_rules r
             where r.case_id = old.case_id and r.status = 'approved'
               and (exists (select 1 from jsonb_array_elements(r.conditions) c
                            where c ->> 'kind' = 'lead' and c ->> 'lead' = old.lead_code)
                    or exists (select 1 from jsonb_array_elements(r.effects) e
                               where e ->> 'kind' in ('open_lead', 'follow_lead', 'close_lead') and e ->> 'lead' = old.lead_code))) then
    raise exception 'RUNTIME_RULE_GUARD: lead % is used by approved runtime rules; set them to draft first', old.lead_code;
  end if;
  return coalesce(new, old);
end;
$$;

-- Evidence: identity (code, case_id) and existence while ANY approved rule
-- references it; requires / is_initial while an approved rule DELIVERS it
-- (runtime-only material must never become player-unlockable or initial).
create or replace function public._runtime_evidence_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity  boolean;
  v_delivered boolean;
begin
  v_identity := tg_op = 'DELETE' or new.code is distinct from old.code or new.case_id is distinct from old.case_id;
  if not v_identity and new.requires is not distinct from old.requires and new.is_initial is not distinct from old.is_initial then
    return new;
  end if;
  if not exists (select 1 from public.cases c where c.id = old.case_id) then
    return coalesce(new, old);
  end if;
  v_delivered := exists (select 1 from public.case_runtime_rules r
                         where r.case_id = old.case_id and r.status = 'approved'
                           and r.effects @> jsonb_build_array(jsonb_build_object('kind', 'deliver_evidence', 'evidence', old.code)));
  if v_delivered
     or (v_identity and exists (select 1 from public.case_runtime_rules r
                                where r.case_id = old.case_id and r.status = 'approved'
                                  and r.conditions @> jsonb_build_array(jsonb_build_object('kind', 'evidence_unlocked', 'evidence', old.code)))) then
    raise exception 'RUNTIME_RULE_GUARD: evidence % is used by approved runtime rules; set them to draft first', old.code;
  end if;
  return coalesce(new, old);
end;
$$;

-- Investigation objects: code / case_id / gated / initial_state / parent_code
-- and existence, for an object an approved rule references AND for every
-- ancestor of one (re-parenting or un-gating an ancestor changes who can
-- reach the referenced object — the topology the rule was approved on).
create or replace function public._runtime_objects_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.code is not distinct from old.code and new.case_id is not distinct from old.case_id
     and new.gated is not distinct from old.gated and new.initial_state is not distinct from old.initial_state
     and new.parent_code is not distinct from old.parent_code then
    return new;
  end if;
  if not exists (select 1 from public.cases c where c.id = old.case_id) then
    return coalesce(new, old);
  end if;
  if exists (
    with recursive sub(code, depth) as (
      select old.code, 0
      union
      select o.code, sub.depth + 1
      from public.investigation_objects o join sub on upper(trim(o.parent_code)) = upper(trim(sub.code))
      where o.case_id = old.case_id and sub.depth < 9
    )
    select 1 from sub
    join public.case_runtime_rules r on r.case_id = old.case_id and r.status = 'approved'
    where exists (select 1 from jsonb_array_elements(r.conditions) c
                  where c ->> 'kind' in ('object_discovered', 'object_state') and c ->> 'object' = sub.code)
       or exists (select 1 from jsonb_array_elements(r.effects) e
                  where e ->> 'kind' in ('reveal_object', 'advance_object_state') and e ->> 'object' = sub.code)
  ) then
    raise exception 'RUNTIME_RULE_GUARD: object % is used by approved runtime rules (directly or as an ancestor); set them to draft first', old.code;
  end if;
  return coalesce(new, old);
end;
$$;

-- TRUNCATE skips row triggers: refuse it on guarded content while any rule is approved.
create or replace function public._runtime_truncate_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.case_runtime_rules r where r.status = 'approved') then
    raise exception 'RUNTIME_RULE_GUARD: % has content used by approved runtime rules; set them to draft first', tg_table_name;
  end if;
  return null;
end;
$$;

drop trigger if exists case_world_states_guard on public.case_world_states;
create trigger case_world_states_guard
  before update or delete on public.case_world_states
  for each row execute function public._runtime_world_states_guard();

drop trigger if exists case_leads_runtime_guard on public.case_leads;
create trigger case_leads_runtime_guard
  before update or delete on public.case_leads
  for each row execute function public._runtime_leads_guard();

drop trigger if exists evidence_runtime_guard on public.evidence;
create trigger evidence_runtime_guard
  before update or delete on public.evidence
  for each row execute function public._runtime_evidence_guard();

drop trigger if exists investigation_objects_runtime_guard on public.investigation_objects;
create trigger investigation_objects_runtime_guard
  before update or delete on public.investigation_objects
  for each row execute function public._runtime_objects_guard();

do $$
declare
  t text;
begin
  foreach t in array array['evidence', 'investigation_objects', 'case_leads', 'case_world_states'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_runtime_truncate_guard', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public._runtime_truncate_guard()',
                   t || '_runtime_truncate_guard', t);
  end loop;
end $$;

drop trigger if exists case_runtime_rules_validate on public.case_runtime_rules;
create trigger case_runtime_rules_validate
  before insert or update on public.case_runtime_rules
  for each row execute function public._runtime_rules_validate();

-- ============================================================
-- 4. GATED OBJECTS — the two re-created protected functions
-- ============================================================

-- ------------------------------------------------------------
-- open_investigation — verbatim 020 + ONE clause: gated objects are never
-- seeded (they get a row only from a runtime reveal).
-- ------------------------------------------------------------
create or replace function public.open_investigation(p_session uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case  text;
  v_count integer;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;

  insert into public.session_object_state (session_id, object_code, state, discovered, is_shared)
  select
    p_session,
    o.code,
    o.initial_state,
    (o.parent_code is null),   -- root objects start already "known"
    (o.parent_code is null)    -- and are shared world-state, not a private finding
  from public.investigation_objects o
  where o.case_id = v_case
    and not o.gated  -- 037: gated objects exist only once revealed
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- investigation_object_index — verbatim 026 + ONE clause: a gated object
-- is listed only when revealed AND visible to the caller (shared or mine).
-- A teammate's private reveal is NOT even listed as redacted.
-- ------------------------------------------------------------
create or replace function public.investigation_object_index(p_session uuid)
returns table (
  code        text,
  category    text,
  parent_code text,
  title       text,
  description text,
  state       text,
  discovered  boolean,
  is_shared   boolean,
  processing  boolean,
  actions     jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case  text;
  v_specs specialization[];
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;
  perform public._advance_processed_objects(p_session, v_case);

  v_specs := public.my_specializations(p_session);

  return query
  select
    o.code,
    o.category,
    o.parent_code,
    o.title,
    case when v.visible then coalesce(o.state_descriptions ->> sos.state, o.state_descriptions ->> o.initial_state, '') else '' end,
    case when v.visible then sos.state else 'HIDDEN' end,
    sos.discovered,
    sos.is_shared,
    case when v.visible then (sos.processing_until is not null and sos.processing_until > now()) else false end,
    case when v.visible then coalesce(
      (
        select jsonb_agg(jsonb_build_object('code', i ->> 'code', 'label', i ->> 'label', 'spec', i ->> 'spec'))
        from jsonb_array_elements(o.interactions) as i
        where (i ->> 'requires_state') = sos.state
          and (i ->> 'spec')::specialization = any(v_specs)
          and (
            coalesce((i ->> 'requires_shared')::boolean, false) = false
            or sos.is_shared
          )
      ),
      '[]'::jsonb
    ) else '[]'::jsonb end
  from public.investigation_objects o
  join public.session_object_state sos
    on sos.session_id = p_session and sos.object_code = o.code
  cross join lateral (
    select (sos.is_shared or sos.discovered_by = auth.uid() or not sos.discovered) as visible
  ) v
  where o.case_id = v_case
    -- 026: every ancestor must exist, be discovered, and be shared or mine
    -- (fail closed). Replaces "parent discovered by anyone".
    and public._object_ancestors_known(p_session, v_case, o.code)
    and (not o.gated or (sos.discovered and (sos.is_shared or sos.discovered_by = auth.uid())))  -- 037
  order by o.sort_order, o.code;
end;
$$;

-- ============================================================
-- 5. CASCADE HELPERS (internal; never client-executable)
-- ============================================================

-- Team-known object: discovered + shared, and EVERY ancestor discovered +
-- shared (caller-independent; stricter than any one player's view).
create or replace function public._runtime_object_team_known(p_session uuid, p_case text, p_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code   text := upper(trim(coalesce(p_code, '')));
  v_parent text;
  v_seen   text[] := '{}';
  v_depth  integer := 0;
begin
  if v_code = '' then
    return false;
  end if;
  loop
    v_depth := v_depth + 1;
    if v_depth > 9 or v_code = any(v_seen) then
      return false;                                       -- depth / cycle: fail closed
    end if;
    v_seen := v_seen || v_code;
    if not exists (select 1 from public.session_object_state sos
                   where sos.session_id = p_session and sos.object_code = v_code
                     and sos.discovered and sos.is_shared) then
      return false;
    end if;
    select nullif(upper(trim(o.parent_code)), '') into v_parent
    from public.investigation_objects o where o.case_id = p_case and o.code = v_code;
    if not found then
      return false;
    end if;
    exit when v_parent is null;
    v_code := v_parent;
  end loop;
  return true;
end;
$$;

-- One condition from a perspective. p_actor NULL = team perspective.
-- Actor perspective is always the CALLER (auth.uid()); anything else fails closed.
create or replace function public._runtime_condition_holds(
  p_session uuid,
  p_case    text,
  p_cond    jsonb,
  p_actor   uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kind   text := p_cond ->> 'kind';
  v_sos    public.session_object_state%rowtype;
  v_gated  boolean;
  v_parent text;
  v_eid    uuid;
  v_lead   public.session_leads%rowtype;
begin
  if p_actor is not null and p_actor is distinct from auth.uid() then
    return false;
  end if;

  if v_kind in ('object_discovered', 'object_state') then
    select * into v_sos from public.session_object_state
    where session_id = p_session and object_code = p_cond ->> 'object';
    if not found or not v_sos.discovered then
      return false;
    end if;
    if v_kind = 'object_discovered' then
      -- OPEN-CASE GRANT ≠ DISCOVERY: discovered = true alone proves nothing.
      -- A non-gated root is seeded known by open_investigation → never a
      -- discovery. Only a revealed gated object or a non-gated child found
      -- through play satisfies object_discovered. Unknown object → closed.
      select o.gated, nullif(trim(o.parent_code), '') into v_gated, v_parent
      from public.investigation_objects o where o.case_id = p_case and o.code = v_sos.object_code;
      if not found or (not v_gated and v_parent is null) then
        return false;
      end if;
    end if;
    if p_actor is null then
      if not public._runtime_object_team_known(p_session, p_case, v_sos.object_code) then return false; end if;
    else
      if not coalesce(public._object_state_row_visible(p_session, v_sos.object_code), false) then return false; end if;
    end if;
    if v_kind = 'object_state' then
      return exists (select 1 from jsonb_array_elements_text(p_cond -> 'states') s where s = v_sos.state);
    end if;
    return true;

  elsif v_kind = 'evidence_unlocked' then
    select e.id into v_eid
    from public.session_evidence se join public.evidence e on e.id = se.evidence_id
    where se.session_id = p_session and e.case_id = p_case and e.code = p_cond ->> 'evidence';
    if v_eid is null then
      return false;
    end if;
    if p_actor is null then
      return coalesce(public._board_material_team_visible(p_session, 'evidence', p_cond ->> 'evidence'), false);
    end if;
    return coalesce(public._evidence_readable(p_session, v_eid), false);

  elsif v_kind = 'connection_validated' then
    return exists (select 1 from public.session_validated_connections c
                   where c.session_id = p_session and c.rule_id = p_cond ->> 'rule');

  elsif v_kind = 'world_state' then
    return exists (select 1 from public.session_world_state w
                   where w.session_id = p_session and w.state_code = p_cond ->> 'state');

  elsif v_kind = 'lead' then
    select * into v_lead from public.session_leads
    where session_id = p_session and lead_code = p_cond ->> 'lead';
    if not found then
      return false;
    end if;
    if not (v_lead.is_shared or (p_actor is not null and v_lead.holder = p_actor)) then
      return false;
    end if;
    return case p_cond ->> 'status'
      when 'open'     then true
      when 'followed' then v_lead.followed_at is not null
      when 'closed'   then v_lead.status = 'closed'
      else false end;
  end if;

  return false;                                             -- unknown kind: fail closed
end;
$$;

-- Record a provenance row once.
create or replace function public._runtime_provenance(p_session uuid, p_kind text, p_code text, p_rule text, p_actor uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.session_runtime_provenance (session_id, node_kind, node_code, rule_id, actor_id)
  values (p_session, p_kind, p_code, p_rule, p_actor)
  on conflict do nothing;
$$;

-- Deliver runtime-only material (requires = {@RUNTIME}, which unlock_evidence
-- always refuses). Same readability rule as every unlock (035
-- _evidence_readable) and the same expiry rule; no other path can insert it.
-- Only a real player (the caller) can receive it; a SYSTEM cascade, or a
-- caller who cannot read it, leaves it PENDING — retried by every later
-- cascade/settle of a member (as that member) until a reader receives it.
create or replace function public._runtime_try_deliver(p_session uuid, p_code text, p_rule text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_case   text;
  v_ev     public.evidence%rowtype;
  v_now    numeric;
begin
  select status into v_status from public.session_runtime_effects
  where session_id = p_session and effect_kind = 'deliver_evidence' and effect_id = p_code;
  if v_status in ('applied', 'expired', 'error') then
    return;                                                  -- never twice
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;
  select * into v_ev from public.evidence e where e.case_id = v_case and e.code = p_code;
  if not found or v_ev.requires is distinct from array['@RUNTIME']::text[] then
    v_status := 'error';                                     -- content fault: logged, final
  elsif p_actor is null or p_actor is distinct from auth.uid()
        or not coalesce(public._evidence_readable(p_session, v_ev.id), false) then
    v_status := 'pending';
  else
    if v_ev.expires_ck is not null then
      select cc.now_ck into v_now from public.case_clock(p_session) cc;
    end if;
    if v_now is not null and v_now > v_ev.expires_ck then
      v_status := 'expired';
    else
      insert into public.session_evidence (session_id, evidence_id, unlocked_by)
      values (p_session, v_ev.id, p_actor)
      on conflict do nothing;
      v_status := 'applied';
    end if;
  end if;

  insert into public.session_runtime_effects (session_id, effect_kind, effect_id, status, rule_id)
  values (p_session, 'deliver_evidence', p_code, v_status, p_rule)
  on conflict (session_id, effect_kind, effect_id)
  do update set status = excluded.status, updated_at = now();

  if v_status = 'applied' then
    perform public._runtime_provenance(p_session, 'evidence', p_code, p_rule, p_actor);
  end if;
end;
$$;

-- Content fault (authored row removed/changed after approval): logged once,
-- never surfaced to the player, never aborts the player's action (027 rule).
create or replace function public._runtime_content_error(p_session uuid, p_kind text, p_rule text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.session_runtime_effects (session_id, effect_kind, effect_id, status, rule_id)
  values (p_session, 'effect_error', coalesce(p_kind, '?') || ':' || p_rule, 'error', p_rule)
  on conflict do nothing;
$$;

-- Apply one effect. p_actor NULL = team rule fired by a SYSTEM cascade.
create or replace function public._runtime_apply_effect(
  p_session uuid,
  p_case    text,
  p_eff     jsonb,
  p_scope   text,
  p_actor   uuid,
  p_rule    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind  text := p_eff ->> 'kind';
  v_code  text;
  v_obj   public.investigation_objects%rowtype;
  v_ws    public.case_world_states%rowtype;
  v_rows  integer;
begin
  if v_kind = 'open_lead' then
    v_code := p_eff ->> 'lead';
    if not exists (select 1 from public.case_leads l where l.case_id = p_case and l.lead_code = v_code) then
      perform public._runtime_content_error(p_session, v_kind, p_rule);
      return;
    end if;
    if p_scope = 'team' then
      -- team open: create shared, or PROMOTE an existing private lead to the
      -- team (one lead per session; the original holder stays for provenance;
      -- shared_by stays as is — the world, not a player, shared it).
      insert into public.session_leads (session_id, lead_code, holder, is_shared, shared_at)
      values (p_session, v_code, null, true, now())
      on conflict (session_id, lead_code) do update
        set is_shared = true,
            shared_at = coalesce(public.session_leads.shared_at, now())
        where not public.session_leads.is_shared;
    else
      -- actor open: create mine if absent; never steal another player's
      -- private lead, never downgrade a shared one
      insert into public.session_leads (session_id, lead_code, holder, is_shared)
      values (p_session, v_code, p_actor, false)
      on conflict do nothing;
    end if;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      perform public._runtime_provenance(p_session, 'lead', v_code, p_rule, p_actor);
    end if;

  elsif v_kind in ('follow_lead', 'close_lead') then
    v_code := p_eff ->> 'lead';
    update public.session_leads l
    set status      = case when v_kind = 'close_lead' then 'closed' else (case when l.status = 'closed' then 'closed' else 'followed' end) end,
        followed_at = case when v_kind = 'follow_lead' then coalesce(l.followed_at, now()) else l.followed_at end,
        closed_at   = case when v_kind = 'close_lead' then coalesce(l.closed_at, now()) else l.closed_at end
    where l.session_id = p_session and l.lead_code = v_code
      and case when p_scope = 'team' then l.is_shared
               else (not l.is_shared and l.holder = p_actor) end;
    -- a team rule touches only a team-visible lead; an actor rule only its
    -- own UNSHARED lead (a private find never changes what the team sees)

  elsif v_kind = 'reveal_object' then
    v_code := p_eff ->> 'object';
    select * into v_obj from public.investigation_objects o where o.case_id = p_case and o.code = v_code;
    if not found or not v_obj.gated then
      perform public._runtime_content_error(p_session, v_kind, p_rule);
      return;
    end if;
    if p_scope = 'team' then
      insert into public.session_object_state (session_id, object_code, state, discovered, discovered_by, is_shared, shared_at)
      values (p_session, v_code, v_obj.initial_state, true, null, true, now())
      on conflict (session_id, object_code) do update
        set discovered = true,
            is_shared  = true,
            shared_at  = coalesce(public.session_object_state.shared_at, now()),
            updated_at = now()
        where not (public.session_object_state.discovered and public.session_object_state.is_shared);
    else
      insert into public.session_object_state (session_id, object_code, state, discovered, discovered_by, is_shared)
      values (p_session, v_code, v_obj.initial_state, true, p_actor, false)
      on conflict (session_id, object_code) do update
        set discovered = true, discovered_by = p_actor, updated_at = now()
        where not public.session_object_state.discovered;   -- someone else's reveal stays theirs
    end if;
    insert into public.session_runtime_effects (session_id, effect_kind, effect_id, status, rule_id)
    values (p_session, 'reveal_object', v_code, 'applied', p_rule)
    on conflict do nothing;
    perform public._runtime_provenance(p_session, 'object', v_code, p_rule, p_actor);

  elsif v_kind = 'advance_object_state' then
    v_code := p_eff ->> 'object';
    if p_scope = 'team' then
      update public.session_object_state
      set state = p_eff ->> 'to', processing_until = null, updated_at = now()
      where session_id = p_session and object_code = v_code and state = p_eff ->> 'from'
        and public._runtime_object_team_known(p_session, p_case, v_code);
    else
      -- actor rule: only the actor's OWN, UNSHARED find (never a team object)
      update public.session_object_state
      set state = p_eff ->> 'to', processing_until = null, updated_at = now()
      where session_id = p_session and object_code = v_code and state = p_eff ->> 'from'
        and discovered and not is_shared and discovered_by = p_actor
        and public._object_ancestors_known(p_session, p_case, v_code);
    end if;

  elsif v_kind = 'reach_world_state' and p_scope = 'team' then
    v_code := p_eff ->> 'state';
    select * into v_ws from public.case_world_states w where w.case_id = p_case and w.state_code = v_code;
    if not found then
      perform public._runtime_content_error(p_session, v_kind, p_rule);
      return;
    end if;
    insert into public.session_world_state (session_id, state_code) values (p_session, v_code)
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      insert into public.session_runtime_effects (session_id, effect_kind, effect_id, status, rule_id)
      values (p_session, 'reach_world_state', v_code, 'applied', p_rule)
      on conflict do nothing;
      perform public._runtime_provenance(p_session, 'world_state', v_code, p_rule, p_actor);
      -- Presentation reuses the existing broadcast/blackout channel (010).
      -- unique (session_id, milestone_code) keeps one broadcast even while a
      -- legacy milestone with the same code still exists.
      if v_ws.presentation in ('broadcast', 'blackout') then
        insert into public.session_events (session_id, milestone_code, kind, headline, body)
        values (p_session, v_code, v_ws.presentation::milestone_kind, v_ws.headline, v_ws.body)
        on conflict (session_id, milestone_code) do nothing;
      end if;
    end if;

  elsif v_kind = 'deliver_evidence' and p_scope = 'team' then
    perform public._runtime_try_deliver(p_session, p_eff ->> 'evidence', p_rule, p_actor);

  else
    -- unknown / scope-forbidden effect reached runtime: content fault, logged, never surfaced
    perform public._runtime_content_error(p_session, v_kind, p_rule);
  end if;
end;
$$;

-- ------------------------------------------------------------
-- THE CASCADE. One per session at a time; bounded; deterministic.
--   p_actor NULL  → SYSTEM cascade (team rules only, no attribution)
--   p_actor = me  → team rules + my actor rules (from my authorized view)
-- ------------------------------------------------------------
create or replace function public._runtime_cascade(p_session uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_passes   constant integer := 8;
  c_max_firings  constant integer := 32;   -- per TRANSACTION, across cascades
  v_case    text;
  v_rule    public.case_runtime_rules%rowtype;
  v_pass    integer := 0;
  v_fired   integer;
  v_total   integer;
  v_key     text;
  v_ok      boolean;
  v_cond    jsonb;
  v_eff     jsonb;
  v_new     integer;
  v_prev_lt text;
begin
  if p_session is null then
    return;
  end if;
  if p_actor is not null and p_actor is distinct from auth.uid() then
    p_actor := null;                                         -- never act as someone else
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;
  if v_case is null then
    return;
  end if;
  -- fast path: nothing authored → nothing to do (no lock taken)
  if not exists (select 1 from public.case_runtime_rules r where r.case_id = v_case and r.status = 'approved') then
    return;
  end if;
  -- re-entrancy guard (belt and braces: triggers are deferred, so a cascade
  -- never runs inside another)
  if coalesce(current_setting('ifada.runtime_active', true), '') = 'on' then
    return;
  end if;

  -- SERIALIZATION: one runtime cascade per session at a time, held to commit.
  perform pg_advisory_xact_lock(hashtextextended('ifada.runtime:' || p_session::text, 0));
  perform set_config('ifada.runtime_active', 'on', true);
  -- NO DEADLOCKS: while holding the session lock, an effect never waits on a
  -- row another transaction holds (that transaction may be queued behind us
  -- for this very lock). A firing that hits a held row is undone as a unit
  -- (subtransaction: its ledger claim too) and fires in the row holder's own
  -- commit-time cascade, or on the next settle — delayed, never lost.
  v_prev_lt := current_setting('lock_timeout');
  perform set_config('lock_timeout', '250ms', true);

  -- a real member's cascade retries pending world deliveries as that member
  if p_actor is not null then
    for v_eff in
      select jsonb_build_object('evidence', effect_id, 'rule', rule_id) from public.session_runtime_effects
      where session_id = p_session and effect_kind = 'deliver_evidence' and status = 'pending'
      order by effect_id
    loop
      begin
        perform public._runtime_try_deliver(p_session, v_eff ->> 'evidence', v_eff ->> 'rule', p_actor);
      exception when lock_not_available then
        null;                                               -- stays pending; retried later
      end;
    end loop;
  end if;

  loop
    v_pass := v_pass + 1;
    v_fired := 0;

    for v_rule in
      select * from public.case_runtime_rules r
      where r.case_id = v_case and r.status = 'approved'
      order by r.sort_order, r.rule_id
    loop
      if v_rule.scope = 'actor' and p_actor is null then
        continue;
      end if;
      v_key := case when v_rule.scope = 'team' then '' else p_actor::text end;

      if exists (select 1 from public.session_runtime_firings f
                 where f.session_id = p_session and f.rule_id = v_rule.rule_id and f.actor_key = v_key) then
        continue;                                            -- once-only
      end if;

      v_ok := true;
      for v_cond in select * from jsonb_array_elements(v_rule.conditions) loop
        if not public._runtime_condition_holds(p_session, v_case, v_cond,
                                                case when v_rule.scope = 'team' then null else p_actor end) then
          v_ok := false;
          exit;
        end if;
      end loop;
      continue when not v_ok;

      begin
        insert into public.session_runtime_firings (session_id, rule_id, actor_key, actor_id)
        values (p_session, v_rule.rule_id, v_key, p_actor)
        on conflict do nothing;
        get diagnostics v_new = row_count;
        if v_new > 0 then
          v_total := coalesce(nullif(current_setting('ifada.runtime_firings', true), '')::integer, 0) + 1;
          perform set_config('ifada.runtime_firings', v_total::text, true);
          if v_total > c_max_firings then
            raise exception 'RUNTIME_CASCADE_LIMIT';        -- aborts the whole transaction
          end if;

          for v_eff in select * from jsonb_array_elements(v_rule.effects) loop
            perform public._runtime_apply_effect(p_session, v_case, v_eff, v_rule.scope, p_actor, v_rule.rule_id);
          end loop;
          v_fired := v_fired + 1;
        end if;
      exception when lock_not_available then
        null;                                               -- held row: firing undone, retried later
      end;
    end loop;

    exit when v_fired = 0;
    -- pass c_max_passes + 1 runs only to prove quiescence: if it still fires, runaway
    if v_pass > c_max_passes then
      raise exception 'RUNTIME_CASCADE_LIMIT';
    end if;
  end loop;

  perform set_config('lock_timeout', v_prev_lt, true);
  perform set_config('ifada.runtime_active', '', true);
end;
$$;

-- ------------------------------------------------------------
-- Runaway containment. The cascade runs in a subtransaction: on
-- RUNTIME_CASCADE_LIMIT every runtime effect of THIS cascade is rolled back
-- (ledger claims included), a fault is logged, and the player's own action
-- still commits — bad content can stall the runtime, never lock the game.
-- Any other error propagates (a real bug must not be hidden).
-- ------------------------------------------------------------
create or replace function public._runtime_cascade_safe(p_session uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public._runtime_cascade(p_session, p_actor);
  exception when others then
    if sqlerrm <> 'RUNTIME_CASCADE_LIMIT' then
      raise;
    end if;
    perform set_config('ifada.runtime_active', '', true);
    insert into public.session_runtime_effects (session_id, effect_kind, effect_id, status, rule_id)
    values (p_session, 'effect_error', 'cascade_limit', 'error', '*')
    on conflict (session_id, effect_kind, effect_id) do update set updated_at = now();
  end;
end;
$$;

-- ------------------------------------------------------------
-- Pulse emission — the ONLY writer of session_pulses. One pulse per
-- source key; unmapped category → nothing (fail closed).
-- ------------------------------------------------------------
create or replace function public._runtime_emit_pulse(p_session uuid, p_source text, p_actor uuid, p_category text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_category is null or p_source is null then
    return;
  end if;
  if exists (select 1 from public.session_pulse_sources ps where ps.session_id = p_session and ps.source_key = p_source) then
    return;
  end if;
  insert into public.session_pulses (session_id, actor_id, category)
  values (p_session, p_actor, p_category)
  returning id into v_id;
  insert into public.session_pulse_sources (session_id, source_key, pulse_id)
  values (p_session, p_source, v_id)
  on conflict do nothing;
  if not found then
    delete from public.session_pulses where id = v_id;       -- lost a race: keep exactly one
  end if;
end;
$$;

-- ============================================================
-- 6. DEFERRED TRIGGERS (fire at COMMIT, after the action is complete)
-- ============================================================
create or replace function public._runtime_on_object_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case      text;
  v_cat       text;
  v_system    boolean := false;
  v_auto_to   text;
begin
  select s.case_id into v_case from public.sessions s where s.id = new.session_id;
  if v_case is null then
    return null;
  end if;

  -- Read-time processing completion (019 auto_advance): SYSTEM, not the reader.
  if tg_op = 'UPDATE' and old.processing_until is not null and old.processing_until <= now()
     and new.processing_until is null and new.state is distinct from old.state then
    select o.auto_advance ->> old.state into v_auto_to
    from public.investigation_objects o where o.case_id = v_case and o.code = new.object_code;
    v_system := (v_auto_to is not distinct from new.state);
  end if;

  select n.pulse_category into v_cat from public.case_runtime_nodes n
  where n.case_id = v_case and n.node_kind = 'object' and n.node_code = new.object_code;

  if v_cat is not null then
    -- private discovery (reveal or inspection) → pulse; team-visible → none
    if new.discovered and not new.is_shared and new.discovered_by is not null
       and (tg_op = 'INSERT' or not coalesce(old.discovered, false)) then
      perform public._runtime_emit_pulse(new.session_id, 'object:' || new.object_code, new.discovered_by, v_cat);
    end if;
    -- private processing result arriving (system actor) → pulse
    if v_system and new.discovered and not new.is_shared then
      perform public._runtime_emit_pulse(new.session_id, 'result:' || new.object_code || '@' || new.state, null, v_cat);
    end if;
  end if;

  perform public._runtime_cascade_safe(new.session_id, case when v_system then null else auth.uid() end);
  return null;
end;
$$;

create or replace function public._runtime_on_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case    text;
  v_ev      public.evidence%rowtype;
  v_cat     text;
begin
  select s.case_id into v_case from public.sessions s where s.id = new.session_id;
  select * into v_ev from public.evidence e where e.id = new.evidence_id;
  if v_case is null or not found then
    return null;
  end if;

  -- initial/open-case grants never pulse; team-visible unlocks never pulse
  if not v_ev.is_initial and new.unlocked_by is not null
     and not coalesce(public._board_material_team_visible(new.session_id, 'evidence', v_ev.code), false) then
    select n.pulse_category into v_cat from public.case_runtime_nodes n
    where n.case_id = v_case and n.node_kind = 'evidence' and n.node_code = v_ev.code;
    perform public._runtime_emit_pulse(new.session_id, 'evidence:' || v_ev.code, new.unlocked_by, v_cat);
  end if;

  perform public._runtime_cascade_safe(new.session_id, auth.uid());
  return null;
end;
$$;

create or replace function public._runtime_on_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat text;
begin
  if tg_op = 'INSERT' and not new.is_shared and new.holder is not null then
    select l.pulse_category into v_cat
    from public.case_leads l join public.sessions s on s.case_id = l.case_id
    where s.id = new.session_id and l.lead_code = new.lead_code;
    perform public._runtime_emit_pulse(new.session_id, 'lead:' || new.lead_code, new.holder, v_cat);
  end if;
  perform public._runtime_cascade_safe(new.session_id, auth.uid());
  return null;
end;
$$;

create or replace function public._runtime_on_team_fact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._runtime_cascade_safe(new.session_id, auth.uid());
  return null;
end;
$$;

drop trigger if exists runtime_object_state_changed on public.session_object_state;
create constraint trigger runtime_object_state_changed
  after insert or update on public.session_object_state
  deferrable initially deferred
  for each row execute function public._runtime_on_object_state();

drop trigger if exists runtime_evidence_unlocked on public.session_evidence;
create constraint trigger runtime_evidence_unlocked
  after insert on public.session_evidence
  deferrable initially deferred
  for each row execute function public._runtime_on_evidence();

drop trigger if exists runtime_lead_changed on public.session_leads;
create constraint trigger runtime_lead_changed
  after insert or update on public.session_leads
  deferrable initially deferred
  for each row execute function public._runtime_on_lead();

drop trigger if exists runtime_connection_validated on public.session_validated_connections;
create constraint trigger runtime_connection_validated
  after insert on public.session_validated_connections
  deferrable initially deferred
  for each row execute function public._runtime_on_team_fact();

drop trigger if exists runtime_world_state_reached on public.session_world_state;
create constraint trigger runtime_world_state_reached
  after insert on public.session_world_state
  deferrable initially deferred
  for each row execute function public._runtime_on_team_fact();

-- ============================================================
-- 7. PUBLIC RPCs
-- ============================================================

-- Caller-scoped read model (fail closed). No rule ids, no pulse sources,
-- no teammate's private lead, no unrevealed/teammate-private gated object.
create or replace function public.runtime_state(p_session uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_case text;
  v_me   uuid := auth.uid();
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;
  select s.case_id into v_case from public.sessions s where s.id = p_session;

  return jsonb_build_object(
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object(
               'lead', sl.lead_code, 'label', cl.label, 'status', sl.status,
               'shared', sl.is_shared, 'mine', sl.holder = v_me,
               'opened_at', sl.opened_at) order by cl.sort_order, sl.lead_code)
      from public.session_leads sl
      join public.case_leads cl on cl.case_id = v_case and cl.lead_code = sl.lead_code
      where sl.session_id = p_session and (sl.is_shared or sl.holder = v_me)
    ), '[]'::jsonb),
    'world', coalesce((
      select jsonb_agg(jsonb_build_object('state', w.state_code, 'headline', cw.headline, 'reached_at', w.reached_at)
                       order by w.reached_at, w.state_code)
      from public.session_world_state w
      join public.case_world_states cw on cw.case_id = v_case and cw.state_code = w.state_code
      where w.session_id = p_session
    ), '[]'::jsonb),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object('code', o.code, 'title', o.title, 'category', o.category, 'shared', sos.is_shared)
                       order by o.sort_order, o.code)
      from public.investigation_objects o
      join public.session_object_state sos on sos.session_id = p_session and sos.object_code = o.code
      where o.case_id = v_case and o.gated
        and coalesce(public._object_state_row_visible(p_session, o.code), false)
    ), '[]'::jsonb),
    'pulses', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'actor', p.actor_id, 'category', p.category, 'at', p.created_at)
                       order by p.created_at desc)
      from (select * from public.session_pulses
            where session_id = p_session order by created_at desc limit 50) p
    ), '[]'::jsonb)
  );
end;
$$;

-- How a runtime node came to exist — only for nodes the caller can see.
-- cause is generic; the authored rule id never leaves the server.
create or replace function public.runtime_provenance(p_session uuid)
returns table (node_kind text, node_code text, actor_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_case text;
  v_me   uuid := auth.uid();
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;
  select s.case_id into v_case from public.sessions s where s.id = p_session;

  return query
  select p.node_kind, p.node_code, p.actor_id, p.created_at
  from public.session_runtime_provenance p
  where p.session_id = p_session
    and case p.node_kind
      when 'world_state' then true
      when 'lead' then exists (select 1 from public.session_leads l
                               where l.session_id = p_session and l.lead_code = p.node_code
                                 and (l.is_shared or l.holder = v_me))
      when 'object' then coalesce(public._object_state_row_visible(p_session, p.node_code), false)
      when 'evidence' then exists (select 1 from public.evidence e
                                   where e.case_id = v_case and e.code = p.node_code
                                     and public._evidence_row_visible(p_session, e.id))
      else false end
  order by p.created_at;
end;
$$;

-- Share my private lead with the team (mirrors share_object_discovery).
-- One neutral refusal for missing / not mine.
create or replace function public.share_lead(p_session uuid, p_lead text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.session_leads%rowtype;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;
  select * into v_lead from public.session_leads
  where session_id = p_session and lead_code = upper(trim(coalesce(p_lead, '')))
  for update;
  if not found or not (v_lead.is_shared or v_lead.holder = auth.uid()) then
    raise exception 'LEAD_NOT_FOUND';
  end if;
  update public.session_leads
  set is_shared = true, shared_by = auth.uid(), shared_at = now()
  where session_id = p_session and lead_code = v_lead.lead_code and not is_shared;
  return true;
end;
$$;

-- Settle: retry pending deliveries as me (035 readability decides whether I
-- may receive them), then evaluate team rules + my actor rules from my own
-- view. Safe to call on every load; idempotent; returns nothing.
create or replace function public.runtime_settle(p_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;
  -- takes the per-session lock itself (and is a no-op without approved rules);
  -- retries pending deliveries as me, then evaluates team + my actor rules.
  perform public._runtime_cascade_safe(p_session, auth.uid());
end;
$$;

-- ============================================================
-- 8. REALTIME — signal tables only (RLS filters per subscriber)
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array['session_leads', 'session_world_state', 'session_pulses'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- 9. PERMISSIONS — explicit final state
-- ============================================================
-- Authored + server-only session tables: nothing for any client role.
revoke all on table public.case_runtime_nodes         from public, anon, authenticated;
revoke all on table public.case_leads                 from public, anon, authenticated;
revoke all on table public.case_world_states          from public, anon, authenticated;
revoke all on table public.case_runtime_rules         from public, anon, authenticated;
revoke all on table public.session_pulse_sources      from public, anon, authenticated;
revoke all on table public.session_runtime_firings    from public, anon, authenticated;
revoke all on table public.session_runtime_effects    from public, anon, authenticated;
revoke all on table public.session_runtime_provenance from public, anon, authenticated;

-- Member-readable signal tables: SELECT only (writes are server-only).
revoke all on table public.session_leads       from public, anon, authenticated;
revoke all on table public.session_world_state from public, anon, authenticated;
revoke all on table public.session_pulses      from public, anon, authenticated;
grant select on table public.session_leads       to authenticated;
grant select on table public.session_world_state to authenticated;
grant select on table public.session_pulses      to authenticated;

-- Internal helpers + trigger functions: never client-executable.
revoke all on function public._runtime_code_ok(text)                                     from public, anon, authenticated;
revoke all on function public._runtime_rules_validate()                                  from public, anon, authenticated;
revoke all on function public._runtime_world_states_guard()                              from public, anon, authenticated;
revoke all on function public._runtime_leads_guard()                                     from public, anon, authenticated;
revoke all on function public._runtime_evidence_guard()                                  from public, anon, authenticated;
revoke all on function public._runtime_objects_guard()                                   from public, anon, authenticated;
revoke all on function public._runtime_truncate_guard()                                  from public, anon, authenticated;
revoke all on function public._runtime_object_team_known(uuid, text, text)               from public, anon, authenticated;
revoke all on function public._runtime_condition_holds(uuid, text, jsonb, uuid)          from public, anon, authenticated;
revoke all on function public._runtime_provenance(uuid, text, text, text, uuid)          from public, anon, authenticated;
revoke all on function public._runtime_content_error(uuid, text, text)                   from public, anon, authenticated;
revoke all on function public._runtime_try_deliver(uuid, text, text, uuid)               from public, anon, authenticated;
revoke all on function public._runtime_apply_effect(uuid, text, jsonb, text, uuid, text) from public, anon, authenticated;
revoke all on function public._runtime_cascade(uuid, uuid)                               from public, anon, authenticated;
revoke all on function public._runtime_cascade_safe(uuid, uuid)                          from public, anon, authenticated;
revoke all on function public._runtime_emit_pulse(uuid, text, uuid, text)                from public, anon, authenticated;
revoke all on function public._runtime_on_object_state()                                 from public, anon, authenticated;
revoke all on function public._runtime_on_evidence()                                     from public, anon, authenticated;
revoke all on function public._runtime_on_lead()                                         from public, anon, authenticated;
revoke all on function public._runtime_on_team_fact()                                    from public, anon, authenticated;

-- Public RPCs: authenticated only.
revoke all on function public.runtime_state(uuid)       from public, anon;
revoke all on function public.runtime_provenance(uuid)  from public, anon;
revoke all on function public.share_lead(uuid, text)    from public, anon;
revoke all on function public.runtime_settle(uuid)      from public, anon;
grant execute on function public.runtime_state(uuid)      to authenticated;
grant execute on function public.runtime_provenance(uuid) to authenticated;
grant execute on function public.share_lead(uuid, text)   to authenticated;
grant execute on function public.runtime_settle(uuid)     to authenticated;

-- Re-created protected functions: authenticated only. create or replace
-- preserves ACLs, so this is restated explicitly. 019 revoked
-- open_investigation from PUBLIC only — on Supabase the default privileges
-- also grant anon EXECUTE on every new public function, so 037 revokes anon
-- here too (verify_037_preapply reports the live state as INFO).
revoke execute on function public.investigation_object_index(uuid) from public, anon;
revoke execute on function public.open_investigation(uuid)         from public, anon;
grant execute on function public.investigation_object_index(uuid) to authenticated;
grant execute on function public.open_investigation(uuid)         to authenticated;

commit;
