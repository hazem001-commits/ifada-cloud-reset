# IFADA — UI/UX Foundation

Input to the dedicated **UI/UX Foundation Pass**. Not an implementation, not a generic design system. It records where the current investigation experience stands, and the rules every surface must follow so IFADA reads as one cinematic, premium, collaborative, AI-native investigation — for **every** case, not only Room 714.

Priority order (unchanged): IFADA identity/canon (`.claude/skills/ifada-investigation-engineer/`) → IFADA specialists → `ui-ux-pro-max` / 21st as supporting intelligence only.

---

## 1. Audit — current state (2026-10-01)

### 1.1 Worth keeping (the new language)
- **Scene-first investigation** (`investigation/scene/*`): the real photograph is the space; objects are anchored in source-pixel coordinates; the dossier docks beside/below; a neutral surface for locations without art. Case-scoped via `src/cases/<case>/presentation.ts`.
- **Inspection dossier + workstation lanes**: tools live on the object they belong to; private → share is explicit (`ShareAction`).
- **Evidence examination room**: type-true viewers (document / audio station / video / photo), authored-context drawer ("تفاصيل الدليل"), signed media only, honest states (a recovered frame is never presented as playable video).
- **Case File**: evidence as artifacts (paper, sample, screen, tape) grouped by identity, spotlight on what is new, private-to-me marks.
- **"اسأل التحقيق"** (`CaseInquiry`): a constrained investigative query line with grounded, source-linked results — explicitly *not a chat*.
- CSS modules + tokens, `prefers-reduced-motion` handled in the new surfaces (18 files), `role="status"`/`aria-live` on async states (20 files).

### 1.2 Inconsistent / legacy
- **Two design generations.** The older surfaces are built from inline styles: Reconstruction (25 `style={{…}}` blocks), Hearing (24), EvidencePanel (22), Board (18), Interrogation (15), ArchiveActions (15), Archive page (12), Lobby (8). They don't share the tokens, spacing rhythm, motion or states of the scene/case-file/evidence surfaces.
- **Loading copy** mixes "جاري…" and "جارٍ…"; empty and error states are phrased and styled per surface.
- **Board** is a classic shared list/canvas, the legacy **EvidencePanel** is still a flat evidence list (duplicating the Case File's job), and **Reconstruction/Hearing** are form-like pages.

### 1.3 Dashboard / SaaS remnants
- Archive = stacked cards with metadata rows and a dropdown + radio "create" form.
- EvidencePanel = master list of items (contradicts "evidence is discovered, not browsed").
- Hearing = a questionnaire of four fields.
- Tab bar as the primary way to move between investigative activities.

### 1.4 Where AI feels like a generic chatbot
- **Interrogation**: a single field-specialist typing free text and a transcript scrolling like a messenger thread; the rest of the team watches. The layered-character engine behind it is good — the surface is not.
- Risk for future systems: stress-test / hearing challenger / entity linking bolted on as "another chat box".

### 1.5 Where future AI should appear contextually instead
- On an **object/evidence**: "what here is unexplained?" stays inside the dossier or examination room, citing only what that player holds.
- On the **Board**: candidate connections suggested *as dotted, unvalidated threads* the players can test — never as conclusions (validation is the server's, `src/lib/connections/`).
- On a **person**: descriptor growth ("رجل مجهول → رجل بشعر رمادي → …") shown on the person's card as earned facts, never as the AI "knowing".
- In **Reconstruction**: the stress test annotates the player's own timeline (supporting / contradicting / unsupported / missing).
- In **Confrontation**: the character's evasions/pressure are the AI; the *evidence presented* is the player's move.

### 1.6 Mobile / responsive risks
- Scene stage: correct geometry, but the dossier as a bottom sheet competes with the photo on short screens; hotspots rely on ≥44 px hit boxes (`hitBox`) — keep.
- Legacy inline-styled pages have no breakpoint logic; Hearing and Reconstruction forms are desktop-shaped.
- Voice room + case bar + tab bar stack vertically on phones, eating the scene.

### 1.7 Interaction / motion opportunities
- Consistent "arrival" of new material (Case File spotlight) should be the single pattern for new evidence everywhere.
- Validated connection: a thread that *settles* (subtle tension → rest) instead of a toast.
- Chapter unlock (Scene 17) and lab result arrival as diegetic moments, not modals.

### 1.8 Accessibility gaps
- Legacy surfaces: inline focus styles, no reduced-motion handling, headings not always structural.
- RTL: new surfaces are RTL-correct; legacy ones rely on inherited direction only.
- Status colour is sometimes the only signal of "private to me" / "shared" outside the new surfaces.

### 1.9 Loading / empty / error states
- Standardise one vocabulary and one visual for: *retrieving* (archive/device language), *processing* (lab/extraction with honest duration), *not available to you* (asymmetric, never an error), *not found* (neutral), *failed* (actionable).

---

## 2. Principles

### 2.1 Visual
1. **The case is the interface.** Each case owns its signature look through its presentation module (`src/cases/<case>/presentation.ts`): Room 714 = a physical hotel space at night; Scene 17 = theatre paper, cue sheets and script margins (*what was written ↔ what was instructed ↔ what actually happened*). Never reuse one case's art direction for another.
2. **Materials, not cards.** Paper, prints, screens, tape, samples, photographs. A rounded card with a title and a chevron is never evidence.
3. **Dark, low-key, warm highlights.** Light is information: a glint on an object, a lamp on a document. Colour is reserved for state (private / shared / processing / contradiction), always paired with shape or text.
4. **Typography**: one Arabic display face for case identity, one reading face for documents, one mono for machine records (logs, timestamps, IDs). Numbers that matter (times, codes) are always mono and tabular.
5. **No progress meters, no remaining counts, no checklists** (product rule).

### 2.2 Interaction
1. **Act on the thing.** Every action is attached to the object/evidence/person it concerns. Global menus only navigate.
2. **Asymmetry is visible, not an error.** "This belongs to the forensics specialist" / "private to Channel C" is a designed state with a clear social next step (ask, share), never a disabled button without explanation.
3. **Share is a deliberate act** with a visible before/after.
4. **The server decides truth.** UI never infers a conclusion; wrong attempts get a neutral response with no hint of *why* (connections, challenges).
5. **One primary action per moment.** Secondary actions recede.

### 2.3 Motion
1. Motion explains causality (a sample leaving for the lab, a thread settling, a document sliding into the file) — never decoration.
2. Durations: 120–180 ms for state, 240–400 ms for spatial moves, longer only for diegetic processes with honest timing.
3. Exit faster than enter. Interruptible. Everything has a `prefers-reduced-motion` path (cross-fade or instant).
4. No bounce/elastic, no confetti — a closed case is a *seal*, not a celebration.

### 2.4 Investigation-space hierarchy
1. **Place** (scene / theatre / archive) — where you are.
2. **Object / Material** — what you're examining (dossier, examination room).
3. **Case File** — what *you* hold (private) and what the *team* holds (shared).
4. **Board** — what the team *thinks* (proposals, validated connections, open questions).
5. **Reconstruction / Hearing** — what the team *claims*.
Navigation should feel like moving through these layers, not switching tabs.

### 2.5 AI surface rules
1. **AI is an interface to authored truth, never its source.** It consumes only `AuthorizedKnowledge` (`src/lib/ai/knowledge.ts`); it never sees hidden truth and never produces canon.
2. **No chat box as a destination.** AI appears *inside* the object, person, thread or timeline it is about, and speaks in the case's own voice (a lab note, an archivist's reply, a witness).
3. **Every AI statement is cited** to material the player holds (fact ids), or it is not shown (`validateStressTestResult`).
4. **AI never says "correct" or "wrong".** It says *supported by*, *contradicted by*, *unsupported*, *missing*.
5. **Identity is earned.** Person labels come from `entityViewFor` — the AI never names someone the team hasn't identified.
6. Deterministic paths first: search, routing, validation and unlocks work with no LLM at all.

### 2.6 Mobile
1. The scene/place stays the hero; the dossier is a resizable bottom sheet with a clear peek state.
2. One-hand reach: primary action at the bottom edge; ≥44 px targets; no hover-only affordances.
3. Voice/team presence collapses to a compact strip on phones.
4. Documents open full-screen with pinch-zoom and an always-visible "back to place".

### 2.7 Evidence inspection
1. The viewer is chosen by the **actual file type**, the variant by the **evidence meaning** (Slice A routing).
2. Authored text is never hidden by media — the "تفاصيل الدليل" drawer is always one gesture away.
3. Honest media: never fake playback, frames, transcripts or enhancements.
4. Multi-file items (e.g. a statement + two photos) are one piece of evidence with pages, not three items (engine gap noted in the Scene 17 manifest).
5. Interactive comparisons (script pages, waveforms) are native engine challenges, never embedded HTML.

---

## 3. Directions for upcoming surfaces

### 3.1 Board V2
- A **working wall**, not a numbered node map: materials pinned where the team puts them; threads are *proposals* (dotted) until the server validates them (solid, with the authored meaning revealed).
- Node kinds: evidence, object, person (progressive label), place, time/event, claim, question, hypothesis.
- Proposing: pick 2–5 things you hold → optional relation → "test the link". Result: *established* (thread settles, effects unfold) or *not established* (thread fades; no reason given).
- Questions and hypotheses are first-class cards the team writes; the stress test annotates hypotheses in place.
- Privacy: you can only pin/propose what you hold; teammates' private material appears as a *presence* ("Channel C holds something about the knife") only if the case's rules already expose that.

### 3.2 Reconstruction (Room 714 signature: movement)
- A floor-plan / timeline hybrid: people as tracks through places over time; the engine checks physics (time, distance, access) and marks conflicts on the track itself.
- CCTV/door events are anchors on the track; "follow" moves between cameras by time.
- The stress test lists supporting / contradicting / unsupported next to the segment it concerns.

### 3.3 Confrontation
- A staged room, not a messenger: the character, the team, and the table of evidence.
- The player's move is **presenting material** (from their own Case File) or a bounded question; the character's layers respond. The team can hand material to the interrogator in real time.
- Transcript becomes a *record* (paper, time-stamped), readable afterwards in the Case File.

### 3.4 Hearing
- A formal hearing, not a form: claims are argued with **exhibits** from the Case File; each claim is judged independently (proven / plausible-unproven / wrong) as today, but presented as a verdict sequence.
- Scene 17 needs a multi-part accusation (mastermind, motive, method, ≥4 exhibits incl. physical/technical/motive) — the hearing surface must support structured claims per case contract.

### 3.5 Scene 17 signature (to be designed in its own pass)
- Three layers visible side by side: **written** (script pages, manuscript), **instructed** (cue sheets, audio schedules, voice-over), **happened** (CCTV, logs, sensor data). Contradictions are made *between layers*, which is exactly what validated connections express.

---

## 4. Highest-priority UX slices (proposed order)

1. **Unify the foundation**: tokens, type scale, state vocabulary (loading/empty/unavailable/failed), focus + reduced-motion — applied to the legacy inline-styled surfaces first (Reconstruction, Hearing, Board, Interrogation, EvidencePanel, Archive, Lobby).
2. **Navigation as space**: replace the tab-first model with the place → material → file → board → claim hierarchy; phones keep the place as the hero.
3. **Board V2 shell** on top of the connection foundation (after `sql/027` approval).
4. **Confrontation surface** replacing the messenger-style interrogation.
5. **Archive + lobby** as a case dossier shelf (case identity from the case contract; development cases shown as "in preparation").
6. **Hearing as exhibits**, then **Reconstruction tracks**.
