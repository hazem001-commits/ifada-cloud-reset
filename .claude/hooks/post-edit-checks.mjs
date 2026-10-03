#!/usr/bin/env node
// PostToolUse check (matcher: Edit|Write|MultiEdit).
// Non-blocking (exit 2 on PostToolUse surfaces feedback without undoing the
// edit that already happened): targeted ESLint, newly-introduced `any`
// detection, and an oversized-component warning, scoped to changed
// application TS/TSX files under src/.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { readHookInput } from "./lib/hook-utils.mjs";

const input = readHookInput();
const toolName = input.tool_name;
const toolInput = input.tool_input || {};
const cwd = input.cwd || process.cwd();

function isTargetFile(filePath) {
  const norm = String(filePath || "").replace(/\\/g, "/");
  if (!/\.(ts|tsx)$/.test(norm)) return false;
  if (!/(^|\/)src\//.test(norm)) return false;
  if (/(^|\/)(node_modules|\.next|dist|build)\//.test(norm)) return false;
  return true;
}

function collectTexts(name, ti) {
  if (name === "Write") return { oldText: "", newText: String(ti.content || "") };
  if (name === "Edit") {
    return { oldText: String(ti.old_string || ""), newText: String(ti.new_string || "") };
  }
  if (name === "MultiEdit" && Array.isArray(ti.edits)) {
    return {
      oldText: ti.edits.map((e) => String(e.old_string || "")).join("\n"),
      newText: ti.edits.map((e) => String(e.new_string || "")).join("\n"),
    };
  }
  return { oldText: "", newText: "" };
}

const ANY_REGEX = /:\s*any\b|<\s*any\s*>|\bas\s+any\b|\bany\[\]|Array<\s*any\s*>/g;

try {
  if (!["Write", "Edit", "MultiEdit"].includes(toolName)) process.exit(0);
  const filePath = toolInput.file_path || "";
  if (!isTargetFile(filePath)) process.exit(0);

  const sections = [];

  // 1. Newly introduced explicit `any` (approximate: compares old vs new
  //    snippet counts; a full-file Write has no "old" snapshot to diff
  //    against, so it flags any `any` present in the written content).
  const { oldText, newText } = collectTexts(toolName, toolInput);
  const newCount = (newText.match(ANY_REGEX) || []).length;
  const oldCount = (oldText.match(ANY_REGEX) || []).length;
  if (newCount > oldCount) {
    sections.push(
      `New explicit "any" usage detected in ${filePath} (IFADA has a zero-new-any rule). Replace with a real type, or a narrowly justified inline exception if truly unavoidable.`
    );
  }

  // 2. Oversized component (warning only, not a blocker).
  try {
    const lineCount = fs.readFileSync(filePath, "utf8").split("\n").length;
    if (/\.tsx$/.test(filePath) && lineCount > 300) {
      sections.push(
        `${filePath} is now ~${lineCount} lines. Consider whether it should be split into smaller components (warning only, not a blocker).`
      );
    }
  } catch {
    // File may not exist / not readable — skip silently.
  }

  // 3. Targeted ESLint on just this file.
  try {
    const result = spawnSync("npx", ["eslint", filePath], {
      cwd,
      encoding: "utf8",
      timeout: 20000,
      shell: true,
    });
    const out = `${result.stdout || ""}${result.stderr || ""}`.trim();
    if (out) {
      sections.push(`ESLint findings for ${filePath}:\n${out.slice(0, 4000)}`);
    }
  } catch {
    // ESLint unavailable/failed — skip silently, never block on tooling issues.
  }

  if (sections.length) {
    process.stderr.write(sections.join("\n\n") + "\n");
    process.exit(2);
  }
} catch {
  // Fail open.
}
process.exit(0);
