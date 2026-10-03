-- ============================================================
-- IFADA — 023_session_object_state_grants.sql
-- Minimal table privileges for the investigation-object tables.
--
-- NOT YET APPLIED. Local file only, pending Hazem's review.
--
-- WHY: Supabase's default privileges grant ALL on new public tables
-- to anon/authenticated. 019/022 revoked INSERT/UPDATE/DELETE but not
-- TRUNCATE/REFERENCES/TRIGGER. (TRUNCATE is not governed by RLS.)
--
-- Privileges only. No RLS, data, function, schema, or realtime change.
-- SECURITY DEFINER RPCs run as the function owner (postgres), which
-- owns the tables and is unaffected by these revokes.
-- ============================================================

revoke all on table public.session_object_state from public, anon, authenticated;
grant select on table public.session_object_state to authenticated;

-- Static case content: fully locked, RPC-only (reasserts 019).
revoke all on table public.investigation_objects from public, anon, authenticated;
