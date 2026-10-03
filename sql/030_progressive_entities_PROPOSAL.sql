-- ============================================================
-- IFADA — 030_progressive_entities_PROPOSAL.sql
--
-- NOT A MIGRATION. DESIGN PROPOSAL ONLY — never run as-is (like 021).
-- Needs authored entity content from Hazem first (which descriptors,
-- earned by which evidence / object state / connection / interrogation
-- layer). No existing character is converted.
--
-- PROGRESSIVE PERSON / UNKNOWN ENTITY
--   unknown man → grey-haired man → possible hotel guest → possible
--   doctor → the named person — only as the player/team EARNS it.
--
-- Pure code foundation already in place: src/lib/entities/progressive.ts
-- (entityViewFor, mergeEarned, renderEntityRefs) + tests.
-- ============================================================

-- 1. Authored truth (server-only; RLS on, no policies).
create table public.case_entities (
  case_id   text not null references public.cases(id) on delete cascade,
  entity_id text not null,
  primary key (case_id, entity_id)
);

create table public.case_entity_descriptors (
  case_id       text not null,
  entity_id     text not null,
  descriptor_id text not null,
  label         text not null,
  level         smallint not null,
  is_identity   boolean not null default false,
  -- [{"kind":"evidence","code":"V-01"}, {"kind":"object_state","code":"X","state":"S"},
  --  {"kind":"connection","ruleId":"R"}, {"kind":"interrogation_layer","character":"K","layer":3}]
  earned_by     jsonb not null default '[]'::jsonb,
  primary key (case_id, entity_id, descriptor_id),
  foreign key (case_id, entity_id) references public.case_entities(case_id, entity_id) on delete cascade
);

-- 2. Opaque per-session handles — the canonical entity_id never leaves
--    the server. Generated once (gen_random_uuid-based), stable per session.
create table public.session_entity_handles (
  session_id uuid not null references public.sessions(id) on delete cascade,
  entity_id  text not null,
  handle     text not null unique,
  primary key (session_id, entity_id)
);

-- 3. NO per-session "knowledge" table: what a player has earned is
--    DERIVED from state that already exists and is already authorized —
--    readable evidence_index rows, visible object states (026),
--    validated connections (027), interrogation layers reached — plus
--    what teammates have shared. Nothing new to leak or keep in sync.
--
-- 4. RPC known_entities(p_session) → (handle, label, level, descriptors,
--    identified) for the CALLER only: compute earned sources from the
--    authorized reads above, return the highest earned descriptor per
--    entity, and omit entities with no earned descriptor entirely.
--    Never returns entity_id, unearned labels, or earned_by.
--
-- 5. Evidence text may reference {{entity:ID}}; evidence_index would
--    render it with the caller's current label (renderEntityRefs rule),
--    so evidence never forces full identity disclosure.
-- ============================================================
