-- ============================================================
-- IFADA — 026_nested_object_visibility.sql
--
-- STATUS: WRITTEN FOR REVIEW — NOT APPLIED. Run manually in the
-- Supabase SQL Editor only after Hazem approves (see MIGRATIONS.md).
--
-- PRIVACY FIX: CHILD VISIBILITY REQUIRES VALID PARENT VISIBILITY.
--
-- Root cause (019/025): every object-scoped function checked only the
-- object's OWN privacy. investigation_object_index listed a child when
-- its direct parent was "discovered by ANYONE" (one level only), and
-- execute_object_interaction never looked at parents at all. So with
-- VICTIM_ITEMS privately discovered by player A, player B received the
-- child PASSPORT (title, state, actions) and could even act on it.
-- The session_object_state SELECT policy (022) — which also filters
-- realtime payloads — had the same gap for a child shared while its
-- parent stayed private.
--
-- Rule (fail CLOSED): an object is visible/usable to the caller only if
-- its own existing rule passes AND every ancestor in its parent chain
--   * exists in investigation_objects for this case,
--   * is discovered in this session, and
--   * is shared OR discovered by the caller (auth.uid()).
-- A missing parent row, a cycle, or nesting deeper than 8 ancestors
-- makes the object NOT visible, never "valid by default".
-- Objects without a parent (locations) are unaffected; Room 714's
-- room-level objects sit under ROOM_714, which 020 seeds as discovered
-- AND shared, so their behavior is unchanged.
--
-- Hidden-chain objects surface exactly like missing/private ones:
--   index -> absent; interaction -> OBJECT_NOT_FOUND; share ->
--   NOT_DISCOVERED; challenges -> absent / CHALLENGE_NOT_FOUND;
--   workspace/provenance -> absent; direct SELECT/realtime -> no row.
--
-- Changes (no tables, columns, data, or grants widened):
--   + _object_ancestors_known(uuid, text, text)   internal, no EXECUTE for clients
--   + _object_state_row_visible(uuid, text)       RLS-policy helper (EXECUTE: authenticated
--                                                 only; required because policies run as
--                                                 the caller). Answers TRUE only when the
--                                                 COMPLETE row is visible to the caller
--                                                 (membership, row exists, discovered, own
--                                                 privacy, ancestor chain), so a direct RPC
--                                                 call reveals nothing a SELECT would not.
--   ~ investigation_object_index   ~ execute_object_interaction
--   ~ share_object_discovery       ~ challenge_index
--   ~ _run_challenge (run_challenge / attempt_challenge wrap it)
--   ~ object_workspace             ~ evidence_provenance
--   ~ policy session_object_state_select (022) + ancestor chain
-- Each function below is a VERBATIM copy of its current definition
-- (025, or 019 for share_object_discovery) plus only the lines marked
-- "026". Unchanged: open_investigation (returns a row count only),
-- _advance_processed_objects (internal, no output), attempt_challenge /
-- run_challenge (thin wrappers over _run_challenge).
--
-- ORDER / RE-RUN WARNINGS
--   * Run after 025. Idempotent (create or replace / drop policy if exists).
--   * Do NOT re-run 025 after this file: it would restore the pre-026
--     functions and silently reopen the leak. If 019, 022, 024 or 025 is
--     ever re-run by mistake, re-run this file afterwards.
--   * Existing sessions: a child that another player discovered through
--     the old leak (parent still private to someone else) becomes
--     invisible to that player until the parent is shared with them.
--     No rows are deleted or modified.
-- ============================================================

-- ============================================================
-- PRE-APPLY CHECKS — READ-ONLY. Run manually in the SQL Editor BEFORE
-- applying, as the same role that will apply this file. If ANY
-- expectation below fails: STOP, do not apply, report the result.
-- ============================================================
-- P1. Ownership (RLS non-recursion assumption). The policy calls
--     _object_state_row_visible, which reads session_object_state again.
--     That read must bypass RLS: the SECURITY DEFINER helpers must be
--     owned by the owner of every table they read (owners bypass RLS
--     unless FORCE RLS is set — see P3) or by a BYPASSRLS role. New
--     functions are owned by current_user; create-or-replace keeps the
--     existing owner (and requires current_user to own it).
--   select 'table' as kind, c.relname as name,
--          pg_get_userbyid(c.relowner) as owner,
--          pg_get_userbyid(c.relowner) = current_user as owned_by_current_user,
--          r.rolbypassrls as owner_bypassrls
--   from pg_class c join pg_roles r on r.oid = c.relowner
--   where c.relnamespace = 'public'::regnamespace
--     and c.relname in ('session_object_state', 'investigation_objects', 'sessions', 'session_members')
--   union all
--   select 'function', p.proname,
--          pg_get_userbyid(p.proowner),
--          pg_get_userbyid(p.proowner) = current_user,
--          r.rolbypassrls
--   from pg_proc p join pg_roles r on r.oid = p.proowner
--   where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('is_session_member', 'investigation_object_index', 'execute_object_interaction',
--                       'share_object_discovery', 'challenge_index', '_run_challenge',
--                       'object_workspace', 'evidence_provenance')
--   order by 1, 2;
--   expect: 4 table rows + 8 function rows, owned_by_current_user = true
--           on EVERY row (one owner, normally postgres). The two new
--           helpers do not exist yet; they will get this same owner.
--
-- P2. CREATE privilege on schema public for client roles (search_path =
--     public relies on clients being unable to plant objects there).
--   select r.rolname,
--          has_schema_privilege(r.rolname, 'public', 'CREATE') as can_create,
--          has_schema_privilege(r.rolname, 'public', 'USAGE')  as can_use
--   from (values ('public'), ('anon'), ('authenticated')) r(rolname);
--   expect: can_create = false for all three rows.
--
-- P3. RLS enabled and NOT forced on every table the helpers read.
--   select c.relname,
--          c.relrowsecurity      as rls_enabled,
--          c.relforcerowsecurity as rls_forced
--   from pg_class c
--   where c.relnamespace = 'public'::regnamespace
--     and c.relname in ('session_object_state', 'investigation_objects', 'sessions', 'session_members')
--   order by c.relname;
--   expect: 4 rows, rls_enabled = true and rls_forced = false on each.
--
-- P4. No other permissive SELECT policy on session_object_state
--     (permissive policies are OR-ed; an extra one would bypass 026).
--   select policyname, permissive, cmd, roles
--   from pg_policies
--   where schemaname = 'public' and tablename = 'session_object_state';
--   expect: exactly one row — session_object_state_select, PERMISSIVE,
--           SELECT, {authenticated} — and no ALL/INSERT/UPDATE/DELETE rows.
-- ============================================================

-- ------------------------------------------------------------
-- Internal: is every ancestor of p_object_code visible to auth.uid()?
-- Fail closed on: unknown object, missing parent row, cycle, depth > 8,
-- an ancestor with no state row, undiscovered, or someone else's
-- unshared discovery. Returns only a boolean about the CALLER's view.
-- ------------------------------------------------------------
create or replace function public._object_ancestors_known(
  p_session     uuid,
  p_case        text,
  p_object_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_max_depth constant integer := 8;
  v_code   text := upper(trim(coalesce(p_object_code, '')));
  v_parent text;
  v_next   text;
  v_seen   text[];
  v_depth  integer := 0;
  v_sos    public.session_object_state%rowtype;
begin
  if p_session is null or p_case is null or v_code = '' then
    return false;
  end if;

  -- the object itself must exist in this case
  select nullif(upper(trim(o.parent_code)), '') into v_parent
  from public.investigation_objects o
  where o.case_id = p_case and upper(trim(o.code)) = v_code;
  if not found then
    return false;
  end if;

  v_seen := array[v_code];

  while v_parent is not null loop
    v_depth := v_depth + 1;
    if v_depth > c_max_depth then
      return false;                       -- excessive nesting
    end if;
    if v_parent = any(v_seen) then
      return false;                       -- cycle
    end if;
    v_seen := v_seen || v_parent;

    -- the ancestor must exist as an object of this case (missing parent -> hidden)
    select nullif(upper(trim(o.parent_code)), '') into v_next
    from public.investigation_objects o
    where o.case_id = p_case and upper(trim(o.code)) = v_parent;
    if not found then
      return false;
    end if;

    -- ...and be discovered, and shared or mine
    select * into v_sos
    from public.session_object_state sos
    where sos.session_id = p_session and upper(trim(sos.object_code)) = v_parent;
    if not found
       or not coalesce(v_sos.discovered, false)
       or not (coalesce(v_sos.is_shared, false) or v_sos.discovered_by = auth.uid()) then
      return false;
    end if;

    v_parent := v_next;
  end loop;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- RLS-policy helper: is the COMPLETE session_object_state row for
-- (p_session, p_object_code) visible to auth.uid()? Policies are
-- evaluated as the caller, so authenticated needs EXECUTE — which makes
-- this directly callable as an RPC. It therefore checks EVERYTHING the
-- SELECT policy allows on its own (never relying on the policy for any
-- part), so a direct call reveals nothing a SELECT would not:
--   member of the session; object exists in the session's case; a state
--   row exists; the object is discovered; shared or discovered by me;
--   every ancestor known (_object_ancestors_known).
-- Any failure — non-member, unknown session/object, no state row,
-- undiscovered, someone else's private find, hidden ancestor, missing
-- parent, cycle, depth > 8 — returns the same FALSE.
-- ------------------------------------------------------------
create or replace function public._object_state_row_visible(
  p_session     uuid,
  p_object_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_object_code, '')));
  v_case text;
  v_obj  text;
  v_sos  public.session_object_state%rowtype;
begin
  if p_session is null or v_code = '' then
    return false;
  end if;

  -- 1. caller is a member of the session
  if not coalesce(public.is_session_member(p_session), false) then
    return false;
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;
  if not found or v_case is null then
    return false;
  end if;

  -- 2. the object exists in the session's case (canonical stored code)
  select o.code into v_obj
  from public.investigation_objects o
  where o.case_id = v_case and upper(trim(o.code)) = v_code;
  if not found then
    return false;
  end if;

  -- 3. a state row exists for it (primary key lookup)
  select * into v_sos
  from public.session_object_state sos
  where sos.session_id = p_session and sos.object_code = v_obj;
  if not found then
    return false;
  end if;

  -- 4. the object itself is discovered
  if not coalesce(v_sos.discovered, false) then
    return false;
  end if;

  -- 5. its own privacy: shared, or my own discovery
  if not (coalesce(v_sos.is_shared, false) or v_sos.discovered_by = auth.uid()) then
    return false;
  end if;

  -- 6. every ancestor is known to me (fails closed on missing/cycle/depth)
  return coalesce(public._object_ancestors_known(p_session, v_case, v_obj), false);
end;
$$;

-- ------------------------------------------------------------
-- investigation_object_index — verbatim 025 + ancestor chain (replaces parent-discovered-by-anyone)
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
  order by o.sort_order, o.code;
end;
$$;

-- ------------------------------------------------------------
-- execute_object_interaction — verbatim 025 + ancestor chain
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

  -- 026: a child whose ancestor chain is not visible to me does not exist
  -- for me — same neutral error, before any interaction/spec/state check.
  if not public._object_ancestors_known(p_session, v_case, v_obj.code) then
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

-- ------------------------------------------------------------
-- share_object_discovery — verbatim 019 + ancestor chain
-- ------------------------------------------------------------
create or replace function public.share_object_discovery(
  p_session     uuid,
  p_object_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sos  public.session_object_state%rowtype;
  v_case text;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select * into v_sos
  from public.session_object_state
  where session_id = p_session and object_code = upper(trim(p_object_code))
  for update;

  if not found or not v_sos.discovered then
    raise exception 'NOT_DISCOVERED';
  end if;

  -- 026: an object whose ancestor chain is not visible to me cannot be
  -- shared by me — reported exactly like a missing/undiscovered object.
  select s.case_id into v_case from public.sessions s where s.id = p_session;
  if not public._object_ancestors_known(p_session, v_case, v_sos.object_code) then
    raise exception 'NOT_DISCOVERED';
  end if;

  if v_sos.discovered_by is distinct from auth.uid() then
    raise exception 'NOT_YOUR_DISCOVERY';
  end if;

  update public.session_object_state
  set is_shared = true, shared_by = auth.uid(), shared_at = now()
  where session_id = p_session and object_code = v_sos.object_code and not is_shared;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- challenge_index — verbatim 025 + ancestor chain
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
    and public._object_ancestors_known(p_session, v_case, c.object_code)  -- 026
    and sos.state = c.requires_state
    and (not c.requires_shared or sos.is_shared)
    and (not public._challenge_produces_evidence(c.solution) or sos.is_shared)
  order by c.sort_order, c.code;
end;
$$;

-- ------------------------------------------------------------
-- _run_challenge — verbatim 025 + ancestor chain (covers run_challenge / attempt_challenge wrappers)
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
     or not (v_sos.is_shared or v_sos.discovered_by = auth.uid())
     or not public._object_ancestors_known(p_session, v_case, v_ch.object_code) then  -- 026
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

-- ------------------------------------------------------------
-- object_workspace — verbatim 025 + ancestor chain
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
    and public._object_ancestors_known(p_session, v_case, o.code)  -- 026
    and o.state_workspace ? sos.state;
end;
$$;

-- ------------------------------------------------------------
-- evidence_provenance — verbatim 025 + ancestor chain (both branches)
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
    );
end;
$$;

-- ------------------------------------------------------------
-- Direct SELECT + realtime (022 policy) — same boundary as the helper.
-- The row's own columns are checked inline (so the predicate is bound to
-- the exact row being read), and the helper re-checks the SAME
-- conditions for that row plus the ancestor chain. Because the helper
-- alone already requires every inline condition, the effective boundary
-- is exactly _object_state_row_visible(session_id, object_code).
-- ------------------------------------------------------------
drop policy if exists session_object_state_select on public.session_object_state;

create policy session_object_state_select on public.session_object_state
  for select to authenticated
  using (
    public.is_session_member(session_id)
    and discovered                                                 -- 026
    and (is_shared or discovered_by = auth.uid())
    and public._object_state_row_visible(session_id, object_code)  -- 026
  );

-- ------------------------------------------------------------
-- Permissions — explicit final state (nothing widened).
-- ------------------------------------------------------------
revoke all on function public._object_ancestors_known(uuid, text, text) from public, anon, authenticated;
revoke all on function public._object_state_row_visible(uuid, text) from public, anon;
grant execute on function public._object_state_row_visible(uuid, text) to authenticated;

revoke all on function public._run_challenge(uuid, text, jsonb) from public, anon, authenticated;

revoke execute on function public.investigation_object_index(uuid) from public, anon;
revoke execute on function public.execute_object_interaction(uuid, text, text) from public, anon;
revoke execute on function public.share_object_discovery(uuid, text) from public, anon;
revoke execute on function public.challenge_index(uuid) from public, anon;
revoke execute on function public.object_workspace(uuid) from public, anon;
revoke execute on function public.evidence_provenance(uuid) from public, anon;

grant execute on function public.investigation_object_index(uuid) to authenticated;
grant execute on function public.execute_object_interaction(uuid, text, text) to authenticated;
grant execute on function public.share_object_discovery(uuid, text) to authenticated;
grant execute on function public.challenge_index(uuid) to authenticated;
grant execute on function public.object_workspace(uuid) to authenticated;
grant execute on function public.evidence_provenance(uuid) to authenticated;

revoke all on table public.session_object_state from public, anon;
revoke insert, update, delete on table public.session_object_state from authenticated;
grant select on table public.session_object_state to authenticated;

-- ============================================================
-- POST-APPLY VERIFICATION (run manually after applying)
--   Checks 1–3: READ-ONLY (catalog SELECTs only).
--   Check 4:    MUTATING — TEST SESSION ONLY. It performs interactions
--               and a share, and every index call also advances finished
--               processing timers. Never run it in a real player session.
-- ============================================================
-- 1. [READ-ONLY] helper not callable by clients, policy helper only by authenticated:
--   select p.proname, r.rolname,
--          has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
--   from pg_proc p cross join (values ('anon'), ('authenticated')) r(rolname)
--   where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('_object_ancestors_known', '_object_state_row_visible');
--   expect: _object_ancestors_known false/false;
--           _object_state_row_visible anon false, authenticated true.
--
-- 2. [READ-ONLY] every changed function carries the check:
--   select p.proname,
--          position('_object_ancestors_known' in pg_get_functiondef(p.oid)) > 0 as has_chain_check
--   from pg_proc p
--   where p.pronamespace = 'public'::regnamespace
--     and p.proname in ('investigation_object_index', 'execute_object_interaction',
--                       'share_object_discovery', 'challenge_index', '_run_challenge',
--                       'object_workspace', 'evidence_provenance', '_object_state_row_visible');
--   expect: 8 rows, all true.
--
-- 3. [READ-ONLY] policy updated:
--   select qual from pg_policies
--   where schemaname = 'public' and tablename = 'session_object_state'
--     and policyname = 'session_object_state_select';
--   expect: contains discovered AND _object_state_row_visible.
--
-- 4. [MUTATING — TEST SESSION ONLY] manual two-player check
--    (A privately inspects VICTIM_ITEMS, does not share):
--   as B: investigation_object_index returns no PASSPORT row;
--         _object_state_row_visible(<session>, 'VICTIM_ITEMS') = false,
--         _object_state_row_visible(<session>, 'PASSPORT')     = false,
--         _object_state_row_visible(<session>, 'NO_SUCH_CODE') = false;
--         direct SELECT on session_object_state returns neither row.
--   as A: _object_state_row_visible(<session>, 'VICTIM_ITEMS') = true.
--   after A shares VICTIM_ITEMS, PASSPORT appears for B (UNKNOWN, B's
--   normal actions) and B's helper call for VICTIM_ITEMS becomes true.
-- ============================================================
