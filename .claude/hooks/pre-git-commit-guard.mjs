#!/usr/bin/env node
// PreToolUse guard (matcher: Bash).
// On `git commit`, blocks the commit if staged (or, for -a/-am, about-to-be-staged)
// files include secret/credential files or content-source/ paths.
// Never runs `git reset`/`git rm`/etc itself — it only reports and blocks.
import { spawnSync } from "node:child_process";
import { readHookInput, isSecretPath, isContentSourcePath } from "./lib/hook-utils.mjs";

const input = readHookInput();
const toolInput = input.tool_input || {};
const cwd = input.cwd || process.cwd();

function gitList(args) {
  try {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    return (r.stdout || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

try {
  if (input.tool_name !== "Bash") process.exit(0);
  const command = String(toolInput.command || "");
  if (!/\bgit\s+commit\b/.test(command)) process.exit(0);

  let files = gitList(["diff", "--cached", "--name-only"]);

  // `-a`/`--all`/`-am` also commit modifications to already-tracked files
  // without a prior `git add`.
  if (/(^|\s)-a(\s|$)|(^|\s)--all(\s|$)|(^|\s)-am(\s|$)/.test(command)) {
    files = files.concat(gitList(["diff", "--name-only"]));
  }

  const secretHits = [...new Set(files.filter(isSecretPath))];
  const contentSourceHits = [...new Set(files.filter(isContentSourcePath))];

  if (secretHits.length) {
    process.stderr.write(
      "Blocked: this commit would include what look like secret/credential files:\n" +
        secretHits.map((f) => `  - ${f}`).join("\n") +
        "\n" +
        "Secret files must never be committed. Unstage them (`git restore --staged <file>`) before committing.\n"
    );
    process.exit(2);
  }
  if (contentSourceHits.length) {
    process.stderr.write(
      "Blocked: this commit would include content-source/ files:\n" +
        contentSourceHits.map((f) => `  - ${f}`).join("\n") +
        "\n" +
        "content-source/ must remain local and untracked. Unstage them (`git restore --staged content-source/...`) before committing.\n"
    );
    process.exit(2);
  }
} catch {
  // Fail open.
}
process.exit(0);
