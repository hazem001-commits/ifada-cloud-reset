# IFADA — Gameplay Implementation Roadmap

Source of sequencing truth for the post-redesign investigation engine. Not a design bible — see `.claude/skills/ifada-investigation-engineer/` for that. This file only records *what phase we're in* and the *permanent rules* that must survive every phase.

## Phase order

| Phase | Name | Status |
|---|---|---|
| 1 | Investigation Interaction Engine | DONE |
| 2 | Scene / Inspection / Workstation Vertical Slice | DONE |
| 3 | Evidence Experience V2 | DONE |
| 4 | Investigation Challenges | DONE |
| 5 | Device / CCTV / Access workflows | FUNCTIONALLY COMPLETE — UX / art direction redesign in progress |
| 6 | Board V2 / Facts / Questions / Hypotheses | Not started |
| 7 | Living Case State / reactive world | Not started |
| 8 | ROOM 714 Movement Reconstruction | Not started |
| 9 | Confrontations / Interrogation V2 | Not started |
| 10 | Final Case / Claims / Exhibits / Challenge / Seal | Not started |
| 11 | ROOM 714 complete end-to-end QA | Not started |
| 12 | Scene 17 integration (same reusable engine) | Not started |
| 13 | Product / mobile / performance polish | Not started |

Phase 6 has **not** started.

## Phase 5 status

**Functionally complete.** SQL `025` is applied live. Manual 2-player QA passed for:

- private → share laptop flow; D-01 extraction; no duplicate D-01
- door privacy/share; D-02 time search; D-02 provenance; D-02 expiry after 01:00
- CCTV archive private/share; V-03 prerequisite behavior; V-03 and V-08 extraction; provenance
- repeat-query idempotency; throttle
- regressions: passport tutorial challenge, blood-sample background processing, Board, legacy Evidence tab

**UX / art direction — redesign in progress.** The coded UX structural pass is a work-in-progress checkpoint and is **not** visually approved as final.

**Known deferred items (intentionally not solved in Phase 5):**

- V-02 is still unlocked through the legacy Evidence tab — a temporary QA dependency, not a player flow. The final ROOM 714 flow needs a new-engine path to V-02 before end-to-end QA.
- Some legacy/direct evidence unlock paths can bypass the Phase 5 tools.
- Blind CCTV time-window sweeping — later gameplay tuning.
- Final mobile polish and final motion/art-direction polish — Phase 13.
- Board V2 — Phase 6.
- Scene 17 — deferred (Phase 12).
- D-06 remains a recovered still/frame and is **not** playable video.
- D-05 is **not** connected to the laptop.

## Permanent product principles

- Evidence should be **discovered**, not browsed from a master checklist.
- Important objects may evolve through multiple investigative states before becoming final material.
- Specialization tools should feel different from each other — not four skins on one form.
- Multiplayer communication must matter — asymmetric information is core, not incidental.
- No automatic deduction. The platform reveals and organizes; it never concludes.
- No arbitrary escape-room puzzles. Every challenge must make investigative sense and produce or validate real case information — never exist "because a game needs a puzzle."
- Professional visual presentation is mandatory — premium investigation game, not a SaaS dashboard.
- Scene 17 reuses the core engine (Investigation Objects, state machines, workstations, Case File) but gets its own signature mechanic, the same way Room 714's is Movement Reconstruction.

## Investigation Challenges — levels and future types

The engine (Phase 4) supports three levels. Built so far: the ROOM 714 guest-file tutorial (micro) and the door-log and CCTV-archive time-window searches (investigation, Phase 5).

- **Micro challenge** — a 30–90 second interaction inside one object/material (e.g. isolating a detail in a photo, finding a marker in an audio waveform).
- **Investigation challenge** — requires combining information from multiple evidence sources or specializations (e.g. cross-referencing a timestamp from one object against a database search in another).
- **Signature case mechanic** — a large, case-specific system (Room 714's is Movement Reconstruction; Scene 17's is not yet decided).

Future challenge types under consideration (not built yet): realistic password/passphrase discovery, encrypted file access, deleted-file reconstruction, multi-camera reconstruction, audio-range isolation, visual detail extraction, metadata correlation, record/database cross-reference, access credential discovery.

Permanent rule for all of them: a challenge exists only because it makes sense inside the investigation and produces or validates meaningful case information — never as decoration.
