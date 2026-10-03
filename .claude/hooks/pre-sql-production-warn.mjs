#!/usr/bin/env node
// PreToolUse guard (matcher: Bash).
// Non-blocking: for command shapes that look like a real SQL/production
// mutation, asks the permission layer to surface an explicit confirmation
// prompt (permissionDecision "ask") instead of silently allowing or
// hard-denying. This hook never runs SQL or DB commands itself.
import { readHookInput } from "./lib/hook-utils.mjs";

const input = readHookInput();
const toolInput = input.tool_input || {};

const MUTATION_PATTERNS = [
  /\bsupabase\s+db\s+(push|reset)\b/i,
  /\bsupabase\s+migration\s+(up|repair)\b/i,
  /\bsupabase\s+functions\s+deploy\b/i,
  /\bpsql\b[^\n]*(-c\s|-f\s|--command|--file)/i,
  /<\s*\S+\.sql\b/,
  /\bvercel\b[^\n]*--prod\b/i,
];

try {
  if (input.tool_name !== "Bash") process.exit(0);
  const command = String(toolInput.command || "");
  if (MUTATION_PATTERNS.some((re) => re.test(command))) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason:
            "This looks like a destructive SQL / production-mutation command (migration push/reset, direct psql execution, or a prod deploy). Per IFADA's approval model, Hazem must explicitly approve this before it runs.",
        },
      })
    );
    process.exit(0);
  }
} catch {
  // Fail open.
}
process.exit(0);
