-- ============================================================
-- IFADA — 020_fix_root_object_visibility.sql
-- Fixes the bug where root investigation objects (a case's
-- location, e.g. ROOM_714) never expose their direct children.
--
-- NOT YET APPLIED. Local file only, pending Hazem's review.
--
-- ROOT CAUSE (confirmed against live data for session
-- 6d328462-3c19-4cc9-9f39-26f4809da0ff):
--
-- investigation_object_index only returns a child object once its
-- parent's session_object_state.discovered = true. A root object
-- like ROOM_714 has `interactions = '[]'` — there is no player
-- action that can ever set discovered = true for it, because
-- `discovered` is only ever flipped by execute_object_interaction.
-- So ROOM_714 stayed permanently discovered = false, and every one
-- of its direct children (GLASS_CUP, OPEN_WINDOW, VICTIM_ITEMS,
-- LAPTOP) was correctly filtered out by the (working-as-designed)
-- parent-visibility rule — they were never hidden by a bug in that
-- rule, they were hidden because their parent could structurally
-- never satisfy it.
--
-- FIX: a root object (parent_code is null) represents the case's
-- starting "known world", not a private discovery — so it should be
-- seeded as already discovered AND shared, exempting it from the
-- privacy gate too (undiscovered/private semantics only make sense
-- for something a player can choose not to share yet).
--
-- Two parts:
--   1. `open_investigation` — for all *future* sessions.
--   2. a one-time backfill — for sessions that already called
--      `open_investigation` under the old logic (as of writing,
--      five room-714 sessions, one of them currently active).
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

  insert into public.session_object_state (session_id, object_code, state, discovered, is_shared)
  select
    p_session,
    o.code,
    o.initial_state,
    (o.parent_code is null),   -- root objects start already "known"
    (o.parent_code is null)    -- and are shared world-state, not a private finding
  from public.investigation_objects o
  where o.case_id = v_case
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- One-time backfill for sessions already seeded under the old logic.
-- Idempotent — only touches rows that are still (incorrectly) false.
update public.session_object_state as sos
set
  discovered = true,
  is_shared = true
from
  public.sessions as s,
  public.investigation_objects as o
where
  s.id = sos.session_id
  and o.case_id = s.case_id
  and upper(trim(o.code)) = upper(trim(sos.object_code))
  and o.parent_code is null
  and (
    sos.discovered is distinct from true
    or sos.is_shared is distinct from true
  );
