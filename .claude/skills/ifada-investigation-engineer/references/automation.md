# Automation & Working Mode

## Subagents (if supported by your current Claude Code version)

For substantial features, prefer routing specialist review through isolated subagents rather than doing everything in the main context — this keeps the main thread's context focused and lets each review be genuinely thorough. Suggested roster (create only if your current Claude Code setup supports project subagents; verify the exact current configuration syntax against Claude Code's own docs rather than assuming, since this changes between versions):

- **UI/Cinematic Director** — reviews against `ui-quality.md` + `investigation-ux.md`. Core question: does this look and feel like a commercial investigation game, or a generic dashboard?
- **Security Reviewer** — reviews against `security.md`. Conservative by default; escalates rather than approves when unsure.
- **Game Designer** — reviews against `product-principles.md` §3–4 (player discovery, asymmetric information). Never changes canonical case facts itself.
- **Multiplayer Engineer** — reviews against `multiplayer.md`.
- **QA Investigator** — reviews against `testing-checklist.md`, from the player's perspective, on both desktop and mobile.

Don't invoke every reviewer for trivial changes — match the review(s) to what the feature actually touches:

| Feature touches | Reviewers |
|---|---|
| UI only | UI Director + QA |
| Supabase/API | Security Reviewer + QA |
| Realtime/multiplayer | Multiplayer Engineer + Security Reviewer + QA |
| Major gameplay mechanic | Game Designer + UI Director + QA |

Pipeline shape for a substantial feature: implement → relevant specialist review(s) → QA verification → fix issues found → final self-review → summarize to Hazem → **stop for approval** (see `SKILL.md`'s working-mode section — this does not change the approval boundary, it just organizes the work *inside* one approved feature).

## Browser/UI verification

When a feature changes UI or player interaction, don't rely on reading code alone. If browser automation (Chrome DevTools, Playwright, or an available MCP browser tool) is present in your current environment, use it to actually check: page loads, no navigation mistakes, overlay/modal behavior, evidence interaction, console errors, layout, and mobile/responsive behavior. If no browser automation is available, say so explicitly and mark visual verification as needing manual confirmation from Hazem — never claim a visual/browser check that wasn't actually performed.


## Default mode: autonomous within a feature, not across features

See `SKILL.md` for the exact rule — summarize and wait for confirmation **between** features, but don't ask permission for routine steps **within** a feature. Don't stop to ask:
- "should I create this component?"
- "should I run the linter?"
- "should I continue?"
- "should I refactor this small piece?"

Make reasonable engineering decisions independently at that granularity. Do stop (even mid-feature) for the exceptions listed in `SKILL.md` — story ambiguity, canon changes, destructive operations, missing credentials, missing user-supplied content.

## Standard loop for a normal task

1. Inspect relevant files and the existing pattern (check `architecture.md` first).
2. Implement.
3. Refactor if it clearly improves the result — don't refactor unrelated working code just for style.
4. Run targeted checks on touched files (lint, type-check).
5. Fix your own errors.
6. Self-review against the checklists in `SKILL.md` and `testing-checklist.md`.
7. Report at the end of the feature (format in `SKILL.md`).

## Safe automation/hooks worth adding (if not already present)

- Lint + type-check on touched files.
- Secret-pattern detection before any commit-adjacent action (even though this project doesn't auto-commit, catching an accidental hardcoded key early is cheap insurance).
- A check that fails loudly if `content-source/` is ever staged/tracked by git.
- A check that flags new `any` usage in a diff.
- A check that flags a changed component file exceeding ~300 lines.
- A check that flags direct client-side use of a raw `media_path` (should only ever flow through the signed-URL Route Handler).

## Never automate

Commits, pushes, deployments, destructive SQL, or any mutation of production data. These stay manual and explicit, always.

## Token/context efficiency

Use targeted reads and search instead of repeatedly scanning the whole repository. Don't load `content-source/` (large binary asset staging folder) without a concrete reason. Don't re-read old, unrelated legacy code from the prior insecure prototype unless a task specifically requires consulting it as a content source (see `architecture.md`).
