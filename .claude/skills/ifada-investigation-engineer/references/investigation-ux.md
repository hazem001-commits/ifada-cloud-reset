# Investigation UX Library

Reusable, diegetic (in-world) interaction patterns. Prefer these over generic components. All evidence opens as an in-page overlay over the current screen (dimmed/blurred background), never a route change to a separate page.

## Documents (reports, PDFs, official text)
Physical folder interaction: slides/pulls into view rather than fading in. Paper texture. Stamps (animated impact, not just a static image) marking classification or the evidence code. Handwriting styling where the source is handwritten. Archive labels. Confidentiality marks. Annotation affordance where useful.

## CCTV / surveillance
Multi-camera interface feel: timestamp overlay burned into the frame, scanlines, muted/desaturated color grading distinct from normal photography. Frame-by-frame stepping controls (not just a scrub bar). Visualize missing/gapped frames rather than hiding them. Zoom/inspection affordance.

## Audio
An evidence-recorder interface, not a default `<audio>` bar: spinning reel or waveform, REC-style indicator, monospace timestamp counter. Show suspicious-silence markers directly on the waveform where the case data supports it. Sync a transcript reveal under the player only when a real transcript exists for that evidence — never fabricate one (see product-principles.md, "no fake gameplay"). Playback-speed control where it genuinely helps (e.g. re-listening to a pause).

## Images
Inspection-lamp / spotlight interaction (a light radius following the cursor/touch point on a dimmed image) rather than a static `<img>`. Zoom and magnifier affordance. Comparison mode where two images are relevant together. Distinguish visually between CCTV stills (surveillance treatment above) and personal/social photos (simple photographic framing).

## Phone / chat evidence
Realistic device UI: message bubbles, timestamps, read receipts, RTL Arabic correctly rendered, attachment previews. Only show a "deleted message" placeholder when the evidence data actually supports that beat — never invent one for effect.

## Forensics / lab results
Lab-report styling: specimen IDs, structured result fields, comparison tooling where two samples are being matched. Should read like an institutional document, not a chat bubble or generic card.

## Timeline / reconstruction
This maps to the existing Timeline Consistency Engine (`evaluate_theory`) — don't rebuild its logic, build UI around it. Multiple clocks where relevant, visible conflicts, a draggable investigation timeline surface. The engine tells the player "impossible" / "contradicts evidence" / "gap" — never "here is the answer."

## Floor plans / maps
Layered locations, access routes, service areas, event markers, movement comparisons — useful for presenting the travel-time graph behind the reconstruction engine visually instead of as a plain dropdown-based form.

## Investigation board
Already built (`board_notes`, `board_links`) — draggable evidence, free-text notes, red-thread links, shared realtime state. Never add automatic reasoning to it (no auto-suggested links, no "this probably connects to..."). The board-triggered discovery mechanic (linking two specific notes unlocks new evidence) belongs here — see the project's creative-features backlog.

## Interrogation
Already built (layered-truth AI characters via `/api/interrogate`). UI should feel like a believable interview environment: visible question history, contradictions surfaced only when the player has actually presented supporting evidence (never shown preemptively), audio/video presence only where real recorded content exists for that character.

## General interaction rules across all evidence types
- Everything opens in-page (overlay/modal), never a separate route.
- Consistent open/close motion in both directions (open forward, close by reversing the same motion — it should feel like "putting it back," not just dismissing a dialog).
- Subtle sound on open (paper rustle, click, tape-deck) — must respect mute and `prefers-reduced-motion`/`prefers-reduced-data` where relevant, and must never be loud, autoplaying, or repetitive.
- A physical "mark as reviewed" interaction (a stamp the player applies themselves) is a good small ritual — implement only if it doesn't get in the way of speed-running the case.
