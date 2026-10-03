# IFADA — Master Game Experience Reset v1

Date: 2026-10-04
Source reviewed: local `ifada-review.zip` snapshot supplied by Hazem.
Status: DESIGN / ARCHITECTURE PROPOSAL — no project files modified.

## 1. Product north star

IFADA is not an evidence dashboard. It is a living, asymmetric, multiplayer investigation in which players **discover**, **act**, **communicate**, **test**, **reconstruct**, and only then make claims.

The core player feeling is:

> I know things you do not know. You can do things I cannot do. Something in the case just changed. We need to talk.

The platform may reveal, simulate, organize, search, compare, and stress-test authorized material. It must never solve the case for the players.

## 2. Reality audit of the current project

### Strong foundations worth preserving
- Supabase multiplayer/session model, RLS, realtime and case scoping.
- Specializations as capabilities.
- Scene 17 channel distribution as information asymmetry.
- Server-authoritative evidence readability.
- Investigation objects/state machines and processing states.
- Challenge engine and provenance.
- Type-true evidence viewers (document/audio/video/image/phone).
- Case File, Board V2, Joint Connections and masked private contribution.
- Grounded Search / AuthorizedKnowledge / Hypothesis Stress Test foundations.
- Case clock, session events and milestone infrastructure.
- Layered bounded interrogation engine.
- Timeline/travel consistency engine.

### The missing layer
The project has many investigation systems but no single **Investigation Runtime** that turns them into a continuous game journey.

Current flows still expose evidence through requirements/unlock lists and isolated tools. The player often manages material rather than *causing discoveries through the world*.

### Room 714 content reality
- 34 live evidence codes in the authored SQL catalog: F-01..F-07, D-01..D-08, V-01..V-09, R-01..R-10.
- 72 Room 714 files in `content-source/public/cases/room-714/`.
- Only 11 Room 714 evidence codes currently have explicit approved media mappings.
- The project-level HOLD set currently includes: D-06, D-02, D-07, R-02, R-06, R-07, R-09, F-03, F-04, F-07, V-02, V-04, V-05, V-06, V-09, plus GLASS_CUP and OPEN_WINDOW.
- 11 named E36–E46-style assets exist outside the current live evidence catalog; they need canon classification before being promoted to game nodes.
- Scene/object runtime currently models only Room 714, glass/blood/window/victim-items/passport/laptop, plus room door and security-office CCTV archive.
- The timeline engine already knows seven places: Room 714, Hall 7, Service Elevator, M1, Security Office, Lobby, Parking. The playable place experience does not yet expose this world.
- Interrogation currently has full layered characters only for Kareem, Nabil and Yara.

### Scene 17 content reality
- The authored map defines E01–E40 and channels A–H.
- Asset audit: 10 CONFIRMED, 6 PROBABLE, 14 CONFLICT, 10 MISSING.
- Current live slice is technical only: E05 shared, E06/E07 channel A, E10 channel B.
- Scene/object/challenge/interrogation/reconstruction/hearing systems remain off in the Scene 17 contract.

## 3. New core architecture: Investigation Runtime

The runtime must become the shared spine above the existing secure primitives.

### 3.1 Runtime node kinds
- Place
- Object
- Evidence/Material
- Person
- Statement
- Event
- Time anchor
- Lead
- Question
- Hypothesis
- World state / milestone
- Action
- Processing job
- Unknown entity

### 3.2 Runtime edge kinds
- discoverable_at
- obtained_by_action
- points_to
- enables_action
- enables_place
- enables_interrogation_move
- supports
- contradicts
- temporal_anchor
- provenance
- transforms_into
- world_state_requires

Edges are authored game structure, not conclusions shown to the player.

### 3.3 The gameplay loop
1. **Observe** — enter a place/person/material with limited context.
2. **Act** — inspect, query, collect, analyze, compare, ask, confront, reconstruct.
3. **Discover** — gain a private/shared object, material, statement, lead or event.
4. **Pulse** — teammates get only the product-approved social signal, never hidden content.
5. **Follow** — a discovery changes available places/actions/questions/tools.
6. **Connect** — players discuss and deliberately combine their knowledge.
7. **Test** — deterministic challenge, validated connection, search, AI stress test or reconstruction.
8. **World reacts** — milestone, processing result, new place, changed person, changed case classification.
9. Repeat until the team is ready to make claims.

## 4. Signature system: Investigation Pulse

A private discovery should create a social event without leaking the discovery.

Examples of safe pulse dimensions:
- PERSON
- PLACE
- TIME
- DEVICE
- MOVEMENT
- PHYSICAL TRACE
- RECORD
- CONTRADICTION
- NEW ACTION

A pulse can expose:
- teammate display name
- generic category
- optional place already known to the receiver
- optional case-clock moment if already authorized

A pulse must not expose:
- evidence code/title/body
- hidden person identity
- hidden place
- source filename
- why the discovery matters
- a progress/count hint

The Pulse Log becomes the social memory of the investigation, not an evidence list.

## 5. Discovery grammar

Evidence must not share one unlock mechanism. Each authored node chooses a discovery mode:

- environmental find
- object state progression
- workstation extraction
- records lookup
- CCTV search
- physical collection → processing → result
- interrogation statement
- evidence-backed confrontation
- cross-player joint contribution
- comparison challenge
- reconstruction consequence
- timed opportunity
- case-event delivery
- derived material after validated connection
- return-to-place action unlocked by later knowledge

A discovered material can unlock an **action** without automatically unlocking the next evidence.

## 6. AI mechanics — AI as instrument, never solver

Priority order:

### A. Contextual Evidence Comparator
Compare two authorized documents/audio analyses and mark differences with source citations. It never labels a difference as guilt.

### B. Contradiction Lens
On a person/statement, compare the selected statement against the player's authorized facts. Output only supported / contradicted / unsupported / missing, with sources.

### C. Timeline Extractor
Propose time anchors from authorized material. Player accepts/rejects each anchor before it enters reconstruction.

### D. Counterfactual Reconstruction
Player states an assumption. The engine/AI annotates where the assumption conflicts with known time/access/physical facts; it never supplies the correct sequence.

### E. Progressive Entity Resolver
Unknown person/object labels evolve only when authored earning conditions are satisfied. AI may phrase/organize earned descriptors, never jump to the canonical identity.

### F. Stuck Rescue
Only after a real inactivity/failed-attempt condition. It points to an *uncombined authorized pair or unused action*, not to a suspect or solution.

### G. Interrogation Performance Layer
The bounded character simulation is the AI. Evidence presentation is the player move. Future voice is presentation over the same authored knowledge boundary.

## 7. Room 714 — proposed player journey

This is a gameplay proposal based only on existing canon; it does not change any facts.

### ACT 0 — Missing Person / Arrival
Goal feeling: "He did not simply leave."

Start state:
- Missing-person case.
- Very little in the Case File.
- Room 714 is the first active place.

Primary actions:
- inspect room and personal items
- inspect laptop
- identify victim through passport/guest records
- notice glass/blood/window without automatically interpreting them

First social dependency:
- Field discovers/marks physical items.
- Records resolves guest identity from the passport.
- Digital recovers the unsent draft.
- Forensics can collect/analyze the blood only after the physical trace is actually discovered/shared.

End condition:
The team has multiple plausible directions, not "the next evidence".

### ACT 1 — The room is not the whole crime
Goal feeling: "The obvious scene is misleading."

Branches:
- blood → female / later Sara
- door/access → 23:43 and 00:06
- Rami draft / voice note / USB activity
- first interviews: Kareem / Yara / other approved characters

The player should discover a contradiction, not receive a checklist.

### ACT 2 — Hotel systems / hidden movement
Goal feeling: "Someone used the hotel as infrastructure."

Places/tools open through leads:
- Hall 7
- Security Office
- CCTV archive
- Service Elevator

Key play:
- search door log by a player-supplied time window
- search CCTV by camera/time
- compare Kareem's statement with corridor footage
- trace the security login / CCTV gap
- discover Nabil's service-elevator arrival

### ACT 3 — M1 / world shift
Goal feeling: "The case was happening somewhere we could not see."

M1 should be unlocked through converging authored leads, not simply R-03 appearing in a list.

M1 gameplay should include:
- physical route/access discovery
- damaged barrier inspection
- maintenance history
- search action for Rami

**RAMI_FOUND** must be caused by a search/discovery action at M1. F-04 should be a consequence of the world event, not the trigger that causes it.

World reaction:
- case classification changes
- medical information begins arriving
- available interrogation questions change
- some earlier assumptions lose relevance

### ACT 4 — November 17 / the old case
Goal feeling: "Room 714 began nine months ago."

The USB/video branch should reveal the old incident through a deliberate device/evidence flow.

The team then independently connects:
- hit-and-run material
- Yusuf's identity
- Nabil's relationship
- N17 transfers / ownership
- Sara/Rami relationship

No screen should announce "blackmail" as a conclusion.

### ACT 5 — Responsibility, not one killer
Goal feeling: "Different people caused different parts of the outcome."

Use:
- movement reconstruction
- confrontation/interrogation returns
- medical timing
- M1 physical facts
- access/CCTV facts
- old-case motive context

**RAMI_DIED** is a living-case event that changes the legal/question framing.

Final hearing should ask structured responsibility claims with exhibits, not a single suspect choice.

## 8. Room 714 evidence redesign — first pass

Legend:
- MAPPED = approved media mapping exists now.
- HOLD = project tests explicitly mark this node/asset path as unresolved.
- TEXT = no approved media mapping; can remain authored text only if intentionally designed that way.
- PROPOSED ROUTE = gameplay design proposal, not canon.

| Code | Current authored material | Current media state | Proposed discovery route | Preferred interaction |
|---|---|---|---|---|
| F-01 | Room 714 initial scene report | TEXT | generated from first physical scene sweep, not handed at start | scene notebook / forensic scene summary |
| D-01 | unsent draft | asset exists, unmapped | Laptop → inspect device → recover last activity | device workspace |
| V-01 | missing-person report | TEXT | case briefing / dispatch at case start | case brief |
| R-01 | Rami guest file | TEXT | Passport shared → Records lookup | records workstation |
| F-02 | blood analysis | TEXT | Blood trace → collect → lab processing | lab result arrival |
| F-03 | DNA match to Sara | HOLD | after F-02 via approved comparison process | forensic match report |
| F-04 | ER initial report | HOLD | only after RAMI_FOUND world event | medical update |
| F-05 | injury-time estimate | TEXT | forensic analysis of medical material | medical timeline analysis |
| F-06 | damaged M1 barrier | MAPPED | inspect M1 barrier after location opens | physical inspection/image |
| F-07 | death report | HOLD | only after RAMI_DIED event | medical update / blackout consequence |
| D-02 | door card log | HOLD | discover room door → share → Digital time-window query | access-log workstation |
| D-03 | CCTV gap | MAPPED | security archive/system investigation, not simple requires chain | CCTV/system report |
| D-04 | security login | MAPPED | security console audit | terminal/log viewer |
| D-05 | USB transfer log | MAPPED | Laptop/device forensic path | device log |
| D-06 | copied video content | HOLD; raw video forbidden | recover approved still/frame/description from USB branch | recovered frame / video-forensics record |
| D-07 | staff Wi-Fi connection | HOLD | network-console investigation from hotel-system lead | network workstation |
| D-08 | outgoing voice note | MAPPED | phone/device or extracted communication path | audio station |
| V-02 | Kareem first statement | HOLD | actual interrogation result/record | interrogation record |
| V-03 | Rami + Kareem CCTV frame | MAPPED | CCTV time-window search using contradiction lead | CCTV station |
| V-04 | Kareem revised statement | HOLD | confrontation with authorized evidence | interrogation record generated from play |
| V-05 | Yara first statement | HOLD | actual interrogation | interrogation record |
| V-06 | maintenance technician statement | HOLD | person lead / M1 branch | interrogation record |
| V-07 | Yara confrontation result | TEXT | return interrogation after D-07 | confrontation record |
| V-08 | service elevator entry | MAPPED | CCTV search | CCTV station |
| V-09 | hotel exit record | HOLD | follow Nabil movement through CCTV/parking | CCTV/movement anchor |
| R-02 | M1 maintenance reports | HOLD | M1 location → maintenance database/records query | maintenance archive |
| R-03 | hotel plan / M1 | TEXT | records lookup triggered by service-route contradictions | map/plan workstation |
| R-04 | repeated transfers | MAPPED | financial/records branch after person/company lead | finance record |
| R-05 | N17 registry | MAPPED | company registry search | registry document |
| R-06 | old hit-and-run report | HOLD | old-case lead after USB/date/Yusuf name becomes actionable | archive case file |
| R-07 | Nabil condolence post | HOLD | identity/archive search after Yusuf connection | archived social post |
| R-08 | Samer call log | MAPPED | Samer/company branch once canon role is approved | call-log viewer |
| R-09 | journalism draft | HOLD | Lin/journalism branch only after canon cleanup | document/email archive |
| R-10 | Nabil vehicle registry | MAPPED | vehicle lookup after service-elevator person/vehicle lead | registry record |

### Important structural change
`requires: {previous evidence code}` should stop being the main gameplay progression language. Keep requirements for security/safety where needed, but author the player journey around **actions, leads, world state and provenance**.

### 8.1 Current evidence catalog is mixing different gameplay concepts

The current `evidence` table is doing too many jobs. In the reset, authored content should be typed by gameplay meaning before deciding whether it belongs in the Case File:

- **Material** — a document/photo/audio/log/file the player can possess and inspect.
- **Statement** — something a character actually said during this session; created by interrogation play.
- **Result** — output of a lab/query/comparison action.
- **Lead** — an actionable direction, not evidence.
- **World event** — RAMI_FOUND / RAMI_DIED / case reclassification; changes the world.
- **Anchor** — time/place/access fact used by reconstruction.

This matters because several current Room 714 rows are better represented by another kind:
- V-02/V-04/V-05/V-06/V-07 should become interrogation statements/records produced by play, not ordinary list unlocks.
- F-04/F-07 should arrive because the living case changed, not cause the living case to change.
- D-02/V-03/V-08 are query/search outputs with explicit provenance.
- F-02/F-03/F-05 are analysis results.

The Case File can still show all of these after they exist; the difference is **how they come into existence**.

### 8.2 Two clocks, not one forced clock

Room 714's authored chronology spans the hotel night, the 04:35 discovery/medical response, and a later death on 25 August. The current real-time case clock is useful for the hotel-night investigation but should not be stretched to simulate every later hour literally.

Proposed model:
- **Investigation clock** — live/timed opportunities during the hotel-night phase.
- **Case chronology** — authored event time that can jump forward between chapters (hospital update, later death).

Chapter/event transitions may advance the case chronology without forcing players to wait real-world hours.

## 9. Room 714 asset inventory

72 files total:
- archive: 5
- characters: 5
- communications: 12
- digital: 4
- evidence: 10
- finance: 2
- forensics: 6
- maintenance: 1
- medical: 2
- security: 3
- shared: 7
- social: 1
- statements: 2
- surveillance: 7
- video: 1
- visual-bible: 4

### Asset classes to formalize
1. **Playable evidence media** — maps to an evidence/material node.
2. **Scene/object close-up** — maps to a place/object view, not evidence by itself.
3. **Character/reference art** — never a material/evidence unlock.
4. **Cinematic/reference art** — used later in final presentation.
5. **HOLD/conflict** — cannot enter runtime until canon/media issue is resolved.
6. **Unwired authored content** — legitimate content that needs a node/provenance decision.
7. **Duplicate/alternate representation** — same fact, not a new evidence count.

The E36–E46-style asset series must be audited into these classes before adding new live evidence codes. Do not infer a new code from the filename alone.

## 10. Interrogation V2

Keep the layered authored character engine, replace the messenger UI.

### Required security fix before Scene 17 interrogation
The current `/api/interrogate` validates presented evidence by checking that it is unlocked in the session using service-role access. It does **not** prove that the presenting player can read that evidence. Before channel-private evidence is allowed in interrogation, evidence presentation must use the same player-authoritative readability boundary as Board/Search/AI.

### Interaction model
- Character stage + team presence + evidence table.
- One active interrogator, teammates can hand over material in realtime.
- Player move = bounded question or present specific material.
- Character response = authored layer + bounded AI performance.
- Statements become time-stamped records only after they are actually said in play.
- Return interviews are normal; a later discovery can unlock a new confrontation move.
- Voice can be added later over the same state machine.

## 11. Room 714 signature mechanic — Movement Reconstruction

Use the existing locations, travel matrix and timeline facts as the deterministic physics layer.

Presentation:
- place map/floor stack + horizontal night timeline
- people as movable hypothesis tracks
- known CCTV/access/statement anchors
- private anchors stay private until shared
- contradictions attach to the segment that fails

The engine may say:
- impossible by time/distance/access
- contradicts known anchor
- unsupported gap

It may never draw the correct route automatically.

## 12. Scene 17 direction

Do not clone Room 714.

Signature mechanic: **Performance Reconstruction**

Three synchronized layers:
1. WRITTEN — original script/manuscript/pages
2. INSTRUCTED — modified pages, cues, schedules, directions
3. HAPPENED — CCTV, sensor/log, audio, physical outcome

Players align material across the performance timeline and test contradictions between layers.

Scene 17 cannot enter full implementation until the existing canon/asset manifest decisions are closed (date, victim identity, contamination, numbering, E19/E20/E22, E18/E34 media, phone scheme, chapter-2 node conditions, missing assets).

## 13. Recommended implementation sequence

### RESET-1 — Runtime foundation
Design and implement the generic Investigation Runtime primitives:
- leads
- discovery events
- case/world state
- action availability
- provenance
- player-private discovery
- team Pulse events

No new polished UI yet.

### RESET-2 — Room 714 Act 0/1 vertical slice
Replace the current start with a real 15–20 minute flow:
- case briefing
- Room 714 exploration
- victim items/passport
- laptop draft
- glass/blood collection and processing
- room door/access lead
- first person lead
- Pulse events between two players

Success criterion: two players naturally need to talk without opening the Board.

### RESET-3 — Hotel systems / places
Turn Security Office, Hall 7, Service Elevator and M1 into actual place/tool progression.

### RESET-4 — Living case states
Make RAMI_FOUND and RAMI_DIED consequences of authored runtime conditions/actions, not evidence prerequisites.

### RESET-5 — Interrogation V2
Security boundary first, then staged multiplayer confrontation UI and complete missing Room 714 characters.

### RESET-6 — Movement Reconstruction
Build Room 714's signature mechanic over the existing timeline engine.

### RESET-7 — Full Room 714 content/asset integration
Resolve/route all approved assets; remove master-list progression and duplicate evidence concepts.

### RESET-8 — Full Room 714 E2E
Target session: 60–120 minutes, 2–8 players.

### RESET-9 — Scene 17 canon cleanup and full runtime content
Resolve manifest blockers first.

### RESET-10 — Performance Reconstruction + Scene 17 E2E

### RESET-11 — Final UX / cinematic layer
Use Figma/MagicPath for interactive prototypes, then build final art direction, intro/event videos, sound design, transitions and ending sequences.

## 14. Rules to freeze before implementation

1. **No master evidence checklist as a progression surface.** Case File is a record of discoveries, not a shop/list of future evidence.
2. **A new evidence code is not automatically a new discovery.** Objects, statements, leads and events may exist without bloating evidence count.
3. **Every material has authored provenance.** The player can answer "how did we get this?"
4. **Private discovery stays private until a deliberate product mechanism broadens it.** Pulse never leaks content.
5. **World milestones are caused by gameplay state/actions, not by inserting the document that describes the aftermath.**
6. **AI can operate only on AuthorizedKnowledge and must cite its authorized inputs.**
7. **Specialization = capability; distribution/channel = information.** Never merge them.
8. **Case-specific signature mechanics sit above the shared runtime.** Room 714 ≠ Scene 17 reskin.
9. **Do not polish a broken loop.** Final cinematic/UI pass happens after E2E gameplay is fun in functional presentation.

