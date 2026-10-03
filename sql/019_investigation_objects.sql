-- ============================================================
-- IFADA — 019_investigation_objects.sql
-- Interactive Investigation Engine — vertical-slice foundation.
--
-- NOT YET APPLIED TO ANY DATABASE. Local file only, pending
-- Hazem's review and approval per sql/MIGRATIONS.md's rules.
--
-- Adds a case-agnostic "investigation object" model that sits
-- BEFORE and AROUND the existing evidence/viewer system:
--
--   investigation_objects   — static case content (per case),
--                              zero RLS select policies, same
--                              pattern as `evidence`/`characters`/
--                              `timeline_facts`. Read only through
--                              SECURITY DEFINER RPCs below.
--
--   session_object_state    — per-session live progress: current
--                              state, discovered/shared flags,
--                              background-job timing. Safe to
--                              expose directly (no hidden case
--                              content lives here), same pattern
--                              as `session_evidence`.
--
-- State machine + interactions are stored as jsonb config on
-- investigation_objects rather than a fixed universal enum, so
-- the same engine can describe ROOM 714's objects, Scene 17's
-- objects, or any future case without schema changes:
--
--   interactions: jsonb array of
--     { "code", "label", "spec", "requires_state",
--       "produces_state", "requires_shared"?, "processing_seconds"? }
--
--   auto_advance: jsonb map of { "<processing-state>": "<final-state>" },
--   applied server-side once `processing_until` has passed —
--   this is the "background job" mechanism. No worker process:
--   the index RPC advances any object whose wait is over, on read.
--
-- Effective-specialization access uses has_specialization() /
-- my_specializations() (multi-spec model) — never the legacy
-- singular my_specialization().
-- ============================================================

-- ------------------------------------------------------------
-- investigation_objects — static per-case content.
-- ⚠️ Zero select policies. All access via RPC below.
-- ------------------------------------------------------------
create table if not exists public.investigation_objects (
  id                 uuid primary key default gen_random_uuid(),
  case_id            text not null references public.cases(id) on delete cascade,
  code               text not null,
  parent_code        text,                 -- null = root object, always visible
  category           text not null,        -- 'location' | 'object' | 'device'
  title              text not null,
  initial_state      text not null,
  state_descriptions jsonb not null default '{}'::jsonb,
  interactions       jsonb not null default '[]'::jsonb,
  auto_advance       jsonb not null default '{}'::jsonb,
  sort_order         integer not null default 0,
  unique (case_id, code)
);

create index if not exists investigation_objects_case_idx
  on public.investigation_objects (case_id);

-- ------------------------------------------------------------
-- session_object_state — per-session live state. No hidden
-- case content here — safe to select directly, like session_evidence.
-- ------------------------------------------------------------
create table if not exists public.session_object_state (
  session_id      uuid not null references public.sessions(id) on delete cascade,
  object_code     text not null,
  state           text not null,
  discovered      boolean not null default false,
  discovered_by   uuid references auth.users(id) on delete set null,
  is_shared       boolean not null default false,
  shared_by       uuid references auth.users(id) on delete set null,
  shared_at       timestamptz,
  processing_until timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (session_id, object_code)
);

create index if not exists session_object_state_session_idx
  on public.session_object_state (session_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.investigation_objects enable row level security;
-- (no policies — locked, RPC-only, same as `evidence`)

alter table public.session_object_state enable row level security;

drop policy if exists session_object_state_select on public.session_object_state;
create policy session_object_state_select on public.session_object_state
  for select to authenticated
  using (public.is_session_member(session_id));

-- writes only via SECURITY DEFINER RPCs below — no insert/update policies.

-- Defense-in-depth on top of RLS: investigation_objects is static
-- case content and must never be readable or writable directly, by
-- anyone, from any client role. session_object_state's SELECT stays
-- available (gated by the policy above) but direct mutation is
-- revoked at the grant layer too, so a bypass would require both an
-- RLS hole *and* a grant — not either alone.
revoke all on table public.investigation_objects from public, anon, authenticated;
revoke insert, update, delete on table public.session_object_state from public, anon, authenticated;

-- ============================================================
-- RPC: open_investigation
-- Seeds session_object_state for every object in the session's
-- case, at each object's initial_state. Idempotent.
-- ============================================================
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

  insert into public.session_object_state (session_id, object_code, state)
  select p_session, o.code, o.initial_state
  from public.investigation_objects o
  where o.case_id = v_case
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================
-- internal: advance any object past a completed background job.
-- Called at the start of both RPCs below so state is always
-- fresh before it's read or acted on.
-- ============================================================
create or replace function public._advance_processed_objects(p_session uuid, p_case text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.session_object_state sos
  set state = o.auto_advance ->> sos.state,
      processing_until = null,
      updated_at = now()
  from public.investigation_objects o
  where o.case_id = p_case
    and o.code = sos.object_code
    and sos.session_id = p_session
    and sos.processing_until is not null
    and sos.processing_until <= now()
    and o.auto_advance ? sos.state;
$$;

-- ============================================================
-- RPC: investigation_object_index
-- Client-safe view: only objects whose parent (if any) is
-- discovered are returned at all — this IS the progressive-
-- inspection rule, enforced server-side, not just in the UI.
--
-- Private-until-shared: a discovery is only readable by (a) the
-- player who made it or (b) anyone once it's been shared. A
-- teammate who hasn't been shown it yet sees only that *something*
-- was discovered (discovered=true, is_shared=false) — never the
-- description, the real state name, or a processing signal, since
-- any of those could itself reveal what was found. `actions` needs
-- no separate masking: it's computed from the *real* state/is_shared
-- below regardless of viewer, and a `requires_shared` action is
-- already correctly absent for a non-owner before sharing happens —
-- redacting the display fields must never change that computation.
--
-- NOT declared STABLE: it calls _advance_processed_objects, which
-- writes (clears a completed background job). A function with a
-- side effect must be VOLATILE (the default) — mislabeling it STABLE
-- would be a false contract even if nothing enforces it on today's
-- single-primary setup.
-- ============================================================
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
    coalesce(
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
    )
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

-- ============================================================
-- RPC: execute_object_interaction
-- Server-authoritative. Idempotent: calling an interaction whose
-- produces_state is already reached is a safe no-op (handles
-- double-click / refetch-on-reconnect without duplicate effects).
-- ============================================================
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
-- RPC: share_object_discovery
-- Only the discoverer can share their own private finding.
-- ============================================================
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
  v_sos public.session_object_state%rowtype;
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

  if v_sos.discovered_by is distinct from auth.uid() then
    raise exception 'NOT_YOUR_DISCOVERY';
  end if;

  update public.session_object_state
  set is_shared = true, shared_by = auth.uid(), shared_at = now()
  where session_id = p_session and object_code = v_sos.object_code and not is_shared;

  return true;
end;
$$;

revoke all on function public.open_investigation(uuid) from public;
revoke all on function public._advance_processed_objects(uuid, text) from public;
revoke all on function public.investigation_object_index(uuid) from public;
revoke all on function public.execute_object_interaction(uuid, text, text) from public;
revoke all on function public.share_object_discovery(uuid, text) from public;

grant execute on function public.open_investigation(uuid) to authenticated;
grant execute on function public.investigation_object_index(uuid) to authenticated;
grant execute on function public.execute_object_interaction(uuid, text, text) to authenticated;
grant execute on function public.share_object_discovery(uuid, text) to authenticated;
-- _advance_processed_objects is an internal helper, never called directly by clients.
revoke execute on function public._advance_processed_objects(uuid, text) from public, anon, authenticated;

-- ============================================================
-- Realtime — only the live-state table. investigation_objects
-- never changes at runtime and stays fully locked either way.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'session_object_state'
  ) then
    execute 'alter publication supabase_realtime add table public.session_object_state';
  end if;
end $$;

-- ============================================================
-- ROOM 714 — vertical-slice content (canon-grounded only).
--
-- Source of every fact below: sql/005_seed_room714.sql, F-01's
-- body. No invented physical details, no invented character
-- names. Kept intentionally small — this is a proof of the
-- engine, not a conversion of all ROOM 714 evidence.
--
-- ⚠️ Once real sessions exist with session_object_state rows sitting
-- in a given object's states, do not rename or remove a state name,
-- or reshape an object's `interactions`/`auto_advance` here and
-- re-run this file. There is no FK from session_object_state to
-- investigation_objects (by design — a session's progress must
-- survive a content reseed), so a live row can end up holding a
-- `state` value that no longer matches anything in the new config.
-- That doesn't error or lose the row — it just silently strands
-- that object with zero available actions for that session. Ship
-- new state-machine shapes as new object codes, or accept that a
-- reshape requires migrating existing session_object_state rows too.
-- ============================================================
delete from public.investigation_objects where case_id = 'room-714' and code in
  ('ROOM_714', 'GLASS_CUP', 'BLOOD_STAIN', 'OPEN_WINDOW', 'VICTIM_ITEMS', 'PASSPORT', 'LAPTOP');

insert into public.investigation_objects
  (case_id, code, parent_code, category, title, initial_state, state_descriptions, interactions, auto_advance, sort_order)
values

('room-714', 'ROOM_714', null, 'location', 'الغرفة 714', 'KNOWN',
 '{"KNOWN": "الغرفة مش مقلوبة أو فيها فوضى كبيرة، وأغراض النزيل الشخصية لسا بمكانها."}'::jsonb,
 '[]'::jsonb, '{}'::jsonb, 0),

('room-714', 'GLASS_CUP', 'ROOM_714', 'object', 'كأس زجاجي', 'UNKNOWN',
 '{"DISCOVERED": "كأس زجاجي مكسور على الأرض. الكسر منتشر على مساحة محدودة، مش متطاير بكل الغرفة."}'::jsonb,
 '[{"code":"INSPECT","label":"عاين","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0}]'::jsonb,
 '{}'::jsonb, 10),

('room-714', 'BLOOD_STAIN', 'GLASS_CUP', 'object', 'أثر مشتبه به قرب الكأس', 'UNKNOWN',
 '{"DISCOVERED": "بقعة صغيرة داكنة قرب الكأس، حجمها تقريباً 4 سم.", "SAMPLE_COLLECTED": "تم أخذ عينة من البقعة.", "PROCESSING": "العينة قيد التحليل بالمختبر.", "ANALYZED": "نتيجة التحليل: الدم لا يعود لرامي الخطيب. يعود لأنثى. الكمية تتوافق مع جرح سطحي، لا إصابة خطيرة."}'::jsonb,
 '[
   {"code":"INSPECT_CLOSE","label":"افحص عن قرب","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0},
   {"code":"COLLECT_SAMPLE","label":"اجمع عينة","spec":"forensics","requires_state":"DISCOVERED","produces_state":"SAMPLE_COLLECTED","requires_shared":true,"processing_seconds":0},
   {"code":"REQUEST_LAB","label":"اطلب تحليل مخبري","spec":"forensics","requires_state":"SAMPLE_COLLECTED","produces_state":"PROCESSING","processing_seconds":150}
 ]'::jsonb,
 '{"PROCESSING":"ANALYZED"}'::jsonb, 11),

('room-714', 'OPEN_WINDOW', 'ROOM_714', 'object', 'الشباك', 'UNKNOWN',
 '{"DISCOVERED": "الشباك مفتوح."}'::jsonb,
 '[{"code":"INSPECT","label":"عاين","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0}]'::jsonb,
 '{}'::jsonb, 12),

('room-714', 'VICTIM_ITEMS', 'ROOM_714', 'object', 'أغراض على الطاولة الجانبية', 'UNKNOWN',
 '{"DISCOVERED": "الهاتف موجود على الطاولة. المحفظة موجودة. جواز السفر موجود."}'::jsonb,
 '[{"code":"INSPECT","label":"عاين","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0}]'::jsonb,
 '{}'::jsonb, 13),

('room-714', 'PASSPORT', 'VICTIM_ITEMS', 'object', 'جواز السفر', 'UNKNOWN',
 '{"DISCOVERED": "الاسم على الجواز: رامي الخطيب.", "RECORDS_QUERIED": "ملف النزيل: رامي الخطيب، 29 سنة، مؤسس شركة تقنية (RAK TECH)، نزيل بالفندق ضمن فعالية إطلاق، الغرفة 714."}'::jsonb,
 '[
   {"code":"INSPECT","label":"افحص جواز السفر","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0},
   {"code":"QUERY_GUEST_FILE","label":"استعلم عن ملف النزيل","spec":"records","requires_state":"DISCOVERED","produces_state":"RECORDS_QUERIED","requires_shared":true,"processing_seconds":0}
 ]'::jsonb,
 '{}'::jsonb, 14),

('room-714', 'LAPTOP', 'ROOM_714', 'object', 'لابتوب', 'UNKNOWN',
 '{"DISCOVERED": "لابتوب مفتوح، الشاشة مطفأة.", "INSPECTED": "دخلت للجهاز. آخر نشاط كان على ملف مسودة.", "DRAFT_RECOVERED": "مسودة رسالة غير مرسلة — آخر تعديل قبل الاختفاء:\n\n\"إذا صارلي إشي الليلة، الموضوع مش صدفة.\""}'::jsonb,
 '[
   {"code":"INSPECT","label":"عاين سطحياً","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0},
   {"code":"INSPECT_DEVICE","label":"افحص الجهاز تقنياً","spec":"digital","requires_state":"DISCOVERED","produces_state":"INSPECTED","processing_seconds":0},
   {"code":"RECOVER_DRAFT","label":"استخرج آخر نشاط","spec":"digital","requires_state":"INSPECTED","produces_state":"DRAFT_RECOVERED","processing_seconds":0}
 ]'::jsonb,
 '{}'::jsonb, 15);
