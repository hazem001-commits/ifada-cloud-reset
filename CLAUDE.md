@AGENTS.md

# Development agents & orchestration

Five project-local subagents live in `.claude/agents/`: `ifada-ui-director`, `ifada-security-reviewer`, `ifada-game-designer`, `ifada-multiplayer-engineer`, `ifada-qa-investigator`. Each has a detailed description that drives automatic delegation — read a given agent's file for its full scope before assuming what it covers.

**Priority order for any design/UI decision:** IFADA product identity/architecture/canon (`.claude/skills/ifada-investigation-engineer/`) → the relevant IFADA specialist subagent → `ui-ux-pro-max` skill (UX principles, typography, layout, accessibility) and/or the 21st MCP (component search/inspiration) as supporting design intelligence only. Never let a generic component or pattern from `ui-ux-pro-max`/21st override IFADA's own cinematic identity — adapt anything external to IFADA's visual identity, architecture, RTL, mobile, and accessibility needs before using it, and never add a new UI package just because a 21st example used one.

**Delegate deliberately, not by default.** A simple one-file bug fix: handle it directly, no subagent. Route to specialists only when the task matches their scope:
- Major UI feature → implement → `ifada-ui-director` → `ifada-qa-investigator`
- Supabase/API/security-sensitive feature → implement → `ifada-security-reviewer` → `ifada-qa-investigator`
- Realtime/multiplayer feature → implement → `ifada-multiplayer-engineer` → `ifada-security-reviewer` (if relevant) → `ifada-qa-investigator`
- Major gameplay mechanic → `ifada-game-designer` → `ifada-ui-director` (if visual) → `ifada-qa-investigator`
- Large cross-system feature → use only the specialists actually relevant, not all five

Don't spawn specialists for trivial greps/edits — that wastes context for no benefit. Each specialist should read only what's relevant to its task and report back a short, structured summary rather than a full transcript.

**Approval model (do not change):** Hazem approves a meaningful feature → Claude completes it autonomously, self-tests, and reports → Claude stops → Hazem approves the next feature. Inside an approved feature, no permission is needed for normal edits, lint, type checks, safe tests, or refactors the feature directly requires. Claude must still explicitly ask before: destructive SQL, production-data mutation, deleting important files/data, changing case canon, changing major gameplay rules, changing core multiplayer architecture, installing a major new dependency, or any commit/push/deploy.

Several of these boundaries are also backed by project hooks in `.claude/settings.json` (`.claude/hooks/*.mjs`) — secret-file protection, a `content-source/` commit guard, a client-side `media_path` guard, and an "ask before destructive SQL" prompt. Treat these as a backstop, not a substitute for asking Hazem when a change is genuinely major.
