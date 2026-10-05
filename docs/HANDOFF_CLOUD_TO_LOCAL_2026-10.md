# IFADA — Cloud → Local Claude Code Handoff (2026-10)

> Operational handoff for a **fresh Claude Code session in VS Code**. Read this file first, then the reading list in §25.
> Written from the repository state at commit `0cdb3bb` (plus this document's own commit). Where a fact comes from Hazem's
> direction rather than from the repository, it is marked **[Hazem]**. Where the repository disagrees, it is marked **⚠ CONFLICT**.

---

## 0. TL;DR for the next Claude

- Cloud work lives in **`hazem001-commits/ifada-cloud-reset`**, branch **`claude/practical-maxwell-jwsvi7`**. `main` there is untouched.
- That repository is a **temporary reset workspace, not the permanent source of truth**. The work will later be integrated into the original **`hebasamer943/ifada2`** (local path `C:\Users\hebas\ifada`) — **safely, never with reset/clean/stash/force** (§24).
- Supabase: migrations **037 and 038 are LIVE + VERIFIED. Never re-run them.** No SQL was applied from the Cloud session; Hazem applies SQL manually.
- RESET-1 and RESET-2 are **CLOSED**. RESET-2 mobile polish and **Board Mobile Rescue are COMPLETE and pushed**. **RESET-3 has NOT started.**
- Non-negotiables: **mobile-first**, **everyone investigates (specialization = capability)**, **database is the only live rule authority**, **realtime = signal → authoritative refetch**, **authored evidence artifacts are the evidence**, **progressive discovery**, **never leak private/hidden content** (§7, §8, §9, §12, §18).

---

## 1. Repository state (verified at handoff time)

| Item | Value |
|---|---|
| Repository | `hazem001-commits/ifada-cloud-reset` (`origin` = https://github.com/hazem001-commits/ifada-cloud-reset) |
| Development branch | `claude/practical-maxwell-jwsvi7` |
| Feature HEAD before this handoff commit | `0cdb3bbf0f0376b306cd9bc3b0dc0be2393f8e6a` (`0cdb3bb`) |
| `origin/claude/practical-maxwell-jwsvi7` | `0cdb3bb` — identical to local HEAD (everything pushed) |
| `origin/main` | `9340dd3dbaadd731aea5c5e3f08ab06e79290e4d` (`9340dd3`, "IFADA cloud reset checkpoint") — **never modified by the Cloud session** |
| Working tree | clean (no staged, unstaged or untracked files) before this document |
| Local-only / checkpoint commits | none (WIP checkpoints were squashed before push) |

### Commit history on the feature branch (oldest → newest)

| Commit | Meaning |
|---|---|
| `9340dd3` | Baseline: IFADA cloud reset checkpoint (= `main`) |
| `167ee81` | feat(runtime): RESET-1 investigation runtime foundation (`sql/037`, runtime TS model, inspector) |
| `d99bca9` | fix(runtime): harden RESET-1 migration invariants (atomic 037, approved-rule guards, mutation tests) |
| `e6b266b` | fix(multiplayer): sync object discoveries in realtime (content-free broadcast → refetch) |
| `79d93df` | feat(gameplay): transform Room 714 opening investigation (RESET-2: `sql/038`, briefing, Pulse, Leads, Case File provenance, mobile sheets) |
| `b7e3c91` | fix(gameplay): everyone notices Room 714; specialization is capability (038 noticing model correction) |
| `506a569` | fix(sql): make 038 Z3 verifier semantic instead of md5 |
| `069bceb` | fix(ui): polish Room 714 mobile investigation experience |
| `0cdb3bb` | fix(board): redesign mobile shared investigation space (Board Mobile Rescue) |
| *(this doc)* | docs: add cloud-to-local IFADA handoff (+ `sql/MIGRATIONS.md` 038 status → LIVE) |

**Nothing after RESET-2 / Board Mobile Rescue has started.** No RESET-3 code exists.

---

## 2. Project in one paragraph

IFADA is a premium, Arabic-first (RTL), multiplayer (2–8 players) cooperative investigation game. Next.js 16 (this is **not** the Next.js of your training data — read `node_modules/next/dist/docs/` before writing framework code; see `AGENTS.md`), Supabase (Postgres + RLS + SECURITY DEFINER RPCs + Realtime + private Storage), LiveKit voice, Groq for bounded interrogation/AI tools. Two cases: **Room 714** (`room-714`, the main playable case) and **Scene 17** (`scene-17`, a technical development slice). Players hold one or more **specializations** (field, digital, forensics, records); the server decides what each player may read.

---

## 3. Repository map

```
src/
  app/case/[code]/            the in-case client
    CaseWorkspace.tsx         tabs, layout, realtime wiring, Leads pill, briefing
    CaseNav.tsx               header + tab strip (mobile two-row header)
    CaseTimeBar.tsx           case clock (old evidence-title ticker suppressed for Room 714)
    CaseAutomation.tsx        clock/milestones/events
    investigation/            InvestigationEngine, InspectionDossier, ShareAction, labels.ts
      scene/                  RoomScene, sceneGeometry (image-relative), SceneHotspot, ObjectCloseUp, LocationPlaque
      inquiry/                "اسأل التحقيق" grounded search UI
    play/                     RESET-2 play layer: PlayContext, TeamPresence (Pulse), LeadThreads, CaseBriefing,
                              HandoffNote, NoticeAction, Sheet, useModalFocus
    casefile/                 Case File (custody/provenance), artifact plates
    board/                    Board V2: InvestigationBoard, TouchBoard (mobile), BoardPiece, HypothesisSheet,
                              JointStrip, boardModel, boardStore, jointModel
    evidence/                 type-true viewers: audio/, video/, document/, image/, phone/, EvidenceExaminationRoom
    runtime/                  useRuntimeState, RuntimeInspector (DEV ONLY)
  cases/                      per-case contract + presentation (room-714/, scene-17/, registry, presentation.ts)
  lib/runtime/                runtime TS mirror: types, projection, pulse, authoring lint, conditions, devGate
  lib/realtime/objectSync.ts  content-free broadcast signal for private discoveries
  lib/ai/                     knowledge.ts (AuthorizedKnowledge), provider, stressTest, hypothesis
  lib/play/model.ts           pure play-layer model (presence, threads, handoffs)
  server/cases/               server-only case data (room-714/media.ts, connections.ts, devAccess)
  app/api/                    interrogate, case-inquiry, hypothesis-test, evidence-media, scene-media,
                              private-evidence, voice-token, dev/session
sql/                          migrations + verifiers + MIGRATIONS.md (source of truth for order/status)
tests/                        node:test suites (board, connections, play, realtime, cases, sql-local …)
  sql-local/run-local.mjs     replays the whole migration chain on a LOCAL throwaway Postgres (never Supabase)
scripts/upload-content.mjs    media upload; scripts/lib/media-mapping.mjs = the ONLY approved media map
docs/                         design docs, case docs, qa/RESET2_LIVE_QA.md, this handoff
.claude/agents/, .claude/skills/, .claude/hooks/   project agents/skills and safety hooks
```

---

## 4. Original project — return target (DO NOT TOUCH from Cloud)

- Original GitHub repository: **`hebasamer943/ifada2`**
- Known local path on Heba's laptop: **`C:\Users\hebas\ifada`**
- Development returns to **Claude Code inside VS Code on Heba's laptop**.
- That repository/laptop may contain **intentional local work**. The integration must therefore **not** start with `git reset`, `git clean`, `git stash`, a blind `git pull`, a blind branch overwrite or a force push. Inspect and protect first, integrate on a dedicated branch. The plan is in §24. **Nothing in that repository was modified by the Cloud session.**

---

## 5. Database / migration truth

All SQL is run **manually by Hazem in the Supabase SQL Editor**. Nothing runs automatically. `sql/MIGRATIONS.md` is the order/status source of truth (filenames are **not** a safe order).

| # | File | Status | What it materially changed |
|---|---|---|---|
| 019 | `019_investigation_objects.sql` | **LIVE + VERIFIED** | Interactive Investigation Engine: `investigation_objects`, `session_object_state`, `open_investigation`, `investigation_object_index`, `execute_object_interaction`, `share_object_discovery`. **Never re-run** (real progress exists; re-seed would restore a one-click passport path). |
| 020 | `020_fix_root_object_visibility.sql` | **LIVE + VERIFIED** | Root objects (location) seeded discovered + shared; backfill. |
| 021 | `021_investigation_evidence_bridge_PROPOSAL.sql` | **NEVER RUN — PROPOSAL ONLY** | Design draft. Not part of setup order. |
| 022 | `022_private_object_state_rls.sql` | **LIVE + VERIFIED** | `session_object_state` SELECT = member AND (shared OR mine). Closes private-find leak (direct + Realtime). |
| 023 | `023_session_object_state_grants.sql` | **LIVE + VERIFIED** | Table privileges locked down. |
| 024 | `024_investigation_challenges.sql` | **LIVE + VERIFIED** | Challenge engine (`challenge_index`, `attempt_challenge`), Room 714 `GUEST_FILE_LOOKUP`. **Never re-run.** |
| 025 | `025_phase5_workflows.sql` | **LIVE + VERIFIED** | Device / CCTV archive / access workflows, `time_window` input, evidence bridge, `DOOR_LOG_QUERY` (`max_width: 90`). |
| 026 | `026_nested_object_visibility.sql` | **LIVE + VERIFIED** (2026-09-30) | Ancestor-chain privacy: a child is visible only if every ancestor is discovered and shared/own. |
| 027 | `027_validated_connections.sql` | **LIVE + VERIFIED** | Validated-connection engine (no rules seeded). |
| 028 | `028_scene17_unpublish.sql` | **WRITTEN ONLY / NOT APPLIED** — keep unapplied | Would unpublish `scene-17`. |
| 029 | `029_case_channels_PROPOSAL.sql` | **PROPOSAL ONLY** | Case channels ≠ specializations. |
| 030 | `030_progressive_entities_PROPOSAL.sql` | **PROPOSAL ONLY** | Progressive persons. |
| 031 | `031_board_v2.sql` | **LIVE + VERIFIED** | Board V2 tables/RPCs (`board_items`, `board_threads`, `board_validations`, pin/link/test…). **Never re-run.** |
| 032 | `032_room714_connection_rules_DRAFT.sql` | **WRITTEN ONLY / NOT APPLIED** | Room 714 connection-rule data draft; needs Hazem's go-ahead. |
| 033 | `033_joint_connections.sql` | **LIVE + VERIFIED** | Joint (masked) contributions. **Never re-run.** |
| 034 | `034_lock_legacy_board.sql` | **LIVE + VERIFIED** | Legacy `board_notes`/`board_links` read-only. |
| 035 | `035_case_distribution_channels.sql` | **LIVE + VERIFIED** | Distribution channels + readability (title-only vs hidden). **Never re-run.** |
| 036 | `036_scene17_vertical_slice_DEV.sql` | **LIVE + VERIFIED** | Scene 17 dev slice + `open_case` privacy hardening. **Never re-run.** |
| 037 | `037_investigation_runtime.sql` | **LIVE + VERIFIED** | RESET-1 runtime engine (§8). **Never re-run.** |
| 038 | `038_room714_opening_runtime.sql` | **LIVE + VERIFIED** [Hazem] — `verify_038_postapply.sql`: **85 checks passed** | RESET-2 Room 714 opening content (§11). **Never re-run.** |

> ⚠ **DO NOT casually re-run any already-live migration.** Several re-create functions or reseed data that live sessions depend on. A repair needs an explicit, documented procedure and Hazem's approval. `017` must never be run on live.

Note: the comment headers inside `sql/037_investigation_runtime.sql` and `sql/038_room714_opening_runtime.sql` still say "REVIEW ONLY — NOT APPLIED". That is the **historical** authoring status (the files are kept byte-stable as applied); `sql/MIGRATIONS.md` and this table are authoritative: **both are LIVE**.

Verification files: `sql/verify_0XX_preapply.sql` / `verify_0XX_postapply.sql` (read-only SELECTs). The 038 post-verifier's Z3 block checks 037's protections **semantically** (gated clause in `open_investigation`; `_object_ancestors_known`, gated hiding and `'HIDDEN'` redaction in `investigation_object_index`) — not by environment-specific md5.

Local SQL replay (throwaway Postgres only): `IFADA_LOCAL_PG_HOST=<socket dir> node tests/sql-local/run-local.mjs` → replays 001…036, 037 (twice), 038 (twice), verifiers, two-player scenarios and mutation tests (037: 14/14, 038: 11/11). It refuses Supabase-looking hosts.

---

## 6. RESET program status

| Stage | Status |
|---|---|
| RESET-1 — Investigation Runtime Foundation | **CLOSED** (037 live) |
| RESET-2 — Room 714 Opening Investigation | **CLOSED** (038 live) |
| RESET-2 Mobile Polish | **COMPLETE** (`069bceb`) |
| Board Mobile Rescue | **COMPLETE, committed and pushed** (`0cdb3bb`) — live retest still to be done by the team |
| RESET-3 — Hotel Systems & Place Progression | **NOT STARTED** |

Intended later roadmap (direction, **not immutable** — Hazem keeps requesting changes, so keep the architecture extensible):

1. **RESET-3** — Hotel systems / place progression (Security Office reveal, CCTV, hotel-system leads).
2. **RESET-4** — Living Case: M1, RAMI_FOUND, world reaction.
3. **RESET-5** — Interrogation V2 + its security boundary (fix the `/api/interrogate` gap first, §18).
4. **RESET-6** — Room 714 Movement Reconstruction (signature mechanic, §20).
5. **RESET-7** — Full Room 714 integration / remaining content / AI investigation instruments.
6. Scene 17 full implementation → final end-to-end QA → final cinematic/UI polish.

---

## 7. NON-NEGOTIABLE PRODUCT DIRECTION GOING FORWARD [Hazem]

### A. Mobile-first, not responsive-afterthought
The **phone is the primary design platform.** Desktop must also be excellent, but every feature is designed **first for a 360–430px touch screen**, then expanded for laptop. Never design desktop and squeeze it down. First question for every feature: *"How does a player use this comfortably with one or two thumbs on a phone?"* This applies to scene investigation, Board, Case File, evidence viewers, CCTV, interrogation, movement reconstruction, Leads, Pulse, voice, timelines, hearing, navigation and AI tools. Laptop uses extra space intelligently; it does not define the core interaction. Practical rules already in the code: 44px targets, `100dvh`, safe-area insets, no horizontal page scroll, no hover-only interaction, reduced-motion, RTL.

### B. The room image is not the entire game
The investigation photo is one surface, not the product identity. Case entry should feel authored and cinematic (arrival → briefing → communication → spatial/context transition → investigation world → scene interaction). Be creative.

### C. Evidence as real artifacts
When an authored asset exists and is **approved** (PDF, image, WhatsApp screenshot, document, audio, video/still, official record, photo, report, call log) — **that file is the evidence**. Present the original artifact professionally (right viewer, zoom, inspection, metadata, annotations, authored context, comparison, analysis, provenance). Never casually replace it with a generic generated card of rewritten text, and never let every item look like the same IFADA template. Authored text appears as supporting detail ("تفاصيل الدليل" drawer, `evidence/authoredContext.ts`), not as a replacement.

### D. Progressive discovery
Never show all files at once, never a folder browser of everything that exists. Material appears only when investigation legitimately produces/reveals it. **Case File = what the player/team actually obtained**, never a catalogue of future content (Room 714's `worldDiscoveryOnly` contract flag suppresses future-title surfaces).

### E. Original media mapping matters
Preserve the APPROVED / HOLD / REJECT decisions (§14). Never silently substitute text for an approved asset; never silently wire HOLD/REJECT assets; where an asset is unresolved, keep the gameplay path functional without pretending it is approved. The only approved map is `scripts/lib/media-mapping.mjs` (+ server-only object close-ups in `src/server/cases/room-714/media.ts`). Adding a mapping is a **human decision**, never an inference from a filename.

### F. Extensible command / action model
New interactions, commands, viewers, tools and case-specific behaviour will keep coming. Prefer reusable primitives (contracts in `src/cases/*/contract.ts`, presentations, runtime rules, viewer routing in `evidence/classify.ts`) over giant switch statements and one-off flows — but avoid premature over-engineering: build a primitive when more than one case genuinely needs it.

---

## 8. RESET-1 technical architecture (037)

**Most important invariant: THE DATABASE IS THE SOLE LIVE RUNTIME RULE AUTHORITY.** TypeScript (`src/lib/runtime/*`) may validate (authoring lint mirrors the 037 validator), project, render and test — it must **never** become a second live rule engine.

Authored (server-only) tables:
- `case_runtime_nodes` — node → fixed coarse Pulse category.
- `case_leads` — lead code, label (phrased as a question), category, order.
- `case_world_states` — world states; `major` flag guarded against change under approved rules.
- `case_runtime_rules` — **the only live rule source**. `status` draft/approved; `scope` **actor** (affects only the acting player's own private leads; can never change the world, a team lead or deliver material) or **team**. `conditions` (all-of: object_state, object_discovered, evidence_held, lead_status, world_state, connection_validated …) → `effects` (open/follow/close lead, reveal gated object, reach world state, deliver runtime-only material, advance object). A validation trigger checks shape always and, on approval, references + an inductive causality rule (a major world state / followed lead / advanced object needs real progression, never evidence alone, never a mere reveal or initial state, never its own aftermath).

Session tables: `session_leads` (holder-or-shared RLS), `session_world_state` (members), `session_pulses` (members; safe columns only: actor, category, time), RPC-only `session_pulse_sources`, `session_runtime_firings` (once-only ledger → idempotency), `session_runtime_effects`, `session_runtime_provenance`.

Key mechanics:
- **Gated objects:** `investigation_objects.gated`. `open_investigation` never seeds them; `investigation_object_index` never lists an unrevealed or teammate-private gated object (no title, code, breadcrumb or count).
- **Runtime-only material:** evidence with `requires = '{@RUNTIME}'` and not initial. The legacy `unlock_evidence` refuses it on every player path; only the runtime delivers it, under the same 035 readability + expiry rules.
- **Open-case grants are not discoveries:** a non-gated root object never satisfies `object_discovered`.
- **Concurrency/serialization:** deferred constraint triggers → `_runtime_cascade_safe` → `_runtime_cascade` under a per-session `pg_advisory_xact_lock`; each firing is a subtransaction with a 250 ms lock wait; ≤ 32 firings / transaction, ≤ 8 passes; a runaway rolls back only that cascade (logged), never the player's action. Read-time auto-advance cascades as SYSTEM.
- **Approved-rule guards:** SECURITY DEFINER triggers refuse changing identity/gating/initial state/parent/existence of objects (and ancestors), leads, evidence, delivered material's `requires`/`is_initial`, and TRUNCATE, while an approved rule depends on them (draft first).
- **Read model / RPCs:** `runtime_state`, `runtime_provenance`, `share_lead`, `runtime_settle` (authenticated only). Client: `src/app/case/[code]/runtime/useRuntimeState.ts`, `src/lib/runtime/projection.ts`.

---

## 9. Realtime model

Problem: RLS (022/026) intentionally prevents a teammate from receiving another player's **private** `session_object_state` row, so `postgres_changes` alone never told teammates that *something* changed.

Fix (`e6b266b`, `src/lib/realtime/objectSync.ts`): whoever acts broadcasts a **content-free** signal on the session channel (`investigation:<session>`): no code, no state, no title. Every receiver **refetches** via `investigation_object_index` / `runtime_state` (server-side privacy projection) and sees only what it may ("a teammate has something here").

**Invariant: REALTIME SIGNAL → AUTHORITATIVE REFETCH.** Never trust a realtime payload as game state; payloads are read only for `session_id` to drop other sessions' events. The same pattern is used by the Board (`board_*` tables, joint proposals) and the runtime (leads/pulses). Each subscribing component uses a unique channel topic (`useId`) to avoid duplicate-topic crashes.

---

## 10. Investigation Pulse

Taxonomy (`src/lib/runtime/types.ts` → `PULSE_CATEGORIES`): **PERSON, PLACE, TIME, DEVICE, MOVEMENT, PHYSICAL_TRACE, RECORD, NEW_ACTION**. (No `CONTRADICTION` — removed by the RESET-1 hardening.) Room 714's opening uses the coarse categories it needs (physical trace, place, person, device, movement, time).

Pulse is **not evidence**. It must never expose an evidence code, object code, title, body, filename, hidden person, hidden place, specialization, distribution channel, counts that reveal hidden facts, or solution information. Its only job: make teammates **talk**. Pulse never enters AI context. UI: `play/TeamPresence.tsx` (avatar ring + category; on phones only the category word) and the "أثر الفريق" (team trail) sheet.

---

## 11. RESET-2 player journey (Room 714, fresh session after 038)

`briefing → room investigation → private discovery → Pulse → deliberate sharing → specialist transformation → material/result → Lead → Case File provenance`

- **Arrival:** `CaseBriefing` — V-01 (missing-person report) readable only by its holder; others see redaction bars and who holds it; team capabilities listed. Only V-01 is held at start.
- **Noticing:** every ordinary visible object can be noticed by **every** specialization (§12). A private find emits a category-only Pulse to teammates.
- **Sharing:** `ShareAction` (shares private ancestors too — 026 chain). Material reaches the Case File only when the find is team-known.
- **Flows:**
  - **Laptop** → notice → share → Digital inspects device → recover draft → **D-01** (+ private insight lead `L714_DRAFT` for its reader).
  - **Belongings / Passport** → notice → Records `GUEST_FILE_LOOKUP` (works on a private find) → share → **R-01** (+ `L714_GUEST`).
  - **Blood trace** (child of glass) → notice → Forensics collect sample → request lab (background ~150 s) → share → **F-02** (+ `L714_BLOOD`).
  - **Door** → notice → share → Digital `DOOR_LOG_QUERY` with a **player-supplied time window**, max **90 minutes**; a wider window is a neutral `too_broad` miss; the authored range is never exposed → **D-02** (+ `L714_MASTER_KEY`; follows `L714_DRAFT`).
  - **Whole room documented and shared** (glass, stain, window, belongings, passport, laptop) → **F-01** scene report; team lead `L714_ROOM` closes.
- **Leads** (`play/LeadThreads.tsx`): questions, not a quest log. Insight leads are **private** to the reader until they tap "أخبر الفريق" (`share_lead`). Only `L714_ROOM` has a pointer (to the room).
- **Case File:** custody/provenance per item ("how it entered the investigation"), produced-by-play material only; the restricted owner-readable rule applies (others see the title only).
- **Chapter boundary:** all other Room 714 evidence is runtime-only with no delivering rule; `SECURITY_OFFICE` is gated and unrevealed. Sessions created before 038 keep what they already held — use a **fresh session** to test the opening.

Key files: `sql/038_room714_opening_runtime.sql`, `src/cases/room-714/presentation.ts` (`OPENING`: briefing, capabilities, handoffs, produces, leadPointers, custody), `src/cases/room-714/contract.ts`, `src/app/case/[code]/play/*`, `investigation/InspectionDossier.tsx`. Live QA checklist: `docs/qa/RESET2_LIVE_QA.md`.

---

## 12. Specialization philosophy [Hazem — preserved in 038 and tests]

**EVERYONE INVESTIGATES. SPECIALIZATION = CAPABILITY / TRANSFORMATION. SPECIALIZATION ≠ CONTENT QUANTITY.**

- Everyone can notice a laptop → **Digital** deeply inspects it.
- Everyone can notice blood → **Forensics** collects/processes it.
- Everyone can notice a passport → **Records** resolves institutional information.
- Everyone can notice the door → **Digital** queries its access log.

Never make players "blind" to ordinary visible objects because of their specialization. Fine-grained specialist observations are allowed when logically justified (e.g., forensics sees the stain *and* that it deserves collection). **No artificial mutual dependency:** no rule demands an input from another player's specialization; a player holding several capabilities may use them all. Asymmetry comes from private discovery, timing, choice, transformation, restricted results, private insight leads and Pulse. Regression-protected by `tests/connections/sql038.test.ts`, `tests/sql-local/038_room714_opening.sql` and the 038 mutation tests.

---

## 13. Room 714 canon (boundaries)

- Victim: **Rami Al-Khateeb** (رامي الخطيب).
- **Adam Al-Khatib** is **Rami's brother** [Hazem].
- The **hotel maintenance technician is a separate person — NOT Adam** [Hazem].
  - ⚠ **CONFLICT:** `sql/005_seed_room714.sql` still names the technician "آدم" (V-06 title "إفادة فني الصيانة — آدم" and "آدم ر." in the R-02 maintenance report). This is live seed content. Do **not** silently edit canon; raise it with Hazem and fix it through an approved content migration.
- **D-06 is NOT a playable raw video.** `NOV_17_RAW.mp4` is **withheld — never expose it**; D-06 may only become a recovered still/frame/description.
- **D-08 recipient: unresolved.** Do not state or imply one.
- **Service level M1** sits between floors 7 and 8 [Hazem]; the timeline engine knows M1 as a place.
- **RAMI_FOUND** must come from actual later gameplay/search at M1 (RESET-4).
- **F-04** is aftermath/medical material — it must **never cause** RAMI_FOUND.
- **RAMI_DIED** is a later Living Case event.
- RESET-2 created **none** of: RAMI_FOUND, RAMI_DIED, M1 discovery completion, F-04 aftermath, F-07 aftermath (038 holds them; mutation tests guard it).
- The killer/solution, suspects' guilt, motives, evidence facts, timestamps and forensic results are **canon** — never change them without Hazem.

---

## 14. Room 714 media status

Sources: `scripts/lib/media-mapping.mjs` (the only approved evidence→file map), `src/server/cases/room-714/media.ts` (object close-ups, server-only paths), `docs/IFADA_MASTER_GAME_RESET_v1.md` §§2, 8 (HOLD set and per-code table). Content files live in `content-source/` on the original project — **not present in this Cloud repository** (and guarded by a commit hook).

| Status | Items |
|---|---|
| **APPROVED / ACTIVE (mapped)** | D-03, V-03, V-08, D-05, D-04, R-05, R-04, R-10, D-08 (Group A "SAFE TO MAP"), **F-06** (Batch 1A, M1 railing image), **R-08** (Batch 1D, Samer call log). Scene 17: E05, E06, E07 (dev slice). |
| **Object close-ups (approved, server-only)** | Room 714 objects e.g. PASSPORT (`objects/passport-01.png`), BLOOD_STAIN (`objects/blood-stain-01.png`), VICTIM_ITEMS phone/wallet — see `media.ts`. |
| **HOLD** (project HOLD set) | D-06, D-02, D-07, R-02, R-06, R-07, R-09, F-03, F-04, F-07, V-02, V-04, V-05, V-06, V-09, plus GLASS_CUP and OPEN_WINDOW assets. |
| **PENDING APPROVAL (blocked in the upload script)** | `e30-karim-handwritten-confession.png`, `kareem-interview-02.mp3`, `nabil-interview-01.mp3`, `rami-icu-statement-01.mp3`, `e29-service-corridor-search.mp4`, everything under `/visual-bible/`. |
| **WITHHELD** | `NOV_17_RAW.mp4` (D-06 raw video). |
| **D-01** | Asset exists but is **unmapped** (wording conflict) — use the safe authored text representation until Hazem approves an asset. |
| **NEEDS HUMAN REVIEW** | V-02 / V-05 audio need human listening if still unresolved. |

⚠ **Uncertainty:** Hazem's brief also lists **V-09 REJECT** and **F-03 REJECT**; the repository only records them as **HOLD**. Treat them as **not wireable** either way and confirm the final label with Hazem. Do not invent statuses beyond this table.

---

## 15. Evidence viewer philosophy

Routing (`src/app/case/[code]/evidence/classify.ts`, `EvidenceExaminationRoom.tsx`): **audio → Audio Station**, **video → Video Station**, **PDF/document → document / official-record viewer**, **image → viewer chosen by its actual meaning** (photo, CCTV still, physical trace…), **phone/chat → phone presentation**, **CCTV → investigation workstation**. The original media stays the central artifact; authored text/context is a supporting drawer. Media is served only through signed, short-lived URLs from server routes (`/api/evidence-media`, `/api/scene-media`, `/api/private-evidence`); `media_path` never reaches the client.

---

## 16. Mobile state (latest: `069bceb`, `0cdb3bb`)

- **RoomScene** (`investigation/scene/`): phone-first **portrait composition**. The photo starts directly under a compact place plaque (no black band), is cropped sideways only down to the investigation objects (`anchorsSafe`), and keeps a reserved bottom strip for the off-frame door entry and the Leads pill. Hotspots are **image-relative** (source pixels, one shared transform with the image and focus zoom); touch targets ≥ 44px; tap works without hover; touch-specific hint.
- **Dossier sheet:** dense, title + state + primary action visible without scrolling at 360/390/430; 44px back; grip; safe-area bottom padding. Close-ups start with the room view on phones (they used to cover child hotspots).
- **Header:** two deliberate rows on phones (identity · team · voice icon / scrollable tabs with snap, edge fades only where more tabs exist, active tab kept in view); slim clock line; single-row header on short landscape.
- **Leads:** thumb pill on the investigation tab (`CaseWorkspace`), hidden while a dossier is focused; sheet with private/team threads.
- **Pulse:** avatar ring + category only on phones (identity never pushed out).
- **Case File:** compact header/exhibit on phones.
- **Landscape:** single-row header; side panels where the height is short.
- `100dvh`, safe-area insets, reduced motion and RTL throughout. The DEV runtime inspector sits at the top on touch/tablet.
- Geometry tests: `tests/play/roomSceneMobile.test.ts`.
- **Not yet verified:** the real protected scene photo on real phones — follow `docs/qa/RESET2_LIVE_QA.md`.

---

## 17. Board Mobile Rescue — COMPLETE (`0cdb3bb`, pushed)

- **What was wrong:** on phones the Board became a **stacked list** (`groupForStack`, layout "stack"), so spatial reasoning and threads were lost. Header + ledger + legend ate the top of the screen; a crowded fixed toolbar held every action; linking was ambiguous.
- **Redesign:** `board/TouchBoard.tsx` (phones and touch tablets ≤ 1100px with a coarse pointer). The **same spatial board** (shared normalized positions, threads, lanes) sits in a fixed world of 1300×820 under a camera. Desktop (`InvestigationBoard` canvas + toolbar) is **unchanged**.
- **Gestures:** tap = focus; press-and-hold (~420 ms) then drag = move (saved via `move_board_item`); drag on empty space = pan; two fingers = pinch zoom anchored under the fingers; +/−/"whole board" dock; zoomed out = overview (titles only, readable ~10px); pan bounds keep the board on screen; rotation keeps the camera; keyboard focus on an off-screen node pans to it; `overflow: clip` prevents focus-scroll camera shifts.
- **Node focus:** non-modal bottom panel (side column on wide/landscape) with type, title, author note, restricted note, relations (tap a row to select that pair), primary actions, secondary actions and a 44px close. The camera reveals the node clear of the panel.
- **Linking:** explicit mode "اربط بمادة أخرى" → banner "اختر ما تربطه بـ «…»" + cancel; candidates pulse; press-and-hold is disabled in this mode → tap the second node → the camera frames both → pair panel: test link / link tentatively / support / tension / add a third / unlink. Same store paths as desktop.
- **Add:** thumb "+" → sheet: material from the investigation (tray) or a team thought (question / hypothesis / recorded fact). Confirmed links + thread legend sit behind the "روابط مثبتة" chip.
- **Realtime:** unchanged signal → refetch. Verified with two touch players (Layla 360 adds a question → Omar sees 7 → 8 items; Omar links → Layla sees 3 → 4 threads).
- **Tested:** 360×800, 390×844, 430×932, 768×1024 (touch), 844×390 landscape, 1440×900 desktop regression: no horizontal scroll, primary actions above the fold, 0 console errors. Tests: `tests/board/board.test.ts` test 18 (touch canvas guarantees).
- **Remaining:** live retest on real devices against live Supabase.

---

## 18. Security / authorization invariants

- **Private discoveries:** `session_object_state` RLS = member AND (shared OR mine) (022); a teammate sees a private find only as `HIDDEN` ("a teammate has something here") through `investigation_object_index`.
- **Nested privacy:** a child is visible only if every ancestor is discovered and shared/own (026); sharing a child shares its private ancestor chain (`labels.privateAncestors`).
- **Evidence readability (035):** per-case policy — Room 714 shows restricted material **title-only** to non-owners; Scene 17 (`restrictedEvidence: 'hidden'`) hides channel-private material entirely, title included.
- **Scene 17 channel privacy:** channel material never leaks to non-holders (title, count or existence).
- **Signed media routes only;** `media_path` never client-side (a hook guards it); the **service role is server-only** (`SUPABASE_SERVICE_ROLE_KEY` never in client code).
- **AuthorizedKnowledge** (`src/lib/ai/knowledge.ts`): AI receives only what the asking player may read. Pulse never enters AI. Private Leads stay private. Gated places never leak title/code/count.
- **⚠ KNOWN RESET-5 BLOCKER:** `src/app/api/interrogate/route.ts` checks only that the evidence code exists in `session_evidence` for the session (lines ~129–137), **not that the asking player can read it** (035 readability / channel privacy). A player could confront a character with title-only or another channel's evidence. **Do not expand interrogation before fixing this** (route it through the same readability/AuthorizedKnowledge check).

---

## 19. AI product philosophy

AI is an **investigation instrument** — never a generic chatbot, solver, judge or source of truth. Current: grounded "اسأل التحقيق" (`/api/case-inquiry`), Hypothesis Stress Test (`/api/hypothesis-test`, `HypothesisSheet`), bounded layered interrogation (Groq). Possible bounded tools: Evidence Comparator, Contradiction Lens, Timeline Extractor, Counterfactual Reconstruction, Progressive Entity Resolver, Stuck Rescue, Case Digest, Multi-Modal Grounded Search. All operate **only on AuthorizedKnowledge**; outputs must be grounded and anchored to sources the player owns; AI never orders the Board or suggests the answer.

---

## 20. Future Room 714 signature: MOVEMENT RECONSTRUCTION

Room 714 should become about reconstructing **people, devices, doors, CCTV, staff routes, service infrastructure (M1) and time** — not merely collecting evidence. The timeline/travel engine (006/007: seven places, travel matrix) is the existing foundation.

---

## 21. Scene 17

- **Must NOT become a Room 714 reskin.** Signature: **WRITTEN vs INSTRUCTED vs WHAT ACTUALLY HAPPENED**, eventually **PERFORMANCE RECONSTRUCTION**.
- Current technical slice (036, live): E05 shared, E06/E07 channel A, E10 channel B; channels A–H with per-player-count distribution (`src/cases/scene-17/contract.ts`). Contract: evidence + media + connections + Board + grounded search + hypothesis test only; **no** scene/objects/challenges/interrogation/reconstruction/hearing; **no runtime** (`NO_RUNTIME`); status `development` (opens only under `next dev` or `IFADA_DEV_CASES`).
- Content reality: E01–E40 authored map; asset audit 10 CONFIRMED / 6 PROBABLE / 14 CONFLICT / 10 MISSING (`docs/cases/scene-17/ASSET_EVIDENCE_MANIFEST.md`, `asset-evidence-manifest.json`). `028` (unpublish) is written but intentionally unapplied.

---

## 22. Known bugs / debt

**BLOCKERS**
- `/api/interrogate` readability gap (§18) — blocks RESET-5 / any interrogation expansion.
- ⚠ Canon conflict: maintenance technician named "آدم" in `sql/005` (V-06, R-02) vs canon "technician ≠ Adam" (§13) — needs an approved content fix.

**IMPORTANT**
- Real-device live QA still pending for: the real Room 714 photo/hotspots (`docs/qa/RESET2_LIVE_QA.md`) and the new touch Board.
- Sessions created before 038 keep pre-reset state (carry-over); always test with fresh sessions.
- V-02 still reachable only through the legacy Evidence tab (QA dependency); the final flow needs a new-engine path (`docs/IFADA_GAMEPLAY_ROADMAP.md`).
- Unresolved media: D-01 wording, HOLD set, V-02/V-05 listening, V-09/F-03 REJECT vs HOLD labels (§14).
- `032` connection rules not applied (Room 714 has no authored validated-connection rules yet).
- On phones the Leads pill exists only on the investigation tab; the header Leads variant is hidden on phones.

**POLISH**
- 5 pre-existing ESLint errors (not from Cloud work): `CaseAutomation.tsx:61`, `Hearing.tsx:54`, `Interrogation.tsx:93`, `Reconstruction.tsx:83` (react-hooks set-state-in-effect) and `page.tsx` (`<a>` instead of `<Link>`).
- `middleware` → `proxy` deprecation notice from Next 16 at dev start.
- DEV runtime inspector (`runtime/RuntimeInspector.tsx`) is dev-only (`devGate.ts`); keep it out of production.

**DEFERRED**
- Spoiler-safe case clock (the old evidence-title ticker is suppressed for Room 714 via `worldDiscoveryOnly`; see `src/cases/contract.ts`).
- Security Office reveal / hotel systems (RESET-3), M1 / RAMI_FOUND (RESET-4), Interrogation V2 + character gating (RESET-5), Movement Reconstruction (RESET-6), Scene 17 full content.

---

## 23. Environment / local run (Windows, VS Code)

- Node 20+ (LTS) with npm. From the project root in a VS Code terminal (PowerShell):
  ```powershell
  npm install          # first time / after package changes
  npm run dev          # Next dev server → http://localhost:3000 (Next picks 3001… if 3000 is busy; read the terminal)
  npm test             # node:test suites (tests/**/*.test.ts)
  npx tsc --noEmit     # TypeScript
  npx eslint <files>   # lint changed files (5 known legacy errors repo-wide)
  npm run build        # production build
  ```
- `.env.local` — **variable names only, never commit values** (`.env*` is gitignored):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `GROQ_API_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`; optional `IFADA_DEV_CASES` (dev case access) and `NEXT_PUBLIC_IFADA_RUNTIME_INSPECTOR` (dev inspector).
- Project hooks in `.claude/settings.json` (`.claude/hooks/*.mjs`): secret-file protection, `content-source/` commit guard, client `media_path` guard, "ask before destructive SQL". They are a backstop, not a substitute for asking.
- The local SQL replay (`tests/sql-local/run-local.mjs`) needs a disposable local PostgreSQL 16 cluster (trust auth); optional on Windows.

---

## 24. SAFE INTEGRATION PLAN — DO NOT EXECUTE YET

Goal: bring the validated Cloud work (`ifada-cloud-reset` @ `claude/practical-maxwell-jwsvi7`) into the original project **without losing any of Heba's work**.

1. On Heba's laptop, open `C:\Users\hebas\ifada` in VS Code. **Change nothing yet.**
2. Inspect, read-only:
   ```powershell
   git status
   git branch -a
   git log --oneline --decorate -30
   git remote -v
   git stash list
   ```
3. **Protect Heba's work:** if there are uncommitted changes, ask Heba/Hazem, then commit them on a dedicated branch (e.g. `heba/local-snapshot-<date>`) — never `reset`, `clean`, `stash` or a blind `pull`.
4. **Backup:** create a backup branch at the current HEAD (`git branch backup/pre-cloud-integration-<date>`) and, ideally, copy the whole folder (including `.env.local`, which is never committed).
5. **Fetch and compare:** add the Cloud repository as a second remote (`git remote add cloud https://github.com/hazem001-commits/ifada-cloud-reset`), `git fetch cloud`, then compare `cloud/claude/practical-maxwell-jwsvi7` against the original history (`git log`, `git diff --stat`). Establish how `ifada-cloud-reset@9340dd3` relates to the original repository's history (the reset checkpoint may not share commits with `ifada2`).
6. **Dedicated integration branch** from the original project's chosen base, e.g. `integration/cloud-reset-2026-10`.
7. **Bring the Cloud work in** (merge if histories are related; otherwise cherry-pick `167ee81..0cdb3bb` + this handoff, or apply as reviewed patches). Never force-push and never overwrite an existing branch.
8. **Resolve conflicts deliberately**, file by file; Heba's local intentional work wins unless Hazem decides otherwise.
9. **Confirm `.env.local` stays local** and uncommitted; check that `content-source/` is not committed (hook).
10. **Validate:** `npm install`, `npm test`, `npx tsc --noEmit`, `npm run build`, browser QA at 360/390/430/768/1440, and a database compatibility check (the live DB already has 037 + 038 — the integrated code must expect them; do **not** re-run any migration).
11. **Only after Hazem's approval:** merge into the chosen permanent branch.

---

## 25. Read first (in order)

1. `docs/HANDOFF_CLOUD_TO_LOCAL_2026-10.md` (this file)
2. `CLAUDE.md` (agents, approval model, priority order) and `AGENTS.md` (Next.js 16 warning)
3. `.claude/skills/ifada-investigation-engineer/` (product identity / canon / architecture skill) and `.claude/agents/*.md`
4. `docs/IFADA_MASTER_GAME_RESET_v1.md`
5. `docs/IFADA_CREATIVE_PROFESSIONAL_ADDENDUM.md`
6. `docs/IFADA_GAMEPLAY_ROADMAP.md`
7. `docs/IFADA_UI_UX_FOUNDATION.md`
8. `sql/MIGRATIONS.md`, then `sql/037_investigation_runtime.sql` and `sql/038_room714_opening_runtime.sql` (headers explain everything)
9. `src/cases/contract.ts`, `src/cases/room-714/contract.ts`, `src/cases/room-714/presentation.ts`, `src/cases/scene-17/contract.ts`
10. `src/lib/runtime/types.ts`, `src/lib/runtime/projection.ts`, `src/lib/realtime/objectSync.ts`, `src/app/case/[code]/runtime/useRuntimeState.ts`
11. `src/app/case/[code]/CaseWorkspace.tsx`, `investigation/InvestigationEngine.tsx`, `investigation/scene/RoomScene.tsx`, `investigation/scene/sceneGeometry.ts`, `play/*`
12. `src/app/case/[code]/board/InvestigationBoard.tsx`, `board/TouchBoard.tsx`, `board/boardModel.ts`, `board/boardStore.ts`
13. `src/lib/ai/knowledge.ts`, `src/app/api/interrogate/route.ts` (the RESET-5 gap)
14. `scripts/lib/media-mapping.mjs`, `src/server/cases/room-714/media.ts`
15. `docs/qa/RESET2_LIVE_QA.md`
16. Tests: `tests/connections/sql038.test.ts`, `tests/play/play.test.ts`, `tests/play/roomSceneMobile.test.ts`, `tests/board/board.test.ts`, `tests/realtime/objectSync.test.ts`, `tests/sql-local/*`

**Working agreement (from `CLAUDE.md`):** Hazem approves a feature → Claude completes it, self-tests and reports → stops. Always ask before destructive SQL, production-data mutation, deleting important files, changing case canon, changing major gameplay rules or core multiplayer architecture, installing a major dependency, or any commit/push/deploy.
