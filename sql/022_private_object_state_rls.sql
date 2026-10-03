-- ============================================================
-- IFADA — 022_private_object_state_rls.sql
-- Closes the private-finding leak on session_object_state.
-- (021 is the unapplied bridge PROPOSAL draft; this is the next real migration.)
--
-- NOT YET APPLIED. Local file only, pending Hazem's review.
--
-- PROBLEM: the 019 select policy allowed any session member to read
-- every row directly, and Supabase Realtime delivers postgres_changes
-- rows to any subscriber who passes that same policy. So a teammate
-- could see the raw `state` (e.g. ANALYZED / PROCESSING) of another
-- player's private finding — by direct SELECT or via realtime payload.
--
-- FIX: a row is directly readable only if the caller is a session
-- member AND (it has been shared OR the caller discovered it).
-- Undiscovered rows are not directly readable by anyone (they would
-- leak which child objects exist). Realtime authorizes postgres_changes
-- delivery against this same policy, so tightening it also stops the
-- realtime leak — no other infrastructure needed.
--
-- UNCHANGED: investigation_object_index / execute_object_interaction /
-- share_object_discovery / open_investigation are SECURITY DEFINER and
-- do not depend on this policy. Clients only read data via
-- investigation_object_index; realtime events are used purely as a
-- refetch trigger (payload ignored).
--
-- Non-destructive: no data touched, no table/column/function changed.
-- ============================================================

drop policy if exists session_object_state_select on public.session_object_state;

create policy session_object_state_select on public.session_object_state
  for select to authenticated
  using (
    public.is_session_member(session_id)
    and (is_shared or discovered_by = auth.uid())
  );

-- Grants: authenticated keeps SELECT (gated by the policy above);
-- no direct mutation for anyone (already revoked in 019, reasserted);
-- anon/public get nothing.
revoke all on table public.session_object_state from public, anon;
revoke insert, update, delete on table public.session_object_state from authenticated;
grant select on table public.session_object_state to authenticated;
