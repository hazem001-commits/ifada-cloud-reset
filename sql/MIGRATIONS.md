# IFADA SQL migrations: order and rules

Filenames are **not** a safe execution order. Files were written as the project evolved, and several later "fix" files redefine functions from earlier ones. This file is the source of truth for ordering.

All files are run manually in the Supabase SQL Editor. Nothing runs automatically. Every run needs Hazem's approval.

## Clean database setup order

Run exactly this sequence, once each, top to bottom:

| # | File | Purpose |
|---|---|---|
| 1 | `001_schema.sql` | Core tables: profiles, cases, entitlements, sessions, session_members; enums |
| 2 | `002_rls.sql` | RLS, `is_session_member`, `create_session`, `join_session`*, `session_lobby`, realtime for sessions/members |
| 3 | `003_seed.sql` | Case catalogue (sets `max_players = 4`; step 14 raises it to 8) |
| 4 | `004_evidence.sql` | Evidence, unlocks, board; `evidence_index`*, `unlockable_evidence`*, `unlock_evidence`*, `open_case` (re-created by 036 §0b, live) |
| 5 | `005_seed_room714.sql` | ROOM 714 evidence (**deletes and reseeds**, see warnings) |
| 6 | `006_timeline.sql` | Timeline engine, `evaluate_theory` |
| 7 | `007_seed_timeline_room714.sql` | ROOM 714 locations, travel matrix, timeline facts (**deletes and reseeds**) |
| 8 | `008_characters.sql` | Interrogation tables, `interrogation_subjects` |
| 9 | `009_seed_characters_room714.sql` | ROOM 714 characters (**deletes and reseeds**) |
| 10 | `010_automation.sql` | Clock, milestones, events; `case_clock`, `check_milestones`, `expiring_evidence`*, `unlock_evidence`* |
| 11 | `011_seed_automation_room714.sql` | ROOM 714 clock (`start_ck = 1380`), F-07, expiry, milestones |
| 12 | `012_verdict.sql` | Verdict and narrative |
| 13 | `013_seed_verdict_narrative_room714.sql` | ROOM 714 verdict questions and narrative (**deletes and reseeds**) |
| 14 | `fix_multiplayer_specialization_access.sql` | **Multi-specialization model**: `session_member_specializations`, `has_specialization`, `my_specializations`, `assign_session_specializations`, `start_session` (only definition), `join_session`, evidence functions, `max_players = 8` |
| 15 | `014_storage.sql` | Private `case-media` bucket |
| 16 | `015_evidence_media_safe.sql` | `evidence_index` returns `has_media`, never `media_path` |
| 17 | `016_fix_room714_case_clock.sql` | Restores `start_ck = 1380` (a no-op on a clean DB) |
| 18 | `017_consolidate_current_state.sql` | **Final authoritative state.** Reasserts every definition an older file can overwrite (see below) |
| 19 | `018_revoke_assign_specializations_execute.sql` | Removes direct EXECUTE on the internal `assign_session_specializations` from `public` / `anon` / `authenticated`. It is also inside 017, and repeating it is a harmless no-op. |
| 20 | `019_investigation_objects.sql` | Adds the Interactive Investigation Engine (`investigation_objects`, `session_object_state`, `open_investigation`, `investigation_object_index`, `execute_object_interaction`, `share_object_discovery`) and a small ROOM 714 vertical-slice seed (`ROOM_714`, `GLASS_CUP`, `BLOOD_STAIN`, `OPEN_WINDOW`, `VICTIM_ITEMS`, `PASSPORT`, `LAPTOP`). Independent of everything above it — touches no evidence/specialization/verdict table or function. |
| 21 | `020_fix_root_object_visibility.sql` | `open_investigation` seeds root objects (the location) as discovered + shared, plus a one-time idempotent backfill for sessions seeded before it. Without it no child object is ever visible. |
| 22 | `022_private_object_state_rls.sql` | `session_object_state` direct SELECT limited to `is_session_member AND (is_shared OR discovered_by = auth.uid())`. Closes the private-finding leak via direct reads and Realtime. |
| 23 | `023_session_object_state_grants.sql` | Table privileges: `session_object_state` SELECT-only for `authenticated`, nothing for `anon`/`public`; `investigation_objects` fully locked. Removes the default TRUNCATE/REFERENCES/TRIGGER grants. |
| 24 | `024_investigation_challenges.sql` | Investigation Challenge Engine: `investigation_challenges`, `session_challenge_attempts` (both RPC-only), `challenge_index`, `attempt_challenge`, internal helpers. Seeds the ROOM 714 tutorial `GUEST_FILE_LOOKUP` and removes PASSPORT's one-click `QUERY_GUEST_FILE`. |
| 25 | `025_phase5_workflows.sql` | Phase 5 Device / CCTV archive / Access workflows. Adds `state_workspace` + `yields` to `investigation_objects`, repeatable tool challenges, the `time_window` input, the evidence bridge (unlocks only through the authoritative `unlock_evidence`), recorded provenance (`session_evidence_sources`, RPC-only), and `run_challenge` / `object_workspace` / `evidence_provenance`. **Replaces** `execute_object_interaction` + `investigation_object_index` (019: private-object guard, no actions on hidden rows) and `challenge_index` + `attempt_challenge` (024: evidence-producing challenges require a shared object). Seeds ROOM 714 `DOOR_714`, `SECURITY_OFFICE`, `CCTV_ARCHIVE`, `DOOR_LOG_QUERY`, `CCTV_ARCHIVE_QUERY`, and the laptop device workspace. Ends with an explicit permission block for every public RPC it introduces or replaces. |
| 26 | `026_nested_object_visibility.sql` | **Applied to live (2026-09-30) and verified.** Nested-object privacy: a child object is visible/usable only if every ancestor exists, is discovered, and is shared or the caller's own (fail closed on missing parent, cycle, depth > 8). Adds internal `_object_ancestors_known` and the RLS helper `_object_state_row_visible` (authenticated-callable, so it checks the complete row boundary itself: membership, row exists, discovered, own privacy, ancestor chain — a direct call reveals nothing a SELECT would not); replaces `investigation_object_index`, `execute_object_interaction`, `share_object_discovery`, `challenge_index`, `_run_challenge`, `object_workspace`, `evidence_provenance` (each verbatim + the chain check) and the `session_object_state_select` policy. **Before applying, run its commented read-only pre-apply checks P1–P4 (ownership, schema CREATE, RLS enabled/not forced, no extra SELECT policy) and stop if any fails.** **Do not re-run 025 after it**; if 019/022/024/025 is re-run by mistake, re-run 026. |
| 27 | `027_validated_connections.sql` | **APPLIED + VERIFIED (applied manually by Hazem in the SQL Editor).** `verify_027_preapply.sql`: every row TRUE. `verify_027_postapply.sql`: every non-INFO row TRUE (INFO counters null as designed). Limits: 6/min per player; 20 failed per 10 min per team. **Never re-run.** Security-reviewed revision: Validated Connection Engine (shared, case-agnostic): authored `case_connection_rules` / `case_connection_conditions` (RPC-only), session tables for attempts / validated connections / applied effects, RPCs `propose_connection`, `settle_connection_effects`, `session_connection_state`. Every node must be known to the caller (readable `evidence_index` row — title-only does not count — or `_object_state_row_visible` from 026) before any rule is read. Wrong / unauthorized-node / draft / other-case all answer exactly `not_established`; success returns only the authored meaning (no rule ids, no unlock targets). Derived-evidence unlocks go through `unlock_evidence`; a refusal for the proposer's specialization is deferred as *pending* (settled later by a member who can unlock it), never surfaced as an error. Throttle: 6 proposals/min per player **plus** a team budget of 20 failed proposals per 10 min — the per-player limit alone lets a 4-player team brute-force ~300 pairs in ~12 min. Seeds no rules. Requires 026; run its read-only P1–P2 first. |
| 28 | `028_scene17_unpublish.sql` | **WRITTEN FOR REVIEW — NOT APPLIED. Production data change** (one catalogue row): `scene-17` → `is_published = false`, reusing the existing catalogue gate (`create_session` + `cases_select`). Read its trade-off note (blocks developer sessions through `create_session` too) before approving. **Recommendation: keep unapplied** while Scene 17 is in development (0 entitlements; app-level gating covers the pages). Revisit before any self-serve entitlement/purchase path exists. |
| 31 | `031_board_v2.sql` | **APPLIED + VERIFIED (security-reviewed revision 2) — applied manually by Hazem. Pre-apply 38/38 TRUE; post-apply 92 TRUE + 2 INFO NULL. NEVER re-run unless a documented repair procedure explicitly requires it. ENGINE SCHEMA + engine policy mirror.** Board V2 becomes the authoritative DB boundary: `board_items` (materials store only an uppercase ref, text forced empty), `board_threads` (tentative/support/tension — never "validated"), server-written `board_validations` (team-wide lock, no rule id), and `case_engine_policy` (server-only mirror of each case's `restrictedEvidence`; only `room-714 = title` is inserted, Scene 17 has no row → its evidence is never pinnable). `pin_board_material` reuses 026's `_object_state_row_visible` and additionally requires the object and every ancestor to be shared; `test_board_selection` is the only board path to 027 `propose_connection`. Author-only edits/deletes of team reasoning and threads, membership-checked. Before: `verify_031_preapply.sql` (all pass). After: `verify_031_postapply.sql` (all non-INFO pass). |
| 32 | `032_room714_connection_rules_DRAFT.sql` | **REVIEW-ONLY DRAFT — NOT APPLIED (canon-proof revision 2). CASE DATA (Room 714 rule rows).** `R714_NO_VICTIM_BLOOD` (F-01+F-02), `R714_N17_PAYMENTS` (R-04+R-05), `R714_COPY_AFTER_MESSAGE` (D-08+D-05): meanings re-derived clause by clause from the two nodes only (revision 1 meanings were not approvable). Step 1 inserts as inert `draft`; step 2 (commented) approves **and** sets `team_safe` — requires 033. **Hazem decisions (2026-10-01, documentation only — nothing seeded):** `R714_N17_PAYMENTS` — APPROVED IN PRINCIPLE AS TEAM-SAFE (do not seed yet; approval step stays commented); `R714_COPY_AFTER_MESSAGE` — APPROVED IN PRINCIPLE AS TEAM-SAFE (do not seed yet; approval step stays commented); `R714_NO_VICTIM_BLOOD` — NOT approved as a main authored connection; stays draft/inert, possible future tutorial/introductory validation only, excluded from any bulk approval unless Hazem explicitly approves it. The commented step 2 lists only `R714_N17_PAYMENTS` and `R714_COPY_AFTER_MESSAGE`. No rules seeded. **Pending addition (Hazem-approved 2026-10-01, documentation only — NOT yet in the 032 file; implement later):** `R714_NO_DEPARTURE_INDICATION` = R-01 + V-01 (records + field, a true cross-player joint rule), TEAM-SAFE, effects none, meaning exactly «رامي الخطيب هو نزيل الغرفة 714 والمبلّغ عن فقدانه، ولا يوجد ما يشير إلى مغادرته الفندق.» (the earlier «في سجل المراقبة» clause was rejected as unsupported by R-01/V-01). When implemented, step 2's approval set becomes exactly `R714_N17_PAYMENTS`, `R714_COPY_AFTER_MESSAGE`, `R714_NO_DEPARTURE_INDICATION`; `R714_NO_VICTIM_BLOOD` stays draft. Deferred until after the Dual-Case Validation Pass (Room 714 + Scene 17). |
| 33 | `033_joint_connections.sql` | **APPLIED + VERIFIED (security-reviewed revision 2) — applied manually by Hazem. Pre-apply 58 TRUE + 2 INFO; post-apply 87 TRUE + 2 INFO. NEVER re-run unless a documented repair procedure explicitly requires it. ENGINE (additive over live 027; requires 026, 027, 031).** Joint ("cooperative") connections. Adds `case_connection_rules.team_safe` + constraint *approved ⇒ team_safe* (solo and joint). Extracts 027's throttle (`_connection_throttled`, 6/60 s per player, 20 failed/10 min per team) and matcher (`_connection_match`, approved **and** team_safe only) verbatim and re-creates `propose_connection` with 027's membership, shape and privacy sections verbatim — one budget, one matcher for solo and joint. Joint RPCs: `open_joint_proposal`, `contribute_to_joint` (vouched by the contributor's own 027 readability, contributor = `auth.uid()`, one neutral refusal), `withdraw_joint_contribution` (own, while open), `close_joint_proposal` (participant), `test_joint_proposal` (participants; departed members ignored; incomplete = recorded miss), `joint_proposals` (masked view: refs only for mine or team-visible material). Lifecycle open → validated | closed. `session_joint_contributions` RPC-only; `session_joint_proposals` member-readable (no node data) + realtime signal. Does **not** edit the 027 file. Before: `verify_033_preapply.sql` (60 rows: 58 TRUE + 2 INFO). After: `verify_033_postapply.sql` (89 rows: 87 TRUE + 2 INFO). |
| 34 | `034_lock_legacy_board.sql` | **APPLIED + VERIFIED (revision 2) — applied manually by Hazem. Pre-apply 28 TRUE + 1 INFO; post-apply 34 TRUE + 1 INFO. Permissions only.** Makes legacy `board_notes`/`board_links` read-only history: revokes every privilege from PUBLIC/anon and INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER from authenticated (member SELECT + its policy kept), drops the five write policies. Deletes nothing; realtime publication untouched. Apply **only after** 031 is live (done) **and** the app's board has switched to the 031 RPCs (done in the Board V2 switch package) **and** that switch's QA is accepted. Before: `verify_034_preapply.sql` (29 rows: 28 TRUE + 1 INFO). After: `verify_034_postapply.sql` (35 rows: 34 TRUE + 1 INFO). |
| 35 | `035_case_distribution_channels.sql` | **APPLIED + VERIFIED — applied manually by Hazem. Pre-apply 77 rows: 75 TRUE + 2 INFO; post-apply 115 rows: 113 TRUE + 2 INFO. NEVER re-run unless a documented repair procedure explicitly requires it. ENGINE (server distribution layer; requires 017, 026, 027, 031, 033, 034).** One server readability rule `_evidence_readable(session, evidence)` — case distribution `specialization` (Room 714: today's has_specialization rule) or `channels` (shared lane = every member; channel item = members assigned that channel in this session); no engine-policy row = nothing readable (fail closed). `_evidence_row_visible` = readable, or title-only where the case policy is `title`. Re-creates (verbatim + the one rule) `evidence_index`, `unlockable_evidence`, `unlock_evidence`, `expiring_evidence`, `evidence_provenance`, `_board_material_team_visible` (hidden policy pins only shared-lane channel evidence), and the `session_evidence` SELECT policy (realtime filtered per subscriber). New server-only tables `case_channels`, `case_channel_seats`, `case_evidence_channels`, `session_member_channels`; channels assigned by a trigger on lobby → active from the authored seat plan (`CHANNEL_PLAN_MISSING` fails the start); `my_channels` RPC. Adds `case_engine_policy.distribution` (+ constraint channels ⇒ hidden). Seeds nothing (no Scene 17 config/evidence). 027 / 033 consume it unchanged. Before: `verify_035_preapply.sql` (77 rows: 75 TRUE + 2 INFO). After: `verify_035_postapply.sql` (115 rows: 113 TRUE + 2 INFO). |
| 36 | `036_scene17_vertical_slice_DEV.sql` | **APPLIED + VERIFIED manually by Hazem. Never re-run except through a documented repair procedure. DEVELOPMENT SCENE 17 VERTICAL SLICE — data + one generic nullability relaxation + open_case privacy hardening (requires 035).** §0: `evidence.owner_spec` DROP NOT NULL + column comment (non-destructive, idempotent, metadata-only, behind `lock_timeout = 5s`; run in the SQL Editor as one transaction; owner_spec = capability owner read only by the specialization distribution; NULL fails closed). §0b: `open_case(uuid)` re-created with the same signature, return type, SECURITY DEFINER and grants (EXECUTE: authenticated only); its insert is verbatim 004, but it now returns ONLY the caller-visible initial count (`_evidence_row_visible`) instead of the inserted-row count — 004 leaked a teammate's private initial-row count and who opened first. The only client caller ignores the value, so Room 714 is unchanged for players. Then seeds only: engine policy scene-17 = channels + hidden; channel catalogue A–H; the 2-player seat plan (seat 1 = A C E H, seat 2 = B D F G — other player counts fail closed); four canon-gated chapter-1 evidence rows — E05 قائمة المشتبهين (shared lane), E06 صفحة التدريب الأصلية للمشهد (A), E07 الصفحة الموجودة داخل ملف سلمى (A), E10 سجل أحداث نظام الصوت (B); their channel rows (E05 none). **E31 REJECTED** (entangled with the E19/E30 conflicts — no clean channel-F item exists; E10 replaces it). owner_spec NULL on all four — canon assigns no capability owner, so none is invented (channel controls distribution, specialization controls capability); Room 714 rows keep theirs (post R6/V11). media_path NULL until the scene-17 entries in scripts/lib/media-mapping.mjs are uploaded (separate approved step); E10 is text-only. No rules, objects, challenges, entities, or Room 714 data. Guarded + idempotent. Scene 17 stays `development`. **Executed pre-apply result** (`verify_036_preapply.sql`, as Hazem actually ran it before applying): 48 rows — 46 TRUE + 2 INFO, 0 FALSE. **Executed post-apply result** (`verify_036_postapply.sql`): 44 rows — 42 TRUE + 2 INFO, 0 FALSE. *Note:* the working-tree `verify_036_preapply.sql` was hardened (P1f/P1g added) after that live pre-apply execution, so its current static INFO composition (3 INFO: I0/I1/I2, 45 TRUE) differs from the historical revision Hazem actually ran (2 INFO, 46 TRUE) — this is expected drift in the file, not a discrepancy in what was verified live; do not rewrite this historical record to match the current file, and do not re-run a pre-apply verifier against a post-036 database. Live QA (after a started 2-player dev session): `verify_036_live_slice.sql` — channel ≠ owner_spec ≠ specialization (does not claim same-spec; the live allocator forbids it). |

`029_case_channels_PROPOSAL.sql` (case channels ≠ specializations) and `030_progressive_entities_PROPOSAL.sql` (progressive persons) are **design proposals, not migrations** — never run them as-is; each becomes a real migration only after its content/model decisions are approved.

`021_investigation_evidence_bridge_PROPOSAL.sql` is **not a migration** — an unapplied design draft kept for a later architecture decision. Never run it; it is not part of the setup order.

## Live database status (verified 2026-09-28)

**VERIFIED: the live DB matches the intended architecture.**

- `018` applied; `verify_live_state.sql` re-run afterwards with **every check PASSED**, including every `body_md5` MATCH. (It predates 019 and does not check the investigation-object or challenge tables — each of 019–025 carries its own post-apply verification queries.)
- `019`, `020`, `022`, `023`, `024` applied to live Supabase, each verified after application and covered by manual 2-player QA.
- `025` applied to live Supabase. Phase 5 Device / CCTV / Access workflows are live. Post-apply verification passed (sensitive-table grants, RLS, provenance-table protection, realtime exclusion, private-object guards, shared-before-evidence rule, time-range helpers, seeded ROOM 714 objects and challenges), and Phase 5 manual 2-player QA passed. EXECUTE on `execute_object_interaction(uuid, text, text)` and `investigation_object_index(uuid)` was verified and corrected manually on live; the committed `025` file now carries the explicit final permission block for all seven public RPCs it introduces or replaces, so a fresh environment reproduces the same final state.
- `026` applied to live (2026-09-30). Post-apply verification passed: helper EXECUTE grants, ancestor-chain check in every changed function, the new `session_object_state_select` policy, RLS enabled / not forced, single SELECT policy; live data unchanged against the pre-apply baseline.
- `027` applied to live (manually, by Hazem). Pre-apply checks all TRUE; post-apply checks all non-INFO rows TRUE. Seeds no rules — authored rule data is a separate, approval-gated step.
- `031` applied to live (manually, by Hazem). `verify_031_preapply.sql`: 38/38 TRUE. `verify_031_postapply.sql`: 94 rows — 92 TRUE + 2 INFO NULL, exactly as expected. **Never re-run** unless a documented repair procedure explicitly requires it. The app's Board (board, scene "add to board", case file pins) now reads `board_items` / `board_threads` / `board_validations` and writes only through the 031 RPCs; it no longer reads or writes `board_notes` / `board_links`.
- `034` applied to live (manually, by Hazem). `verify_034_preapply.sql`: 28 TRUE + 1 INFO. `verify_034_postapply.sql`: 34 TRUE + 1 INFO. Legacy `board_notes` / `board_links` are read-only member history; client writes are closed.
- `033` applied to live (manually, by Hazem). `verify_033_preapply.sql`: 60 rows — 58 TRUE + 2 INFO. `verify_033_postapply.sql`: 89 rows — 87 TRUE + 2 INFO. **Never re-run** unless a documented repair procedure explicitly requires it. It re-created `propose_connection` (027's contract + `team_safe`); `verify_027_postapply.sql` now describes the pre-033 body. The Board's joint-connection strip uses only its RPCs and the masked `joint_proposals` view.
- `035` applied to live (manually, by Hazem). `verify_035_preapply.sql`: 77 rows — 75 TRUE + 2 INFO. `verify_035_postapply.sql`: 115 rows — 113 TRUE + 2 INFO. **Never re-run** unless a documented repair procedure explicitly requires it. `verify_live_state.sql` body_md5 for the four evidence functions and `verify_031_postapply` B2 / `verify_033_postapply` now describe the pre-035 bodies.
- `036` applied to live (manually, by Hazem). `verify_036_preapply.sql` (as executed): 48 rows — 46 TRUE + 2 INFO. `verify_036_postapply.sql`: 44 rows — 42 TRUE + 2 INFO. **Never re-run** unless a documented repair procedure explicitly requires it — in particular, never re-run `verify_036_preapply.sql` against a post-036 database (see row 36 for the pre/post-apply INFO-composition drift note). Scene 17 stays `development` (data only — still not playable).
- `032` is **not** applied (case-data draft; two rules approved in principle only — see row 32; no rules seeded). Its step 2 can now run after Hazem's go-ahead, since 033 added `team_safe`.
- `028` is **not** applied — keep unapplied (see row 28).
- `021`, `029`, `030` are **not** applied (proposals only).

**Do not run `017` on the live DB.** It is kept only as the final step of a clean setup, and for repairing an accidental re-run of an old file.

**Do not re-run `019` or `024` on the live DB.** Real session progress now exists against their objects. Re-running `019`'s seed would restore PASSPORT's one-click `QUERY_GUEST_FILE` (bypassing the tutorial challenge), and re-running either file would put back the pre-`025` versions of `execute_object_interaction` / `investigation_object_index` (019) or `challenge_index` / `attempt_challenge` (024) — silently removing the Phase 5 private-object and shared-before-evidence guards. **If either is ever re-run by mistake, re-run `024` (only if `019` was re-run) and then `025`.** See `019`'s in-file warning before reshaping any object's states. `020`, `022`, `023`, `025` are idempotent, but there is no reason to re-run them.

`*` marks definitions that are superseded later in the sequence. The final version is the one from step 14, 16 or 18.

Media upload (`scripts/upload-content.mjs`) runs after step 16. It writes `evidence.media_path`.

## Legacy files: never run

| File | Why |
|---|---|
| `expiring_unlockable.sql` | Single-specialization `unlockable_evidence`, superseded by step 14. It has a guard and aborts on any DB that has the multi-specialization model. |
| `fix_expiring_evidence.sql` | Single-specialization `expiring_evidence`, superseded by step 14. Same guard. |

## Never re-run on a live database

| File | What a re-run does |
|---|---|
| `005_seed_room714.sql` | `delete from evidence where case_id = 'room-714'` **cascades to `session_evidence`**. That deletes every unlock in every ROOM 714 session, and also wipes `media_path`, F-07 and `expires_ck`. |
| `007`, `009`, `011`, `013` | Delete and reseed ROOM 714 timeline / characters / milestones / verdict content. |
| `001_schema.sql` | Recreates `session_members_unique_spec`, which blocks 5–8 player sessions. |
| `002_rls.sql` | Restores the old single-specialization `join_session`. |
| `003_seed.sql` | Resets `max_players` to 4 for every case. |
| `004_evidence.sql`, `010_automation.sql` | Restore single-specialization evidence functions. The `evidence_index` step fails on a return-type change, which rolls back the whole script in the SQL Editor. Under `psql` without `ON_ERROR_STOP` the other functions still regress. |
| `fix_multiplayer_specialization_access.sql` | Its `evidence_index` (still returning `media_path`) fails against the step-16 shape, rolling the whole script back in the SQL Editor. It also rebuilds every session's specialization assignment. |

**If an older file was re-run by mistake:** run `017_consolidate_current_state.sql`. It restores all definitions and config. It cannot restore data deleted by a seed file (005 / 007 / 009 / 011 / 013).

## What 017 reasserts

- **Functions**, as verbatim copies of the authoritative versions: `join_session`, `unlockable_evidence`, `unlock_evidence`, `expiring_evidence` (from step 14), and `evidence_index` (from step 16).
- **Config:**
  - `cases.max_players` default 8, and any case below 8 raised to 8
  - `session_members_unique_spec` dropped
  - ROOM 714 `start_ck = 1380`
  - `case-media` kept private
- **Grants:**
  - `assign_session_specializations` is not executable by `public` / `anon` / `authenticated`
  - `start_session` still calls it as the function owner
- **Realtime:** all ten client-subscribed tables are in `supabase_realtime`. It only adds, never removes.

It touches no gameplay rows and grants nothing new. It runs in one transaction and aborts if a prerequisite (steps 10 or 14) is missing.

## Verifying live state (read-only)

Run `verify_live_state.sql` in the SQL Editor. It is one `SELECT` with no writes, and each row reports expected / actual / PASS or FAIL for:
- config values
- the multi-specialization objects
- evidence functions using `has_specialization`
- the `evidence_index` shape
- grants
- realtime publication
- bucket privacy

`body_md5` rows show whether each live function body is byte-identical to the repo's authoritative definition.

## Rules for new migrations

- Number them after `018` (`019_…`), and add them to the table above.
- Never `create or replace` a function in a new file without starting from its current authoritative body, which is 017 or the file named here.
- New evidence or session functions must check access with `is_session_member` + `has_specialization` / `my_specializations`, never `my_specialization`.
- Seed files that `delete` case content must never be run against a database with live sessions.
- **Grants on Supabase:** `revoke ... from public` does not remove the direct EXECUTE grants that Supabase gives `anon` / `authenticated` on new `public` functions.
  - An internal helper (definer, no caller check) needs `revoke execute ... from public, anon, authenticated`.
  - `create or replace` keeps existing grants.
  - `drop` + `create` restores the defaults, so the revoke must be repeated after it.
