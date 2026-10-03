-- ============================================================
-- IFADA — 024_investigation_challenges.sql
-- Investigation Challenge Engine (Phase 4).
--
-- NOT YET APPLIED. Local file only, pending Hazem's review.
--
-- A challenge is an alternative way to advance an Investigation
-- Object's state: instead of a one-click interaction, the player must
-- supply a meaningful input (a name, a room, a time range, a choice…)
-- that the SERVER evaluates. Same state machine as 019 — a successful
-- challenge performs the same state transition an interaction would.
--
--   investigation_challenges      — static case content, INCLUDING the
--                                    secret solution/feedback. Zero RLS
--                                    policies, zero grants. RPC-only.
--   session_challenge_attempts    — per-player attempt log. Zero RLS
--                                    policies, zero grants. RPC-only.
--
-- Nothing secret ever leaves the server: challenge_index returns only
-- the prompt and safe input_config; attempt_challenge returns only an
-- outcome code. No answer, accepted-value list, or ordering is exposed.
-- ============================================================

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------
create table if not exists public.investigation_challenges (
  id               uuid primary key default gen_random_uuid(),
  case_id          text not null references public.cases(id) on delete cascade,
  code             text not null,
  object_code      text not null,            -- which Investigation Object it belongs to
  level            text not null check (level in ('micro', 'investigation', 'signature')),
  input_kind       text not null,            -- 'text' | 'choice' today; 'time_range' | 'order' | … later
  spec             specialization not null,  -- who can attempt it
  requires_state   text not null,            -- object state in which it's available
  requires_shared  boolean not null default false,
  produces_state   text not null,            -- object state on success
  collaborative    boolean not null default false, -- design metadata: expects info from another player
  prompt           text not null,            -- player-facing, safe
  input_config     jsonb not null default '{}'::jsonb,  -- player-facing, safe (labels, placeholder, real options)
  solution         jsonb not null default '{}'::jsonb,  -- SECRET
  feedback         jsonb not null default '{}'::jsonb,  -- SECRET: normalized plausible input → outcome code
  sort_order       integer not null default 0,
  unique (case_id, code)
);

create table if not exists public.session_challenge_attempts (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  challenge_code  text not null,
  user_id         uuid not null references auth.users(id) on delete cascade,
  input           jsonb not null,
  outcome         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists session_challenge_attempts_lookup_idx
  on public.session_challenge_attempts (session_id, challenge_code, user_id, created_at desc);

alter table public.investigation_challenges enable row level security;
alter table public.session_challenge_attempts enable row level security;
-- (no policies on either — locked, RPC-only)

revoke all on table public.investigation_challenges from public, anon, authenticated;
revoke all on table public.session_challenge_attempts from public, anon, authenticated;

-- ------------------------------------------------------------
-- Internal: Arabic/RTL-aware normalization for text inputs.
-- Canonicalizes representation only — never fuzzy. Two inputs match
-- only if they are the same text once these artifacts are removed:
--   1. NFKC (presentation forms like ﻻ/ﺍ, fullwidth digits, NBSP→space,
--      alef + combining hamza → أ)
--   2. strip invisible marks: ZWSP/ZWNJ/ZWJ/LRM/RLM (U+200B–200F),
--      embeddings/overrides (U+202A–202E), isolates (U+2066–2069),
--      BOM (U+FEFF), soft hyphen (U+00AD)
--   3. strip Arabic diacritics/Quranic marks (U+0610–061A,
--      U+064B–065F, U+0670 superscript alef, U+06D6–06ED)
--   4. Arabic-Indic ٠-٩ and Extended Arabic-Indic ۰-۹ → 0-9
--   5. أ إ آ ٱ → ا ; ى → ي ; ة → ه ; tatweel ـ removed
--   6. lowercase (Latin), collapse whitespace, trim
-- ------------------------------------------------------------
create or replace function public._challenge_normalize(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    btrim(
      regexp_replace(
        translate(
          translate(
            translate(
              regexp_replace(
                regexp_replace(
                  lower(normalize(coalesce(p_text, ''), NFKC)),
                  '[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]', '', 'g'
                ),
                '[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]', '', 'g'
              ),
              '٠١٢٣٤٥٦٧٨٩', '0123456789'
            ),
            '۰۱۲۳۴۵۶۷۸۹', '0123456789'
          ),
          'أإآٱىةـ', 'اااايه'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

-- ------------------------------------------------------------
-- Internal: the only outcome codes allowed to leave the engine.
-- Anything else (a typo, or authored text in `feedback`) is coerced
-- to a safe default — hidden content can never reach the browser.
-- ------------------------------------------------------------
create or replace function public._challenge_safe_outcome(p_outcome text, p_default text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_outcome in ('complete', 'insufficient', 'no_match', 'no_result', 'too_broad', 'needs_more', 'throttled')
      then p_outcome
    else p_default
  end;
$$;

-- Authored `feedback` may only map a plausible wrong input to a
-- NON-success hint. It can never produce 'complete' (success is only
-- ever decided by `solution.accept`) or impersonate 'throttled'.
create or replace function public._challenge_feedback(p_value text, p_default text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_value in ('insufficient', 'no_match', 'no_result', 'too_broad', 'needs_more') then p_value
    else p_default
  end;
$$;

-- ------------------------------------------------------------
-- Internal: evaluate one input against a challenge's secret solution.
-- Returns an outcome code only. Extend per input_kind here.
-- ------------------------------------------------------------
create or replace function public._challenge_evaluate(
  p_kind     text,
  p_config   jsonb,
  p_solution jsonb,
  p_feedback jsonb,
  p_input    jsonb
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value text;
begin
  if p_kind = 'text' then
    v_value := public._challenge_normalize(p_input ->> 'value');
    if v_value is null or char_length(v_value) < coalesce((p_solution ->> 'min_length')::int, 2) then
      return 'insufficient';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(coalesce(p_solution -> 'accept', '[]'::jsonb)) a
      where public._challenge_normalize(a) = v_value
    ) then
      return 'complete';
    end if;
    return public._challenge_feedback(p_feedback ->> v_value, 'no_match');
  end if;

  if p_kind = 'choice' then
    v_value := p_input ->> 'choice';
    if v_value is null or not exists (
      select 1 from jsonb_array_elements(coalesce(p_config -> 'options', '[]'::jsonb)) o
      where o ->> 'id' = v_value
    ) then
      return 'insufficient';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(coalesce(p_solution -> 'accept', '[]'::jsonb)) a
      where a = v_value
    ) then
      return 'complete';
    end if;
    return public._challenge_feedback(p_feedback ->> v_value, 'no_result');
  end if;

  raise exception 'UNSUPPORTED_INPUT_KIND';
end;
$$;

-- ------------------------------------------------------------
-- RPC: challenge_index — challenges currently available to the caller.
-- Visible only on an object the caller can actually see (own or shared
-- discovery, same rule as 022), in the right state, for the caller's
-- effective specializations. Never returns solution/feedback.
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
  order by c.sort_order, c.code;
end;
$$;

-- ------------------------------------------------------------
-- RPC: attempt_challenge — server-authoritative evaluation.
-- Outcomes: complete | insufficient | no_match | no_result |
--           too_broad | needs_more | throttled
-- Throttle (not a penalty): >6 attempts in 60s pauses briefly, so
-- rapid guessing is never the best strategy. Nothing is lost.
-- ------------------------------------------------------------
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
declare
  v_case    text;
  v_ch      public.investigation_challenges%rowtype;
  v_sos     public.session_object_state%rowtype;
  v_outcome text;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  -- Checked before any challenge lookup: depends only on the caller's own input.
  if p_input is null or octet_length(p_input::text) > 2000 then
    raise exception 'INPUT_TOO_LARGE';
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;

  -- One generic answer for every "not available to you" case: the code
  -- doesn't exist, wrong specialization, object not visible to you,
  -- wrong object state, or not yet shared. An unauthorized caller can't
  -- tell "exists but not for me" from "doesn't exist", and learns no
  -- specialization, state, or prerequisite information.
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

  -- idempotent: already solved (by anyone) → report complete, change nothing.
  -- Only reachable by an authorized caller who can see the object.
  if v_sos.state = v_ch.produces_state then
    return 'complete';
  end if;

  if v_sos.state <> v_ch.requires_state
     or (v_ch.requires_shared and not v_sos.is_shared) then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;

  if (select count(*) from public.session_challenge_attempts a
      where a.session_id = p_session and a.challenge_code = v_ch.code
        and a.user_id = auth.uid() and a.created_at > now() - interval '60 seconds') >= 6 then
    return 'throttled';
  end if;

  -- Final allowlist gate: whatever the evaluator returns, only a known
  -- outcome code can be logged or leave this function.
  v_outcome := public._challenge_safe_outcome(
    public._challenge_evaluate(v_ch.input_kind, v_ch.input_config, v_ch.solution, v_ch.feedback, p_input),
    'no_result'
  );

  insert into public.session_challenge_attempts (session_id, challenge_code, user_id, input, outcome)
  values (p_session, v_ch.code, auth.uid(), p_input, v_outcome);

  if v_outcome = 'complete' then
    update public.session_object_state
    set state = v_ch.produces_state, processing_until = null, updated_at = now()
    where session_id = p_session and object_code = v_ch.object_code and state = v_ch.requires_state;
  end if;

  return v_outcome;
end;
$$;

revoke all on function public._challenge_normalize(text) from public, anon, authenticated;
revoke all on function public._challenge_safe_outcome(text, text) from public, anon, authenticated;
revoke all on function public._challenge_feedback(text, text) from public, anon, authenticated;
revoke all on function public._challenge_evaluate(text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.challenge_index(uuid) from public, anon;
revoke all on function public.attempt_challenge(uuid, text, jsonb) from public, anon;
grant execute on function public.challenge_index(uuid) to authenticated;
grant execute on function public.attempt_challenge(uuid, text, jsonb) to authenticated;

-- ============================================================
-- ROOM 714 — first challenge (micro, tutorial-grade).
--
-- Canon basis: R-01 is the hotel guest file for رامي الخطيب, room 714
-- (sql/005). The passport object already exposes the name. Today the
-- Records step is a one-click button; this turns it into a real
-- search that needs a valid lookup key — the guest's name (seen on the
-- shared passport) or his room number. No new facts introduced.
-- Collaboration: requires_shared — Field must share the passport before
-- Records can query anything.
--
-- The one-click QUERY_GUEST_FILE interaction is removed so the challenge
-- is the only path. Sessions already at RECORDS_QUERIED are unaffected;
-- sessions at DISCOVERED simply see the search instead of the button.
-- ============================================================
update public.investigation_objects
set interactions = (
  select coalesce(jsonb_agg(i), '[]'::jsonb)
  from jsonb_array_elements(interactions) i
  where i ->> 'code' <> 'QUERY_GUEST_FILE'
)
where case_id = 'room-714' and code = 'PASSPORT';

delete from public.investigation_challenges where case_id = 'room-714' and code = 'GUEST_FILE_LOOKUP';

insert into public.investigation_challenges
  (case_id, code, object_code, level, input_kind, spec, requires_state, requires_shared,
   produces_state, collaborative, prompt, input_config, solution, feedback, sort_order)
values
('room-714', 'GUEST_FILE_LOOKUP', 'PASSPORT', 'micro', 'text', 'records', 'DISCOVERED', true,
 'RECORDS_QUERIED', true,
 'استعلام في سجلات نزلاء فندق فيسبر. البحث يحتاج مفتاحاً محدداً: اسم نزيل أو رقم غرفة.',
 '{"tool": "records_search", "label": "سجلات النزلاء", "placeholder": "اسم النزيل أو رقم الغرفة"}'::jsonb,
 '{"accept": ["رامي الخطيب", "714", "الغرفة 714", "غرفة 714"], "min_length": 3}'::jsonb,
 '{}'::jsonb,
 10);
