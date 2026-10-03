# Security

Security is non-negotiable for this project — it shipped from a prior insecure prototype where the entire case solution was readable from the browser, and that must never happen again in any form.

## Never

- Expose Supabase service role keys, anywhere, in any log, comment, or client-reachable code path.
- Print or echo `.env` / `.env.local` contents.
- Expose `media_path`, internal storage object paths, or any private object path to the browser as a stable/reusable value.
- Add an RLS select policy to a table holding solution content (`characters`, `timeline_facts`, `case_verdict_questions`, `case_narrative`, `case_milestones`, and any future table of the same kind).
- Make a Storage bucket public, or weaken/bypass RLS "for convenience" or "just for now."
- Move solution-bearing logic (what's correct, what's proven, what a character actually knows) into client-side code.
- Accept a private storage path, evidence body, or any authorization-relevant value supplied by the browser as truth — always re-derive it server-side from `session_id` + `auth.uid()`.
- Run destructive SQL, commit, or push without being explicitly asked to.
- Mutate production data outside of an explicit, reviewed migration/seed script.

## Required pattern for any new solution-bearing content

1. Table gets zero RLS select policies (or, if some public metadata must be visible, split public metadata into a separate table/view from the actual solution content).
2. A `SECURITY DEFINER` Postgres function or a Route Handler using the service-role client is the only access path.
3. That function/handler re-verifies, from scratch, on every call: `auth.uid()` is set, the user is a member of the given `session_id`, their specialization matches (if relevant), and the specific content is actually unlocked/authorized for that session (if relevant) — never assume a prior check elsewhere covers it.
4. Only the minimum needed result is returned — evaluation results, not raw facts; a signed URL, not a permanent path; a redaction placeholder, not `null` silently.

## Media specifically

Every real media file (image/audio/video/PDF) lives in the private `case-media` Storage bucket. It is served **only** via a signed URL with a short TTL (currently 60s), minted by `/api/evidence-media` after re-checking membership, specialization, and unlock status server-side on every request. The browser only ever sends `{ sessionId, evidenceCode }` to that endpoint and receives a signed URL plus safe metadata back — it never sends or receives `media_path` itself. `evidence_index()` reflects this too: it exposes a `has_media` boolean to the client, never the path. Never render a raw Storage path as an `<img src>`/`<audio src>` directly, and never cache a signed URL beyond its own lifetime.

## Verification habit

After implementing or touching anything security-relevant, actually test it, don't just reason about it:
- Try to query a locked table directly from a browser console session as a non-privileged authenticated user — expect an empty result or a permissions error.
- Try to build a direct Storage object URL (`.../object/public/case-media/...`) — expect 404/Forbidden.
- Try calling a specialization-gated endpoint as the wrong specialization — expect a 403, even when the underlying evidence is otherwise unlocked.

If any of these unexpectedly succeed, treat it as a P0 bug and stop other work to fix it.
