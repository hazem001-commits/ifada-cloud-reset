# Product Principles

IFADA is a premium multiplayer digital investigation game. Players are not reading evidence cards — they should feel like they are inside a real investigation, combining forensic analysis, CCTV review, interviews, digital investigation, documents, audio, timelines, team communication, asymmetric information, and collaborative reasoning. Closer to an interactive investigative thriller than a website with cards and buttons.

## 1. Immersion over generic web UI

Avoid generic SaaS-dashboard patterns whenever a more immersive investigation interaction is possible.

Avoid: plain cards, plain file lists, default browser audio players, plain modals, standard admin tables, generic buttons everywhere, opening files in separate browser tabs.

Prefer: evidence examination surfaces, physical document interactions, CCTV consoles, forensic viewers, recorder interfaces, archive drawers, investigation boards, interactive scene inspection, believable phone interfaces, institutional records, specialized tools.

UI must still remain usable and accessible — immersive, not obscure.

## 2. Every evidence type should feel different

A PDF should feel like a document. A CCTV image should feel like surveillance footage. An interview should feel like recorded testimony. A chat should feel like a captured phone conversation. A forensic result should feel like a lab report. A financial record should feel institutional. Do not force every evidence type into the same visual component. (Full patterns in `investigation-ux.md`.)

## 3. Player discovery, not platform reasoning

The platform reveals, organizes, displays, synchronizes, and simulates investigative tools — it never automatically connects evidence into conclusions. Players must talk, compare, reason, and disagree. Never replace human deduction with automatic reasoning unless explicitly requested. This is the single most important design constraint in the whole product.

## 4. Asymmetric information

Multiplayer specialization (forensics / digital / field / records) is a core design principle, not a cosmetic label. Design features that create "wait — what did you see?" moments instead of giving every player identical screens. Preserve the existing specialization and evidence-access architecture; extend it, don't dilute it.

## 5. Team communication is gameplay

Voice chat and multiplayer coordination are not utility features — they are part of the investigation. When designing systems, look for opportunities where players must communicate and combine partial information to progress.

## 6. Realism

Evidence should look believable. Jordanian/Amman context should feel authentic where applicable. Documents should look official. Times, dates, CCTV, records, service areas, hotel systems, police-style paperwork, chats, and logs should visually make sense. Never ship obviously fake placeholder-looking evidence.

## 7. Cinematic restraint

Premium does not mean effects everywhere. Use controlled motion, lighting, depth, typography, sound, transitions, environmental effects, and selective color accents. Avoid gaming neon, excessive glow, cheap sci-fi HUD styling, cartoonish animation, unnecessary gradients, visual clutter. Think: premium crime thriller, not arcade.

## Design thinking mode — ask this for every meaningful feature

- Can this interaction feel more physical?
- Can it reveal information progressively?
- Can sound improve immersion (respecting mute/reduced-motion)?
- Can multiplayer make this more interesting?
- Can the player interact instead of just clicking?
- Can the interface visually communicate evidence type?
- Can this moment create tension?
- Can this feature create discussion between players?
- Can this feel like an investigation tool rather than a website?

If an improvement is safe and aligned with the current task, implement it. If it would significantly alter product behavior or story logic, report it as a proposed idea instead of silently changing it.

## Case-canon guardian — creative freedom vs. none

**Full creative freedom:** UI, interaction design, animation, sound, investigation tools, presentation, layout, visual storytelling, motion, atmosphere.

**Zero autonomous creative freedom:** suspects, the culprit, motive, evidence facts, timestamps, dialogue, forensic conclusions, witness claims, the hidden solution, the canonical sequence of events. These come only from existing case source material or an explicit decision from the project owner (Hazem) — never invented, extrapolated, or "fixed for continuity" on your own initiative, even when a gap looks like an oversight.

If case truth is unclear or a gap is found: **stop and ask**, don't fill it in. This applies even to small-seeming details (an exact timestamp, a minor witness's exact wording) — small invented facts still corrupt the canon the Timeline Consistency Engine and the interrogation layered-truth system both depend on being internally consistent.

## No fake gameplay

Never claim: multiplayer sync exists when it doesn't, AI analyzed evidence when it didn't, audio has a transcript when none exists, CCTV has frames that don't exist, or an event happened when it isn't canonical. Capabilities may be architected ahead of content, but never faked in front of the player.
