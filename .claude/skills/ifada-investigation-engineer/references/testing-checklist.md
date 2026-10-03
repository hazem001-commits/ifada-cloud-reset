# Testing / Self-Review Checklist

Run this privately before considering any feature finished. If any answer is weak, improve it before stopping — don't report a weak result and ask whether to fix it.

## Multi-perspective review

- **Product** — Does this feel premium? Would a paying player feel it was worth the money?
- **Game design** — Does this create gameplay, or just interface? Does it give the platform information the players should be discovering themselves? (Check against `product-principles.md` §3.)
- **Investigation feel** — Does this make the player feel like a detective, or like a form-filler?
- **UX** — Is it understandable without explanation?
- **Visual** — Does it look intentional, or generic/default?
- **Multiplayer** — Does it preserve or improve cooperation and asymmetric-information dynamics?
- **Security** — Did anything sensitive become client-visible? (Actually test it — see `security.md`'s verification habit, don't just reason about it.)
- **Mobile** — Does it genuinely work on a touch device, not just a resized browser window?
- **Accessibility** — Keyboard, focus, contrast, reduced-motion, labels — all present?
- **Performance** — Any unnecessary network calls or media loads introduced?
- **Code** — Is this maintainable? Any new `any`? Any file creeping past ~300 lines?

## Concrete tests to actually run, not just reason about

- Open the feature as two different authenticated users concurrently (see `multiplayer.md`) where relevant.
- Try to access locked content as the "wrong" specialization — expect a clean 403/redaction, not a crash or a leak.
- Try a direct/constructed URL to bypass the intended flow (Storage object URL, API route with a guessed ID) — expect a clean rejection.
- Check the browser console for errors during the full flow.
- Check `prefers-reduced-motion` and a narrow mobile viewport.
- If the feature touches the case's solution/canon in any way, re-read the relevant source material and confirm nothing was invented or altered.

## Before reporting a feature as done

Confirm explicitly (this goes in the final report, per `SKILL.md`):
- No secret value was printed, logged, or committed.
- Nothing was committed or pushed.
- Any idea you deliberately didn't implement (because it would meaningfully change story or product behavior) is flagged, not silently dropped or silently implemented.
