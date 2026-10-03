-- ============================================================
-- IFADA — 034_lock_legacy_board.sql   (ENGINE — permissions only)
--
-- STATUS: WRITTEN FOR REVIEW — NOT APPLIED (revision 2, 2026-10-01).
-- ORDER: apply ONLY AFTER 031 is live (done: applied + verified) AND the
-- app's board has switched to the 031 RPCs (done in the Board V2 switch
-- package — board, scene "add to board" and case-file pins no longer read
-- or write the legacy tables) AND that switch has passed its QA.
--   BEFORE: sql/verify_034_preapply.sql  (every non-INFO row pass = true)
--   AFTER:  sql/verify_034_postapply.sql (every non-INFO row pass = true)
--
-- WHY: the legacy board_notes / board_links (004) let any member INSERT
-- arbitrary evidence_code / text (membership-only RLS). Board V2 writes only
-- through 031's authorized RPCs, so the legacy tables become read-only
-- history: no client inserts, updates, deletes or truncates.
-- Nothing is deleted; existing rows stay readable to members (SELECT policy
-- kept). Realtime publication is left as is (verify_live_state.sql expects
-- it). Server-side cascades (session/user deletion) are unaffected — they
-- run as the table owner, not as a client role.
-- Revision 2: also revokes TRUNCATE / REFERENCES / TRIGGER (Supabase default
-- grants; TRUNCATE bypasses RLS) and every privilege from PUBLIC and anon.
-- ============================================================

revoke all on table public.board_notes from public, anon;
revoke all on table public.board_links from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.board_notes from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.board_links from authenticated;

drop policy if exists board_notes_insert on public.board_notes;
drop policy if exists board_notes_update on public.board_notes;
drop policy if exists board_notes_delete on public.board_notes;
drop policy if exists board_links_insert on public.board_links;
drop policy if exists board_links_delete on public.board_links;
