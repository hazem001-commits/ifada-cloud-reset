-- ============================================================
-- IFADA — 029_case_channels_PROPOSAL.sql
--
-- NOT A MIGRATION. DESIGN PROPOSAL ONLY — never run as-is (like 021).
-- It becomes a real migration only after: (1) the Scene 17 asset ↔
-- evidence manifest is approved, (2) Scene 17 evidence is seeded,
-- (3) Hazem approves the channel model below.
--
-- CHANNEL MODEL — information lanes, NOT specializations.
--   * Global specializations (field / digital / forensics / records)
--     stay exactly as they are: they control CAPABILITY (who can inspect,
--     analyse, query) via has_specialization / my_specializations.
--   * A case MAY instead distribute its private evidence by CHANNELS
--     (Scene 17: A–H). A player holds a global specialization PLUS one or
--     more case channels, assigned at start from an authored per-player-
--     count plan. Channels grant no capability and never touch
--     specialization authorization.
--   * Cases without channels (Room 714) are unaffected: evidence keeps
--     using owner_spec.
--
-- Code-side contract already in place (no SQL needed for it):
--   src/cases/scene-17/contract.ts        public channel ids + seat plan (2–8)
--   src/server/cases/scene-17/channels.ts authored channel titles + E-codes
-- ============================================================

-- 1. Authored lanes per case (server-only; RLS on, no policies).
create table public.case_channels (
  case_id    text not null references public.cases(id) on delete cascade,
  channel_id text not null check (channel_id ~ '^[A-Z]$'),
  title      text not null,
  sort_order integer not null default 0,
  primary key (case_id, channel_id)
);

-- 2. Authored seat plan: players → seat → channels (exactly-once check
--    done at seed time; mirrors channelPlanFor in src/cases/contract.ts).
create table public.case_channel_plans (
  case_id  text not null references public.cases(id) on delete cascade,
  players  smallint not null check (players between 2 and 8),
  seat     smallint not null check (seat >= 1),
  channels text[] not null,
  primary key (case_id, players, seat)
);

-- 3. Which lane an evidence item belongs to (null = shared with everyone).
--    Separate table (not an evidence column) so Room 714 rows are untouched.
create table public.evidence_channels (
  evidence_id uuid primary key references public.evidence(id) on delete cascade,
  channel_id  text not null
);

-- 4. Per-session assignment (written once by start_session, never by clients).
create table public.session_member_channels (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  channel_id text not null,
  primary key (session_id, user_id, channel_id)
);

-- 5. Assignment (sketch). Called from start_session AFTER specializations
--    are assigned, only when the case has case_channel_plans rows:
--      seats ordered by session_members.joined_at, seat n ← plan row n
--      for count(members); no plan for that count → start fails with
--      CHANNEL_PLAN_MISSING (fail closed, never "everyone sees all").
--
-- 6. Visibility (sketch). evidence_index / unlock_evidence gain ONE extra
--    branch for channel cases:
--      row returned at all := evidence has no evidence_channels row (shared)
--                          OR the caller holds that channel
--                          OR it was explicitly shared to the team
--    A non-holder gets NO ROW — not a title-only row. Channel-private
--    evidence is HIDDEN (no code, title, kind, clock or count), matching
--    the case contract (Scene 17: restrictedEvidence = 'hidden') and the
--    shared rule in src/lib/evidenceVisibility.ts that Grounded Search and
--    the AI contract both enforce.
--    Room 714 rows (no evidence_channels) keep the existing owner_spec
--    rule unchanged. This must be written as a verbatim copy of the
--    current evidence_index/unlock_evidence plus the one branch, per the
--    MIGRATIONS.md rule, with its own 2-player + 8-player verification.
--
-- 7. RPC my_channels(p_session) → text[] for the lane badge in the UI.
-- ============================================================
