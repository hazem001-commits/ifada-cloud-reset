#!/usr/bin/env node
// PreToolUse guard (matcher: Edit|Write|MultiEdit).
// Blocks introducing the literal identifier `media_path` into client-scoped
// files. Server-only paths (api routes, server.ts, *.server.ts, middleware,
// scripts, sql) are excluded on purpose — they may legitimately reference it.
import { readHookInput } from "./lib/hook-utils.mjs";

const input = readHookInput();
const toolName = input.tool_name;
const toolInput = input.tool_input || {};

const SERVER_EXCLUDE = [
  /(^|\/)src\/app\/api\//i,
  /(^|\/)src\/lib\/(supabase\/)?server(\.[a-z]+)?\.tsx?$/i,
  /\.server\.tsx?$/i,
  /(^|\/)route\.tsx?$/i,
  /(^|\/)middleware\.tsx?$/i,
  /(^|\/)scripts\//i,
  /(^|\/)sql\//i,
];
const CLIENT_INCLUDE = [/(^|\/)src\/app\//i, /(^|\/)src\/components\//i];

function isClientScoped(filePath) {
  const norm = String(filePath || "").replace(/\\/g, "/");
  if (!CLIENT_INCLUDE.some((re) => re.test(norm))) return false;
  if (SERVER_EXCLUDE.some((re) => re.test(norm))) return false;
  return true;
}

function collectNewText(name, ti) {
  if (name === "Write") return String(ti.content || "");
  if (name === "Edit") return String(ti.new_string || "");
  if (name === "MultiEdit" && Array.isArray(ti.edits)) {
    return ti.edits.map((e) => String(e.new_string || "")).join("\n");
  }
  return "";
}

try {
  if (!["Write", "Edit", "MultiEdit"].includes(toolName)) process.exit(0);
  const filePath = toolInput.file_path || "";
  if (!isClientScoped(filePath)) process.exit(0);

  const text = collectNewText(toolName, toolInput);
  if (/\bmedia_path\b/.test(text)) {
    process.stderr.write(
      `Blocked: "media_path" would be introduced into client-facing code (${filePath}).\n` +
        "IFADA invariant: browser code must never receive internal Storage paths.\n" +
        "Client code should send only safe identifiers (e.g. sessionId, evidenceCode); the server resolves media_path and returns a short-lived signed URL.\n" +
        "If this file is genuinely server-only, its path doesn't match this hook's server-exclusion patterns — ask Hazem before adjusting the hook rather than working around it.\n"
    );
    process.exit(2);
  }
} catch {
  // Fail open.
}
process.exit(0);
