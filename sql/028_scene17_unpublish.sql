-- ============================================================
-- IFADA — 028_scene17_unpublish.sql
--
-- STATUS: WRITTEN FOR REVIEW — NOT APPLIED. PRODUCTION DATA CHANGE
-- (one catalogue row). Run manually only after Hazem approves.
--
-- WHY: Scene 17 is published (cases.is_published = true) while every
-- one of its live content tables is empty. The app now refuses to open
-- a non-playable case (src/cases/registry.ts → isCaseOpenForPlay, used
-- by the archive, lobby and case pages), but the database itself would
-- still let create_session create an empty Scene 17 session for anyone
-- holding an entitlement. Today nobody does (0 entitlements), so this
-- is defense in depth — the EXISTING catalogue mechanism, not a new one:
--   * create_session already requires is_published  → CASE_NOT_FOUND
--   * cases_select RLS already shows only published cases → hidden
--     from the archive list
--
-- TRADE-OFF (decide before applying): with Scene 17 unpublished, no
-- one — developers included — can create a Scene 17 session through
-- create_session. Developer sessions would then need a service-role
-- dev script, or this can be applied only when Scene 17 content work
-- no longer needs live sessions. The app-level dev access
-- (next dev / IFADA_DEV_CASES) only governs the pages.
--
-- Nothing is deleted: the case row, its future content and all source
-- assets stay. Revert = the same update with true.
-- ============================================================

update public.cases
set is_published = false
where id = 'scene-17' and is_published = true;

-- READ-ONLY verification (run after):
--   select id, is_published from public.cases order by id;
--   expect: room-714 true, scene-17 false.
--   select count(*) from public.sessions where case_id = 'scene-17';
--   expect: unchanged (0 at the time of writing).
