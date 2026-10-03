# UI / Motion / Sound Quality

## Visual identity — extend, don't replace

The dark "cold security archive" identity is already established in `globals.css` (near-black background, paper/steel text tones, redaction-stripe motif for locked information, monospace for clocks/codes/timestamps, a seal/stamp accent for classification and critical states). Every new surface should extend this vocabulary, not introduce a competing one. Specific diegetic treatments per evidence type live in `investigation-ux.md`.

## Motion

Motion should reinforce physical interaction, not decorate: a document sliding from an archive, a stamp impact, evidence settling onto a table, a CCTV monitor powering on, a recorder's reel starting, a board item pinning into place. Avoid motion that exists only to look busy.

Always respect `prefers-reduced-motion`: provide an instant/near-instant equivalent, never just a longer fallback.

## Sound

Sound can reinforce interaction — a subtle paper sound, a switch click, a recorder button, radio static, a stamp thud, a file-drawer slide. Rules:
- Respect mute state and never autoplay loudly.
- Never loop or repeat in a way that becomes irritating over a 90+ minute session.
- Every sound-bearing interaction needs a silent-equivalent that's still fully usable (sound is atmosphere, never the only channel for information).

## Mobile is not an afterthought

Every major interaction gets a real touch-device pass, not just a browser resize check: touch target size, safe-area insets, scroll behavior, gesture conflicts (e.g. drag-to-link on the board vs. page scroll), modal/overlay height on small screens, and media playback controls sized for touch. Any desktop-only interaction pattern (hover-to-reveal, right-click, precise cursor-follow spotlight) needs a deliberate touch equivalent, not just "it still technically works."

## Error and loading states must stay in-world

Never show a raw technical error to a player (`"500 fetch failed"`, a stack trace, a bare error code). Write an in-world equivalent instead (e.g. "تعذّر استرجاع الملف من الأرشيف") while keeping the real diagnostic in server/console logs for developers. Loading states should describe what's actually happening ("جاري فك تشفير الملف…") without claiming an action that isn't really occurring — see `product-principles.md`, "no fake gameplay."

## Accessibility is not optional

Every image has `alt` text. Every interactive element is keyboard-reachable with a visible focus state. Color contrast meets a real standard (WCAG AA as a floor), especially for the paper-on-dark palette. `prefers-reduced-motion` and `prefers-color-scheme` are both respected, not just acknowledged.

## The screenshot test

Before calling any visual work finished, ask: would this screenshot read as a serious commercial investigation product, or as a school project / default component library demo / cheap escape-room site? If the second, it isn't done — see `SKILL.md`'s one-line test.
