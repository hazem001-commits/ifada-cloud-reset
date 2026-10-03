#!/usr/bin/env node
// PreToolUse guard (matcher: Read|Bash).
// Blocks reading/printing secret files or secret-shaped env vars.
// Never echoes the offending command/value back — filenames only.
import { readHookInput, isSecretPath } from "./lib/hook-utils.mjs";

const input = readHookInput();
const toolName = input.tool_name;
const toolInput = input.tool_input || {};

try {
  if (toolName === "Read") {
    const filePath = toolInput.file_path || "";
    if (isSecretPath(filePath)) {
      process.stderr.write(
        "Blocked: refusing to read a secret/credential file.\n" +
          "IFADA safety rule: never print .env*/.pem/service-role credential file contents.\n" +
          "If you need to confirm which variables are expected, check .env.example (if present) or grep source for `process.env.<NAME>` references instead.\n"
      );
      process.exit(2);
    }
  } else if (toolName === "Bash") {
    const command = String(toolInput.command || "");
    const printCmd = /\b(cat|type|more|less|bat|head|tail|Get-Content|gc)\b/i;
    const envPath = /(^|[\s"'/\\])\.env(\.[A-Za-z0-9_.-]+)?($|[\s"'])/;
    const secretEcho =
      /\becho\b[^\n]*\$(?:env:)?[A-Za-z0-9_]*(SECRET|SERVICE_ROLE|API_KEY|PRIVATE_KEY)/i;

    if ((printCmd.test(command) && envPath.test(command)) || secretEcho.test(command)) {
      process.stderr.write(
        "Blocked: this command looks like it would print a secret file or secret-shaped env var to the transcript.\n" +
          "IFADA safety rule: never print .env*/service-role/API secret values. Check variable *existence* via source code references instead of printing values.\n"
      );
      process.exit(2);
    }
  }
} catch {
  // Fail open: a bug in this hook must never block normal work.
}
process.exit(0);
