# Multiplayer

IFADA supports roughly 2–8 players per session (design target: 4, one per specialization, with graceful coverage below that).

## Host has no gameplay privilege

The player who creates the room is also just a normal investigator once the session starts. Don't give the host special in-game knowledge, extra actions, or authority over other players' evidence/theory placements beyond the lobby-only "start investigation" action already built. The investigation board, theory placements, and verdict are team-owned, not host-owned.

## Specialization coverage — implemented multi-specialization model

This is the **currently implemented** system, not a future idea. Each player has a primary specialization on `session_members`, but effective *access* is separate and can cover more than one specialization per player — stored in `session_member_specializations`, checked with `has_specialization(p_session, p_specialization)`, enumerated with `my_specializations(p_session)`, and assigned via `assign_session_specializations(p_session)` / `start_session(...)`. There is no unique-one-specialization-per-player constraint. At low player counts (2–3), a single player can legitimately be granted coverage of more than one specialization so nothing becomes permanently inaccessible. Any new specialization-gated feature must check effective access through these current helpers (or their up-to-date equivalents — verify against the live schema rather than assuming), not through a single primary-specialization comparison.

## Realtime discipline

- Every realtime subscription is scoped with a `session_id` filter — never a global/unfiltered subscription.
- Assume messages can arrive out of order or be duplicated; design state updates to be idempotent (re-applying the same event twice should be harmless).
- Handle reconnect: a player who refreshes or briefly loses connection should rejoin the same state, not lose progress or duplicate their own actions.
- Distinguish shared state (evidence unlocks, board, verdict, session events — visible/mutable by the whole team) from personal state (a single player's UI preferences) — never let personal UI state leak into shared realtime channels.
- Race conditions: two players unlocking the same evidence, submitting the verdict, or linking the same board note pair at once should resolve safely (rely on unique constraints / `on conflict do nothing`, not client-side "first click wins" assumptions).

## Voice (LiveKit)

Voice is gameplay, not a bolt-on utility (see `product-principles.md`). Current architecture: one room per session, mic-only, token minted server-side scoped to that session and a short TTL. Any extension (breakout sub-rooms, marked-moment highlights, etc.) should follow the same pattern: token minted server-side, scoped narrowly, never a long-lived or session-independent credential.

## Testing multiplayer features

Never consider a multiplayer feature done after testing with one browser tab. Test with at least two authenticated sessions (two different users) concurrently, and verify: both see the same state, the specialization/authorization boundary actually holds for the "wrong" player, and realtime updates arrive without a manual refresh.
