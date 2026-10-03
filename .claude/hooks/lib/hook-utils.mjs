import fs from "node:fs";

// Reads the JSON payload Claude Code feeds hook commands on stdin.
// Fails open (returns {}) on any parse/read error so a malformed
// payload never turns into an accidental hard-block.
export function readHookInput() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    if (!raw || !raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export const SECRET_FILE_PATTERNS = [
  /(^|[\\/])\.env(\.[A-Za-z0-9_.-]+)?$/i,
  /\.pem$/i,
  /(^|[\\/])id_rsa$/i,
  /(^|[\\/])id_ed25519$/i,
  /service[-_]?account.*\.json$/i,
  /(^|[\\/])credentials\.json$/i,
  /\.key$/i,
];

export function isSecretPath(p) {
  const norm = String(p || "").replace(/\\/g, "/");
  return SECRET_FILE_PATTERNS.some((re) => re.test(norm));
}

export function isContentSourcePath(p) {
  const norm = String(p || "").replace(/\\/g, "/");
  return /(^|\/)content-source\//i.test(norm);
}
