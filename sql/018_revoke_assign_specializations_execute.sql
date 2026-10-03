-- ============================================================
-- IFADA — 018_revoke_assign_specializations_execute.sql
--
-- assign_session_specializations(uuid) is an INTERNAL helper:
-- SECURITY DEFINER, no caller/membership check, deletes and rebuilds
-- a session's specialization assignment. Only start_session (also
-- SECURITY DEFINER) should ever call it.
--
-- fix_multiplayer_specialization_access.sql only ran
-- `revoke all ... from public`. Supabase's default privileges also
-- grant EXECUTE on public-schema functions DIRECTLY to anon and
-- authenticated, which a `from public` revoke does not remove —
-- confirmed live by verify_live_state.sql (both returned true).
--
-- This file ONLY removes those direct grants. No function is
-- redefined, no data is touched. Idempotent: revoking an absent
-- privilege is a no-op. service_role and the function owner keep
-- EXECUTE, so start_session (running as its owner) is unaffected.
--
-- DO NOT RUN without Hazem's approval.
-- ============================================================

begin;

revoke execute
  on function public.assign_session_specializations(uuid)
  from public, anon, authenticated;

commit;

-- Read-only check (the SQL Editor shows this result):
-- expected: anon_can_execute = false, authenticated_can_execute = false,
--           same_owner = true, owner_can_execute = true
select
  has_function_privilege('anon',
    'public.assign_session_specializations(uuid)', 'execute')          as anon_can_execute,
  has_function_privilege('authenticated',
    'public.assign_session_specializations(uuid)', 'execute')          as authenticated_can_execute,
  (select p.proowner from pg_proc p
    where p.oid = 'public.start_session(uuid)'::regprocedure)
  = (select p.proowner from pg_proc p
    where p.oid = 'public.assign_session_specializations(uuid)'::regprocedure) as same_owner,
  has_function_privilege(
    (select p.proowner from pg_proc p
      where p.oid = 'public.start_session(uuid)'::regprocedure),
    'public.assign_session_specializations(uuid)', 'execute')          as owner_can_execute,
  (select p.prosecdef from pg_proc p
    where p.oid = 'public.start_session(uuid)'::regprocedure)          as start_session_is_definer;
