-- ============================================================
-- IFADA — 025_phase5_workflows.sql
-- Phase 5: Device / CCTV archive / Access workflows.
--
-- NOT YET APPLIED. Local file only, pending Hazem's review.
-- (021 remains an unapplied PROPOSAL; this supersedes its idea with a
--  narrower design — see "EVIDENCE BRIDGE" below.)
--
-- 1. investigation_objects gains two static content columns (fully
--    locked like the rest of the table, per 023):
--      state_workspace — safe per-state tool data (device file index,
--                        archive/access kind), returned only for objects
--                        the caller can see, current state only.
--      yields          — STATE REALIZATIONS only: "this object in state X
--                        IS evidence Y" (e.g. the laptop's recovered draft
--                        is D-01). Used for one-canonical-entry in the Case
--                        File. Tool output is NOT declared here — it is
--                        recorded when it actually happens (point 6).
-- 2. Challenges may be REPEATABLE TOOLS (produces_state NULL).
-- 3. New input kind 'time_window' (optional option pick, e.g. a camera).
-- 4. EVIDENCE BRIDGE: a successful query unlocks real evidence through the
--    existing, authoritative public.unlock_evidence() — owner
--    specialization, expiry and `requires` unchanged. Only its two
--    expected refusals are treated as "not produced"; anything else is a
--    content/runtime fault and surfaces as a generic error.
-- 5. PRIVATE → SHARED BOUNDARY (engine rules, not just content):
--      a. a challenge that can produce evidence is only available on a
--         SHARED object — private work never becomes team-wide evidence;
--      b. nobody can run an interaction on another player's discovered-
--         but-private object; hidden rows expose no actions.
-- 6. Provenance is RECORDED at unlock time (session_evidence_sources),
--    only when the engine itself produced the evidence.
-- 7. New RPCs: run_challenge (jsonb), object_workspace, evidence_provenance.
--    attempt_challenge keeps its signature. execute_object_interaction,
--    investigation_object_index and challenge_index keep their signatures.
-- ============================================================

alter table public.investigation_objects
  add column if not exists state_workspace jsonb not null default '{}'::jsonb,
  add column if not exists yields jsonb not null default '[]'::jsonb;

alter table public.investigation_challenges
  alter column produces_state drop not null;

-- ------------------------------------------------------------
-- Recorded provenance: which tool/object actually produced an evidence
-- row in a session. Written only by _run_challenge. RPC-only.
-- ------------------------------------------------------------
create table if not exists public.session_evidence_sources (
  session_id      uuid not null references public.sessions(id) on delete cascade,
  evidence_code   text not null,
  object_code     text not null,
  challenge_code  text not null,
  unlocked_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (session_id, evidence_code)
);

alter table public.session_evidence_sources enable row level security;
-- (no policies — locked, RPC-only)

-- Privileges: nothing for clients on content/config/log tables (023 lesson:
-- Supabase default grants include TRUNCATE/REFERENCES/TRIGGER).
revoke all on table public.investigation_objects from public, anon, authenticated;
revoke all on table public.investigation_challenges from public, anon, authenticated;
revoke all on table public.session_evidence_sources from public, anon, authenticated;

-- ============================================================
-- PRIVATE OBJECT PROTECTION (replaces 019 definitions, same signatures)
-- ============================================================

-- ------------------------------------------------------------
-- investigation_object_index — identical to 019 except: a row hidden
-- from the caller (someone else's unshared discovery) returns NO actions.
-- The action list itself would otherwise reveal the private object's
-- state progression and invite acting on it.
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
    and (
      o.parent_code is null
      or exists (
        select 1 from public.session_object_state parent_sos
        where parent_sos.session_id = p_session
          and upper(trim(parent_sos.object_code)) = upper(trim(o.parent_code))
          and parent_sos.discovered
      )
    )
  order by o.sort_order, o.code;
end;
$$;

-- ------------------------------------------------------------
-- execute_object_interaction — identical to 019 except: right after
-- locking the row, another player's discovered-but-private object is
-- reported as OBJECT_NOT_FOUND (before interaction/spec/state checks, so
-- nothing about it — not even which interactions exist — is revealed).
-- Discovering a not-yet-discovered object is unchanged.
-- ------------------------------------------------------------
create or replace function public.execute_object_interaction(
  p_session     uuid,
  p_object_code text,
  p_interaction text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case        text;
  v_obj         public.investigation_objects%rowtype;
  v_sos         public.session_object_state%rowtype;
  v_interaction jsonb;
  v_spec        specialization;
  v_requires    text;
  v_produces    text;
  v_seconds     integer;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;
  perform public._advance_processed_objects(p_session, v_case);

  select * into v_obj
  from public.investigation_objects
  where case_id = v_case and code = upper(trim(p_object_code));

  if not found then
    raise exception 'OBJECT_NOT_FOUND';
  end if;

  select * into v_sos
  from public.session_object_state
  where session_id = p_session and object_code = v_obj.code
  for update;

  if not found then
    raise exception 'OBJECT_NOT_FOUND';
  end if;

  -- private boundary: someone else's unshared discovery does not exist for me
  if v_sos.discovered
     and not (v_sos.is_shared or v_sos.discovered_by = auth.uid()) then
    raise exception 'OBJECT_NOT_FOUND';
  end if;

  select i into v_interaction
  from jsonb_array_elements(v_obj.interactions) as i
  where i ->> 'code' = p_interaction
  limit 1;

  if v_interaction is null then
    raise exception 'INTERACTION_NOT_FOUND';
  end if;

  v_spec     := (v_interaction ->> 'spec')::specialization;
  v_requires := v_interaction ->> 'requires_state';
  v_produces := v_interaction ->> 'produces_state';
  v_seconds  := coalesce((v_interaction ->> 'processing_seconds')::integer, 0);

  if not public.has_specialization(p_session, v_spec) then
    raise exception 'WRONG_SPECIALIZATION';
  end if;

  if coalesce((v_interaction ->> 'requires_shared')::boolean, false) and not v_sos.is_shared then
    raise exception 'NOT_SHARED';
  end if;

  -- idempotent no-op: already past this interaction
  if v_sos.state = v_produces then
    return v_sos.state;
  end if;

  if v_sos.state <> v_requires then
    raise exception 'INVALID_STATE';
  end if;

  update public.session_object_state
  set state            = v_produces,
      processing_until = case when v_seconds > 0 then now() + make_interval(secs => v_seconds) else null end,
      discovered       = true,
      discovered_by    = coalesce(discovered_by, auth.uid()),
      updated_at       = now()
  where session_id = p_session and object_code = v_obj.code and state = v_requires;

  if not found then
    raise exception 'INVALID_STATE';
  end if;

  return v_produces;
end;
$$;

-- ============================================================
-- CHALLENGE ENGINE EXTENSIONS
-- ============================================================

-- Internal: can this challenge's (server-only) solution produce evidence?
create or replace function public._challenge_produces_evidence(p_solution jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select exists (
    select 1 from jsonb_array_elements(coalesce(p_solution -> 'targets', '[]'::jsonb)) t
    where t ? 'evidence'
  );
$$;

-- ------------------------------------------------------------
-- challenge_index — identical to 024 except: an evidence-producing
-- challenge is only listed on a SHARED object, matching _run_challenge.
-- ------------------------------------------------------------
create or replace function public.challenge_index(p_session uuid)
returns table (
  code          text,
  object_code   text,
  level         text,
  input_kind    text,
  spec          specialization,
  prompt        text,
  input_config  jsonb,
  my_attempts   integer,
  last_outcome  text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_case  text;
  v_specs specialization[];
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;
  v_specs := public.my_specializations(p_session);

  return query
  select
    c.code,
    c.object_code,
    c.level,
    c.input_kind,
    c.spec,
    c.prompt,
    c.input_config,
    (select count(*)::int from public.session_challenge_attempts a
      where a.session_id = p_session and a.challenge_code = c.code and a.user_id = auth.uid()),
    (select a.outcome from public.session_challenge_attempts a
      where a.session_id = p_session and a.challenge_code = c.code and a.user_id = auth.uid()
      order by a.created_at desc limit 1)
  from public.investigation_challenges c
  join public.session_object_state sos
    on sos.session_id = p_session and sos.object_code = c.object_code
  where c.case_id = v_case
    and c.spec = any(v_specs)
    and sos.discovered
    and (sos.is_shared or sos.discovered_by = auth.uid())
    and sos.state = c.requires_state
    and (not c.requires_shared or sos.is_shared)
    and (not public._challenge_produces_evidence(c.solution) or sos.is_shared)
  order by c.sort_order, c.code;
end;
$$;

-- ------------------------------------------------------------
-- Internal: 'HH:MM' → case-night minutes (1380 = 23:00, 1440 = 00:00).
-- Hours before 12 roll over past midnight (the case night). Accepts
-- Arabic-Indic digits via _challenge_normalize. NULL if malformed.
-- ------------------------------------------------------------
create or replace function public._challenge_night_minutes(p_value text)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := public._challenge_normalize(p_value);
  h int;
  m int;
begin
  if v is null or v !~ '^[0-9]{1,2}:[0-9]{2}$' then
    return null;
  end if;
  h := split_part(v, ':', 1)::int;
  m := split_part(v, ':', 2)::int;
  if h > 23 or m > 59 then
    return null;
  end if;
  return h * 60 + m + case when h < 12 then 1440 else 0 end;
end;
$$;

-- ------------------------------------------------------------
-- Internal: evaluate a time_window query. Returns
--   {"outcome": <code>, "hits": [<evidence code>, …]}
-- hits are CANDIDATES only; unlocking (and its rules) happens in
-- _run_challenge through unlock_evidence().
-- ------------------------------------------------------------
create or replace function public._challenge_evaluate_window(
  p_config   jsonb,
  p_solution jsonb,
  p_input    jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_from   int := public._challenge_night_minutes(p_input ->> 'from');
  v_to     int := public._challenge_night_minutes(p_input ->> 'to');
  v_option text := p_input ->> 'option';
  v_needs_option boolean := jsonb_array_length(coalesce(p_config -> 'options', '[]'::jsonb)) > 0;
  v_hits   jsonb;
begin
  if v_from is null or v_to is null or v_to <= v_from then
    return jsonb_build_object('outcome', 'insufficient', 'hits', '[]'::jsonb);
  end if;

  if v_needs_option and (v_option is null or not exists (
    select 1 from jsonb_array_elements(p_config -> 'options') o where o ->> 'id' = v_option
  )) then
    return jsonb_build_object('outcome', 'insufficient', 'hits', '[]'::jsonb);
  end if;

  if v_to - v_from > coalesce((p_solution ->> 'max_width')::int, 60) then
    return jsonb_build_object('outcome', 'too_broad', 'hits', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(distinct t ->> 'evidence'), '[]'::jsonb) into v_hits
  from jsonb_array_elements(coalesce(p_solution -> 'targets', '[]'::jsonb)) t
  where (t ->> 'at')::int between v_from and v_to
    and (t ->> 'option' is null or t ->> 'option' = v_option);

  if jsonb_array_length(v_hits) = 0 then
    return jsonb_build_object('outcome', 'no_result', 'hits', '[]'::jsonb);
  end if;

  return jsonb_build_object('outcome', 'complete', 'hits', v_hits);
end;
$$;

-- ------------------------------------------------------------
-- Internal: the whole server-authoritative challenge run.
-- Returns {"outcome": <allowlisted code>, "evidence": [<produced codes>]}.
-- ------------------------------------------------------------
create or replace function public._run_challenge(
  p_session   uuid,
  p_challenge text,
  p_input     jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_case     text;
  v_ch       public.investigation_challenges%rowtype;
  v_sos      public.session_object_state%rowtype;
  v_eval     jsonb;
  v_outcome  text;
  v_code     text;
  v_existed  boolean;
  v_unlocked text[] := '{}';
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  if p_input is null or octet_length(p_input::text) > 2000 then
    raise exception 'INPUT_TOO_LARGE';
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;

  select * into v_ch from public.investigation_challenges
  where case_id = v_case and code = upper(trim(p_challenge));

  if not found or not public.has_specialization(p_session, v_ch.spec) then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;

  select * into v_sos from public.session_object_state
  where session_id = p_session and object_code = v_ch.object_code
  for update;

  if not found or not v_sos.discovered
     or not (v_sos.is_shared or v_sos.discovered_by = auth.uid()) then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;

  -- one-shot challenge already solved → idempotent complete
  if v_ch.produces_state is not null and v_sos.state = v_ch.produces_state then
    return jsonb_build_object('outcome', 'complete', 'evidence', '[]'::jsonb);
  end if;

  -- Availability. Engine rule (independent of content flags and of the
  -- input): anything that can produce evidence requires a SHARED object.
  if v_sos.state <> v_ch.requires_state
     or (v_ch.requires_shared and not v_sos.is_shared)
     or (public._challenge_produces_evidence(v_ch.solution) and not v_sos.is_shared) then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;

  if (select count(*) from public.session_challenge_attempts a
      where a.session_id = p_session and a.challenge_code = v_ch.code
        and a.user_id = auth.uid() and a.created_at > now() - interval '60 seconds') >= 6 then
    return jsonb_build_object('outcome', 'throttled', 'evidence', '[]'::jsonb);
  end if;

  if v_ch.input_kind = 'time_window' then
    v_eval := public._challenge_evaluate_window(v_ch.input_config, v_ch.solution, p_input);
  else
    v_eval := jsonb_build_object(
      'outcome', public._challenge_evaluate(v_ch.input_kind, v_ch.input_config, v_ch.solution, v_ch.feedback, p_input),
      'hits', '[]'::jsonb
    );
  end if;

  v_outcome := public._challenge_safe_outcome(v_eval ->> 'outcome', 'no_result');

  -- EVIDENCE BRIDGE. Each candidate goes through the authoritative
  -- unlock_evidence. Only its two EXPECTED refusals mean "not produced"
  -- (answered like a miss — no prerequisite/expiry leak). Anything else
  -- is a content/runtime fault: abort the whole call with a generic error
  -- rather than masking it as an empty search.
  if v_outcome = 'complete' then
    for v_code in select jsonb_array_elements_text(coalesce(v_eval -> 'hits', '[]'::jsonb)) loop
      select exists (
        select 1 from public.session_evidence se
        join public.evidence e on e.id = se.evidence_id
        where se.session_id = p_session and e.case_id = v_case and e.code = v_code
      ) into v_existed;

      begin
        perform public.unlock_evidence(p_session, v_code);
        v_unlocked := v_unlocked || v_code;

        -- provenance only when THIS engine run produced it
        if not v_existed then
          insert into public.session_evidence_sources
            (session_id, evidence_code, object_code, challenge_code, unlocked_by)
          values (p_session, v_code, v_ch.object_code, v_ch.code, auth.uid())
          on conflict (session_id, evidence_code) do nothing;
        end if;
      exception when others then
        if sqlerrm not in ('REQUIREMENTS_NOT_MET', 'EVIDENCE_EXPIRED') then
          raise exception 'CHALLENGE_CONTENT_ERROR';
        end if;
      end;
    end loop;

    if jsonb_array_length(coalesce(v_eval -> 'hits', '[]'::jsonb)) > 0 and cardinality(v_unlocked) = 0 then
      v_outcome := 'no_result';
    end if;
  end if;

  insert into public.session_challenge_attempts (session_id, challenge_code, user_id, input, outcome)
  values (p_session, v_ch.code, auth.uid(), p_input, v_outcome);

  if v_outcome = 'complete' and v_ch.produces_state is not null then
    update public.session_object_state
    set state = v_ch.produces_state, processing_until = null, updated_at = now()
    where session_id = p_session and object_code = v_ch.object_code and state = v_ch.requires_state;
  end if;

  if cardinality(v_unlocked) > 0 then
    begin
      perform public.check_milestones(p_session);
    exception when others then
      raise exception 'CHALLENGE_INTERNAL_ERROR';
    end;
  end if;

  return jsonb_build_object('outcome', v_outcome, 'evidence', to_jsonb(v_unlocked));
end;
$$;

-- attempt_challenge keeps its 024 signature and grants; now a thin wrapper.
create or replace function public.attempt_challenge(
  p_session   uuid,
  p_challenge text,
  p_input     jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._run_challenge(p_session, p_challenge, p_input) ->> 'outcome';
end;
$$;

create or replace function public.run_challenge(
  p_session   uuid,
  p_challenge text,
  p_input     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._run_challenge(p_session, p_challenge, p_input);
end;
$$;

-- ------------------------------------------------------------
-- RPC: object_workspace — safe tool data for objects the caller can see
-- (own or shared, same rule as 022), for their CURRENT state only.
-- ------------------------------------------------------------
create or replace function public.object_workspace(p_session uuid)
returns table (object_code text, workspace jsonb)
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
  select o.code, o.state_workspace -> sos.state
  from public.investigation_objects o
  join public.session_object_state sos
    on sos.session_id = p_session and sos.object_code = o.code
  where o.case_id = v_case
    and sos.discovered
    and (sos.is_shared or sos.discovered_by = auth.uid())
    and o.state_workspace ? sos.state;
end;
$$;

-- ------------------------------------------------------------
-- RPC: evidence_provenance — for evidence already unlocked in this
-- session, where it came from. Two facts, never inference:
--   1. RECORDED: the engine produced it via a tool (session_evidence_sources).
--   2. REALIZED: an object the caller can see reached the state that IS
--      that evidence (yields.when_state), e.g. laptop → D-01.
-- Source objects must be visible to the caller.
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

  union

  select y ->> 'evidence', o.code, o.title, o.category
  from public.investigation_objects o
  join public.session_object_state sos
    on sos.session_id = p_session and sos.object_code = o.code
  cross join lateral jsonb_array_elements(o.yields) y
  where o.case_id = v_case
    and sos.discovered
    and (sos.is_shared or sos.discovered_by = auth.uid())
    and y ? 'when_state'
    and y ->> 'when_state' = sos.state
    and exists (
      select 1 from public.session_evidence se
      join public.evidence e on e.id = se.evidence_id
      where se.session_id = p_session and e.case_id = v_case and e.code = y ->> 'evidence'
    );
end;
$$;

-- ------------------------------------------------------------
-- Function privileges. Supabase grants EXECUTE on new public functions to
-- anon/authenticated by default — internal helpers revoked from all three.
-- Replaced functions (index/interaction/challenge_index/attempt_challenge)
-- keep their existing grants under create or replace.
-- ------------------------------------------------------------
revoke all on function public._challenge_produces_evidence(jsonb) from public, anon, authenticated;
revoke all on function public._challenge_night_minutes(text) from public, anon, authenticated;
revoke all on function public._challenge_evaluate_window(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._run_challenge(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.run_challenge(uuid, text, jsonb) from public, anon;
revoke all on function public.object_workspace(uuid) from public, anon;
revoke all on function public.evidence_provenance(uuid) from public, anon;
-- Replaced 019 RPCs: state their grants explicitly so a fresh apply
-- reproduces the corrected live permissions (not relying on prior grants).
revoke execute on function public.execute_object_interaction(uuid, text, text) from public, anon;
revoke execute on function public.investigation_object_index(uuid) from public, anon;
revoke execute on function public.challenge_index(uuid) from public, anon;
revoke execute on function public.attempt_challenge(uuid, text, jsonb) from public, anon;
grant execute on function public.execute_object_interaction(uuid, text, text) to authenticated;
grant execute on function public.investigation_object_index(uuid) to authenticated;
grant execute on function public.challenge_index(uuid) to authenticated;
grant execute on function public.attempt_challenge(uuid, text, jsonb) to authenticated;
grant execute on function public.run_challenge(uuid, text, jsonb) to authenticated;
grant execute on function public.object_workspace(uuid) to authenticated;
grant execute on function public.evidence_provenance(uuid) to authenticated;

-- ============================================================
-- ROOM 714 — Phase 5 slice. Canon sources (sql/005, 007):
--   D-01  laptop draft, unsent, last modified 23:52           (digital, initial)
--   D-02  floor-7 door-card log for room 714: 23:43 guest card,
--         00:06 Staff Master Key; no other opening that night (digital, requires D-01, expires 01:00)
--   V-03  service-corridor camera, 23:54                      (field, requires V-02, media)
--   V-08  service-elevator camera, 00:08                      (field, media)
--   SECURITY_OFFICE is an existing canon location (007).
-- Nothing below adds a fact; state texts restate canon only.
-- ============================================================

-- LAPTOP → device workspace; its recovered draft IS evidence D-01.
update public.investigation_objects
set category = 'device',
    state_workspace = '{
      "INSPECTED": {"kind": "device", "device": "لابتوب الضحية",
        "files": [{"id": "draft", "name": "مسودة رسالة", "type": "مسودة نصية", "modified": "23:52", "status": "لم تُرسل", "action": "RECOVER_DRAFT"}]},
      "DRAFT_RECOVERED": {"kind": "device", "device": "لابتوب الضحية",
        "files": [{"id": "draft", "name": "مسودة رسالة", "type": "مسودة نصية", "modified": "23:52", "status": "مُستخرجة"}]}
    }'::jsonb,
    yields = '[{"evidence": "D-01", "when_state": "DRAFT_RECOVERED"}]'::jsonb
where case_id = 'room-714' and code = 'LAPTOP';

delete from public.investigation_objects
where case_id = 'room-714' and code in ('DOOR_714', 'SECURITY_OFFICE', 'CCTV_ARCHIVE');

insert into public.investigation_objects
  (case_id, code, parent_code, category, title, initial_state, state_descriptions,
   interactions, auto_advance, state_workspace, yields, sort_order)
values
-- Access object: the room's card-operated door. Its log query is a tool;
-- D-02 provenance is recorded when that query actually produces it.
('room-714', 'DOOR_714', 'ROOM_714', 'access', 'باب الغرفة', 'UNKNOWN',
 '{"DISCOVERED": "باب الغرفة يُفتح ببطاقة. فتحات الباب تُسجَّل بسجل بطاقات الطابق."}'::jsonb,
 '[{"code": "INSPECT", "label": "افحص الباب", "spec": "field", "requires_state": "UNKNOWN", "produces_state": "DISCOVERED", "processing_seconds": 0}]'::jsonb,
 '{}'::jsonb,
 '{"DISCOVERED": {"kind": "access", "lock": "بطاقة", "status": "OPENED"}}'::jsonb,
 '[]'::jsonb,
 16),

-- Second canon location: the hotel security office.
('room-714', 'SECURITY_OFFICE', null, 'location', 'مكتب الأمن', 'KNOWN',
 '{"KNOWN": "مكتب أمن الفندق."}'::jsonb,
 '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, 100),

-- Tool (not evidence): the camera archive. Extracted frames are evidence.
('room-714', 'CCTV_ARCHIVE', 'SECURITY_OFFICE', 'archive', 'أرشيف كاميرات المراقبة', 'UNKNOWN',
 '{"OPEN": "نظام أرشيف الكاميرات جاهز للبحث."}'::jsonb,
 '[{"code": "OPEN_ARCHIVE", "label": "افتح نظام الأرشيف", "spec": "field", "requires_state": "UNKNOWN", "produces_state": "OPEN", "processing_seconds": 0}]'::jsonb,
 '{}'::jsonb,
 '{"OPEN": {"kind": "archive"}}'::jsonb,
 '[]'::jsonb,
 110);

delete from public.investigation_challenges
where case_id = 'room-714' and code in ('DOOR_LOG_QUERY', 'CCTV_ARCHIVE_QUERY');

insert into public.investigation_challenges
  (case_id, code, object_code, level, input_kind, spec, requires_state, requires_shared,
   produces_state, collaborative, prompt, input_config, solution, feedback, sort_order)
values
-- Digital queries the door's access history. The window is derivable
-- from D-01 (last draft edit 23:52), which Digital holds from the start.
-- Field must share the door first (Field → Digital handoff).
('room-714', 'DOOR_LOG_QUERY', 'DOOR_714', 'investigation', 'time_window', 'digital', 'DISCOVERED', true,
 null, true,
 'استعلام في سجل بطاقات الأبواب لهذه الغرفة. حدّد نطاقاً زمنياً للبحث.',
 '{"tool": "access_log", "label": "سجل بطاقات الأبواب"}'::jsonb,
 '{"max_width": 90, "targets": [{"at": 1423, "evidence": "D-02"}, {"at": 1446, "evidence": "D-02"}]}'::jsonb,
 '{}'::jsonb, 20),

-- Field searches the camera archive — only once the archive is shared
-- (also enforced by the engine rule). The useful corridor window comes
-- from combining Kareem's claim (V-02) with the door-log times (D-02,
-- readable only by Digital) — Digital → Field handoff.
('room-714', 'CCTV_ARCHIVE_QUERY', 'CCTV_ARCHIVE', 'investigation', 'time_window', 'field', 'OPEN', true,
 null, true,
 'ابحث في أرشيف الكاميرات: اختر كاميرا وحدّد نطاقاً زمنياً.',
 '{"tool": "cctv_archive", "label": "أرشيف كاميرات المراقبة",
   "options": [{"id": "SERVICE_CORRIDOR", "label": "كاميرا الممر الخدمي"},
               {"id": "SERVICE_ELEVATOR", "label": "كاميرا المصعد الخدمي"}]}'::jsonb,
 '{"max_width": 70, "targets": [{"option": "SERVICE_CORRIDOR", "at": 1434, "evidence": "V-03"},
                                 {"option": "SERVICE_ELEVATOR", "at": 1448, "evidence": "V-08"}]}'::jsonb,
 '{}'::jsonb, 30);
