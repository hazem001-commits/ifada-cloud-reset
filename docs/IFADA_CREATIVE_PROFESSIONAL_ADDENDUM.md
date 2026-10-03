# IFADA — Creative & Professional Addendum to Master Game Reset v1

Status: ADDITIVE — does not contradict or modify any rule, node kind, edge kind, or evidence mapping in `IFADA_MASTER_GAME_RESET_v1.md`. Every mechanic below slots into the existing Investigation Runtime (§3) and respects all nine frozen rules (§14).

---

## 0. One thing to fix before anything else

§10's finding — `/api/interrogate` checks session-unlock via service role but not player-authoritative readability for channel-private evidence — is a real, specific vulnerability, not a design nitpick. Before Scene 17's channel distribution (§2, "channels A–H") reaches interrogation, this must close. Sequence it as a **RESET-5 blocker**, exactly where the document already places the security boundary — this addendum just underlines it as non-negotiable, not optional hardening.

---

## 1. New AI mechanics (beyond §6's A–G)

Each follows the same discipline as the existing seven: AI operates only on AuthorizedKnowledge, cites its inputs, never supplies a conclusion.

### H. Chain of Custody — made visible, not just logged
§14 rule 3 already requires authored provenance. Make it a **first-class player-facing mechanic**, not backend metadata: every Material node carries a visible custody trail (who found it, when, which hands it passed through — Field collected → Forensics processed → shared with team). This is standard real investigative practice (actual chain-of-custody documentation) and, as far as I know, essentially unused as a *visible player mechanic* in investigation games — most hide provenance as flavor text at best. It directly reinforces "this is a real investigation, not a game" because the player is doing something a real investigator genuinely does: verifying how material came to exist before trusting it.

### I. Case Digest — authorized "what changed" briefing
AI-generated, strictly scoped to one player's AuthorizedKnowledge: on return to a session (or on request), a short, source-cited digest of what changed since last checked — new shared discoveries, new identified people, new world-state events. Not a case summary, not a spoiler — a *briefing*, the way a real detective gets briefed returning to an open case. Directly extends the Pulse Log (§4) into a retrospective view instead of only a live feed.

### J. Declassification Ledger — redaction as mechanic, not decoration
IFADA's visual identity has used a redaction motif since the earliest design pass. Formalize it: certain Material nodes are authored as **partially redacted on first discovery** (an internal memo, a personnel file, a legal document) and only fully declassify when an authored World-state/milestone condition is met (case reclassification, specialization clearance, a validated connection). This is bureaucratic friction exactly like a real case file has, it's a natural visual payoff for the existing redaction language, and it gives World-state events a second, tangible consequence beyond unlocking places — previously-seen material can *change* when the world changes, which is a genuinely rare mechanic.

### K. Off-the-Record — informal intel vs. admissible statement
Some interrogation responses are authored as off-the-record: true, useful, but the character will only say them if the player does *not* formally log the conversation (no "present as evidence" action available afterward). The player must choose, in the moment, between hearing more now or having a citable Statement later. This creates a real investigative tension (source protection vs. evidentiary weight) that almost no detective game models, and it plugs directly into Act 5's "structured responsibility claims with exhibits" (§7) — an off-the-record lead can point you somewhere true without ever becoming a citable exhibit, exactly like real investigations.

### L. Shared Lab Capacity — realistic pressure, not a countdown gimmick
Processing jobs (§3.1, already a node kind) draw from a **shared, limited lab/records capacity** across the whole team's active leads, not an individual per-request timer. Two players submitting forensic requests at once genuinely compete for the same queue — forcing the team to prioritize together, out loud, exactly like a real forensics unit with finite throughput. This replaces arcade time-pressure with institutional realism, and it's a natural, low-complexity extension of the Processing job node already in the runtime.

### M. Reflexive Witness Memory — characters who know what happened to teammates' conversations
Authored (deterministic, not AI-invented) links between characters: if Character A is told something significant during interrogation, a later session with Character B — if the two are authored as being in contact — can reference it ("كريم حكى معي الصبح، قال إنكم سألتوه عن..."). The *fact* that this propagates is authored game design; the *performance* of referencing it is the existing bounded AI layer (§6-G). This makes the cast feel like people who talk to each other between sessions, not isolated dialogue trees — a meaningful step beyond even well-built bounded interrogation.

### N. Multi-Modal Grounded Search with Explainable Matches
Extend the existing Grounded Search foundation (already listed as a strong foundation in §2) to search across document text *and* interrogation-statement transcripts *and* OCR'd photographed documents in one unified query — and always show the literal matched span, not just "3 results." This is the single most technically novel AI piece on this list: most "AI search" in games (where it exists at all) is single-modality. Framed correctly, this is the kind of retrieval engineering that reads as "built by people who actually do this at a real company," not a chat wrapper.

---

## 2. Realism layer — making the player forget it's a game

### Institutional document fidelity
Each Material type gets an authored visual *genre*, not a shared generic "document card": a hotel incident report has hotel-incident-report structure (case number, filing officer, timestamp format); a forensic lab result has specimen-ID structure; a financial record has bank-statement structure. This isn't restyling — it's treating each document as what it actually claims to be. Already partially implied by "type-true evidence viewers" (§2); this pushes it from *viewer type* to *document genre authenticity*.

### Structured briefing moments
At major World-state transitions (RAMI_FOUND, RAMI_DIED, M1 discovery), offer — don't force — a short structured team-briefing beat: each player states, in a few authored prompts, what *they* currently believe, visible to teammates before the investigation continues. This mirrors a real detective-team briefing and creates a natural, low-tech moment for the asymmetric-knowledge tension (§1's north star quote) to surface socially, without needing a chat log.

### Investigator-voice logging
The Pulse Log and Case Digest should read like an investigator's own notebook, first-person-plural register ("لاحظنا أثر دم قرب الطاولة الجانبية — لازم نتحقق مين"), never system-log phrasing ("New evidence unlocked: F-02"). Small, cheap, and it's the difference between a case file and a changelog.

---

## 3. The flagship "never been done before" combination

No single mechanic above is revolutionary alone. The combination is what's genuinely new: **Chain of Custody (H) + Declassification Ledger (J) + Off-the-Record (K) running on top of the already-planned Movement Reconstruction and structured-responsibility Hearing (§7, §11)** means the final case isn't "pick the culprit" — it's "defend a case file where every exhibit has a verifiable origin, some material was never admissible in the first place, and some documents only fully declassified because of choices your team made." That's a genuinely distinctive final-act identity, and it's assembled entirely from mechanics that also pay for themselves earlier in the investigation — nothing here is a one-off gimmick built only for the ending.

---

## 4. Where this slots into the existing sequence

Nothing here changes RESET-1 through RESET-4. Additions land as follows:

| Addition | Sequence slot |
|---|---|
| Interrogate security fix (§0) | **RESET-5**, as the existing security-boundary-first step — just underlined as blocking |
| Chain of Custody (H) | RESET-2 — cheap to add while the vertical slice's discovery grammar is being built; it's a presentation layer on provenance data that already has to exist per Rule 3 |
| Shared Lab Capacity (L) | RESET-3, alongside turning hotel systems into real place/tool progression |
| Case Digest (I) | RESET-4, natural extension of Pulse once milestone infrastructure is live |
| Declassification Ledger (J) | RESET-4/RESET-7, tied to world-state and full content integration |
| Off-the-Record (K), Reflexive Witness Memory (M) | RESET-5, alongside Interrogation V2 |
| Multi-Modal Search (N) | RESET-7, once enough material/statement/result nodes exist across types to make multi-modality meaningful |
| Document fidelity, briefing moments, investigator-voice logging | RESET-11, consistent with the document's own "don't polish a broken loop" rule — these are presentation-layer work, correctly sequenced last |

---

## 5. Honest scope note

This is roughly six to nine mechanics, not twenty. Every one earns a place by extending something already in the Master Reset's own architecture (provenance, Pulse, Processing jobs, World-state, bounded interrogation) rather than introducing a parallel system. That restraint is deliberate — the fastest way to make a "premium, never-done-before" pitch feel cheap is to pile on mechanics that don't share a spine. These all share the same one.
