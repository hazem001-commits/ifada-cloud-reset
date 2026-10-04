-- ============================================================
-- IFADA — 038_room714_opening_runtime.sql
-- RESET-2 · Room 714 opening chapter (Act 0/1) — CONTENT ONLY.
--
-- STATUS: REVIEW ONLY — NOT APPLIED. Written for Hazem's review per
-- sql/MIGRATIONS.md. Never run without explicit approval. Requires 037
-- live (verify_038_preapply.sql checks it). 037 is NOT re-run.
--
-- No shared runtime architecture: no table, column, function, trigger,
-- grant or policy is created or changed. Only Room 714 authored rows
-- (investigation_objects, investigation_challenges, evidence routing,
-- case_runtime_nodes, case_leads, case_runtime_rules) are written.
-- No new case fact: every text below restates existing canon (sql/005,
-- 019, 025) or REMOVES detail; lead labels are questions, never answers.
--
-- THE OPENING (≈15–25 min, 2+ players):
--   briefing (V-01, unchanged initial) → Room 714 → everyone NOTICES,
--   each specialization notices different things → private finds pulse
--   to the team → specialists TRANSFORM (device, records, lab, access log)
--   → material arrives in the Case File only once the find is SHARED
--   (team-known) → each specialist receives a PRIVATE insight lead they
--   may share → the scene report is filed when the team has documented
--   the room together → the chapter ends on open questions (whose blood,
--   who used the master key) that the next chapters answer.
--
-- 1. NOTICING IS FOR EVERYONE (capability, not content quantity).
--    Discovery interactions exist for field (the generalist) AND the
--    specialization that naturally notices that kind of thing:
--      GLASS_CUP / BLOOD_STAIN / OPEN_WINDOW  field · forensics
--      VICTIM_ITEMS / PASSPORT                field · records
--      LAPTOP / DOOR_714                      field · digital
--    Same label, distinct codes (the engine resolves an interaction by
--    code + spec). Transformations stay specialist-only.
-- 2. NO ARTIFICIAL SHARE LOCKS. requires_shared is removed from the
--    specialist steps that produce no material (sample collection, the
--    guest-file lookup): a specialist may work on their own private find.
--    Tools that PRODUCE material (the door-log query → D-02) keep 025's
--    engine rule — they run only on a find the team has on record.
--    Dependency comes from who can notice vs. who can transform, and from
--    material reaching the team record only when shared.
-- 3. MATERIAL IS PRODUCED BY PLAY, NOT HANDED AT START.
--      D-01 draft      ← LAPTOP DRAFT_RECOVERED (team-known)
--      R-01 guest file ← PASSPORT RECORDS_QUERIED (team-known)
--      F-02 lab result ← BLOOD_STAIN ANALYZED (team-known)
--      F-01 scene report ← the team has documented the room (all shared)
--    These become runtime-only (requires = {@RUNTIME}, not initial): only
--    the world delivers them (037 _runtime_try_deliver, 035 readability).
--    V-01 (missing-person report) stays the initial briefing material.
-- 4. THE SPECIALIST'S RESULT IS THEIRS TO TELL. The object's state text
--    for a finished transformation no longer repeats the restricted
--    material (it says a result exists and is in the Case File). Under
--    Room 714's title policy only the owning specialization reads the
--    material — the team learns it by talking (or by the private insight
--    lead the specialist chooses to share).
-- 5. CHAPTER BOUNDARY (no M1, no RAMI_FOUND/RAMI_DIED, no F-04/F-07, no
--    hotel-systems chapter): every Room 714 item outside the opening
--    becomes runtime-only with NO rule delivering it yet — notably F-03
--    (HOLD), F-04 / F-07 (RAMI_FOUND / RAMI_DIED milestones), F-06 / R-03
--    (M1 / MAP_EXPANDED), the statements, CCTV and finance/registry
--    records. The legacy unlock path can no longer reach any of them;
--    only V-01 (briefing) and D-02 (the door-log tool) keep their routes.
--    SECURITY_OFFICE becomes a GATED place (no rule reveals it in 038):
--    the CCTV archive belongs to the hotel-systems chapter (RESET-3).
--    Sessions that already seeded it keep their rows (037 semantics).
-- ============================================================

begin;

-- Re-apply safety: 037 guards refuse edits under APPROVED rules. Draft
-- this case's rules first; every 038 rule is re-approved at the end
-- (the 037 validator re-checks each one).
update public.case_runtime_rules set status = 'draft'
where case_id = 'room-714' and status = 'approved' and rule_id like 'R714\_%';

-- ============================================================
-- 1–2. OBJECTS: noticing for everyone; no artificial share locks;
--      finished-transformation texts point to the Case File.
-- ============================================================
update public.investigation_objects
set interactions = '[
  {"code":"INSPECT","label":"عاين","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0},
  {"code":"INSPECT_FORENSICS","label":"عاين","spec":"forensics","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0}
]'::jsonb
where case_id = 'room-714' and code = 'GLASS_CUP';

update public.investigation_objects
set interactions = '[
  {"code":"INSPECT_CLOSE","label":"افحص عن قرب","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0},
  {"code":"INSPECT_CLOSE_FORENSICS","label":"افحص عن قرب","spec":"forensics","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0},
  {"code":"COLLECT_SAMPLE","label":"اجمع عينة","spec":"forensics","requires_state":"DISCOVERED","produces_state":"SAMPLE_COLLECTED","processing_seconds":0},
  {"code":"REQUEST_LAB","label":"اطلب تحليل مخبري","spec":"forensics","requires_state":"SAMPLE_COLLECTED","produces_state":"PROCESSING","processing_seconds":150}
]'::jsonb,
    state_descriptions = state_descriptions
      || '{"ANALYZED": "وصلت نتيجة التحليل المخبري للعيّنة. التقرير الكامل محفوظ في ملف القضية."}'::jsonb
where case_id = 'room-714' and code = 'BLOOD_STAIN';

update public.investigation_objects
set interactions = '[
  {"code":"INSPECT","label":"عاين","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0},
  {"code":"INSPECT_FORENSICS","label":"عاين","spec":"forensics","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0}
]'::jsonb
where case_id = 'room-714' and code = 'OPEN_WINDOW';

update public.investigation_objects
set interactions = '[
  {"code":"INSPECT","label":"عاين","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0},
  {"code":"INSPECT_RECORDS","label":"عاين","spec":"records","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0}
]'::jsonb
where case_id = 'room-714' and code = 'VICTIM_ITEMS';

update public.investigation_objects
set interactions = '[
  {"code":"INSPECT","label":"افحص جواز السفر","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0},
  {"code":"INSPECT_RECORDS","label":"افحص جواز السفر","spec":"records","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0}
]'::jsonb,
    state_descriptions = state_descriptions
      || '{"RECORDS_QUERIED": "وصل ملف النزيل من سجلات الفندق. نصّه محفوظ في ملف القضية."}'::jsonb
where case_id = 'room-714' and code = 'PASSPORT';

update public.investigation_objects
set interactions = '[
  {"code":"INSPECT","label":"عاين سطحياً","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0},
  {"code":"INSPECT_DIGITAL","label":"عاين سطحياً","spec":"digital","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0},
  {"code":"INSPECT_DEVICE","label":"افحص الجهاز تقنياً","spec":"digital","requires_state":"DISCOVERED","produces_state":"INSPECTED","processing_seconds":0},
  {"code":"RECOVER_DRAFT","label":"استخرج آخر نشاط","spec":"digital","requires_state":"INSPECTED","produces_state":"DRAFT_RECOVERED","processing_seconds":0}
]'::jsonb,
    state_descriptions = state_descriptions
      || '{"DRAFT_RECOVERED": "استُخرج آخر ما كُتب على الجهاز: مسودة رسالة لم تُرسل. نصّها محفوظ في ملف القضية."}'::jsonb
where case_id = 'room-714' and code = 'LAPTOP';

update public.investigation_objects
set interactions = '[
  {"code":"INSPECT","label":"افحص الباب","spec":"field","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0},
  {"code":"INSPECT_DIGITAL","label":"افحص الباب","spec":"digital","requires_state":"UNKNOWN","produces_state":"DISCOVERED","processing_seconds":0}
]'::jsonb
where case_id = 'room-714' and code = 'DOOR_714';

-- The hotel-systems chapter (RESET-3) opens the security office; 038 only gates it.
update public.investigation_objects
set gated = true
where case_id = 'room-714' and code = 'SECURITY_OFFICE';

update public.investigation_challenges
set requires_shared = false
where case_id = 'room-714' and code = 'GUEST_FILE_LOOKUP';

-- ============================================================
-- 3. MATERIAL PRODUCED BY PLAY (runtime-only, not initial)
-- 5. CHAPTER BOUNDARY (runtime-only, no rule delivers them yet)
-- ============================================================
update public.evidence
set is_initial = false, requires = '{@RUNTIME}'
where case_id = 'room-714'
  and code in ('D-01', 'R-01', 'F-01', 'F-02',          -- produced by play (rules below)
               'F-03', 'F-04', 'F-06', 'F-07', 'R-03'); -- held behind later chapters

-- Everything else outside the opening is held too: the legacy unlock path
-- (unlock_evidence / unlockable_evidence, callable directly even with the
-- archive tab retired) must not hand out later-chapter material. Later
-- chapters deliver these through runtime rules. Kept on their existing
-- routes: V-01 (the briefing) and D-02 (the opening's door-log tool).
update public.evidence
set is_initial = false, requires = '{@RUNTIME}'
where case_id = 'room-714'
  and code not in ('V-01', 'D-01', 'R-01', 'F-01', 'F-02', 'D-02',
                   'F-03', 'F-04', 'F-06', 'F-07', 'R-03');

-- ============================================================
-- PULSE: coarse category per noticeable thing (never what, never why)
-- ============================================================
delete from public.case_runtime_nodes where case_id = 'room-714';
insert into public.case_runtime_nodes (case_id, node_kind, node_code, pulse_category) values
('room-714', 'object', 'GLASS_CUP',    'PHYSICAL_TRACE'),
('room-714', 'object', 'BLOOD_STAIN',  'PHYSICAL_TRACE'),
('room-714', 'object', 'OPEN_WINDOW',  'PLACE'),
('room-714', 'object', 'VICTIM_ITEMS', 'PERSON'),
('room-714', 'object', 'PASSPORT',     'PERSON'),
('room-714', 'object', 'LAPTOP',       'DEVICE'),
('room-714', 'object', 'DOOR_714',     'MOVEMENT');

-- ============================================================
-- LEADS — questions worth following, never answers.
--   L714_ROOM   team: the opening direction (the room's own KNOWN text)
--   the others are PRIVATE insights for the specialist who can read the
--   material behind them. Their label says only THAT the material raises
--   a question — never the fact itself: sharing a lead tells the team a
--   question exists; the answer has to be spoken by its reader.
-- ============================================================
insert into public.case_leads (case_id, lead_code, label, pulse_category, sort_order) values
('room-714', 'L714_ROOM',       'رامي مفقود، وأغراضه الشخصية ما زالت في غرفته. ماذا تقول الغرفة؟', null, 10),
('room-714', 'L714_DRAFT',      'المسودة التي لم تُرسل تطرح سؤالاً عن تلك الليلة. ماذا حدث بعد آخر تعديل عليها؟', 'TIME', 20),
('room-714', 'L714_GUEST',      'ملف النزيل يقول لماذا كان رامي في الفندق. من كان حوله تلك الليلة؟', 'PERSON', 30),
('room-714', 'L714_BLOOD',      'تقرير المختبر يطرح سؤالاً عن صاحب الأثر قرب الكأس.', 'PERSON', 40),
('room-714', 'L714_MASTER_KEY', 'سجل فتح الباب يطرح سؤالاً عمّن دخل الغرفة تلك الليلة.', 'MOVEMENT', 50)
on conflict (case_id, lead_code) do update
  set label = excluded.label, pulse_category = excluded.pulse_category, sort_order = excluded.sort_order;

-- ============================================================
-- RULES (the only live rule source). All validated by 037 on approval.
-- ============================================================
insert into public.case_runtime_rules (case_id, rule_id, status, scope, conditions, effects, sort_order, note) values
-- the opening direction exists from the first moment (team, no progress needed)
('room-714', 'R714_OPEN_ROOM', 'approved', 'team',
 '[{"kind":"object_state","object":"ROOM_714","states":["KNOWN"]}]',
 '[{"kind":"open_lead","lead":"L714_ROOM"}]', 10,
 'RESET-2: the room is the first direction.'),

-- material arrives when the transformed find is TEAM-KNOWN (shared)
('room-714', 'R714_DELIVER_DRAFT', 'approved', 'team',
 '[{"kind":"object_state","object":"LAPTOP","states":["DRAFT_RECOVERED"]}]',
 '[{"kind":"deliver_evidence","evidence":"D-01"}]', 20,
 'Device workspace → D-01 (digital).'),
('room-714', 'R714_DELIVER_GUEST', 'approved', 'team',
 '[{"kind":"object_state","object":"PASSPORT","states":["RECORDS_QUERIED"]}]',
 '[{"kind":"deliver_evidence","evidence":"R-01"}]', 21,
 'Guest-file lookup → R-01 (records).'),
('room-714', 'R714_DELIVER_LAB', 'approved', 'team',
 '[{"kind":"object_state","object":"BLOOD_STAIN","states":["ANALYZED"]}]',
 '[{"kind":"deliver_evidence","evidence":"F-02"}]', 22,
 'Lab result → F-02 (forensics).'),

-- the scene report is filed when the team has documented the room together
('room-714', 'R714_SCENE_DOCUMENTED', 'approved', 'team',
 '[{"kind":"object_discovered","object":"GLASS_CUP"},{"kind":"object_discovered","object":"BLOOD_STAIN"},
   {"kind":"object_discovered","object":"OPEN_WINDOW"},{"kind":"object_discovered","object":"VICTIM_ITEMS"},
   {"kind":"object_discovered","object":"PASSPORT"},{"kind":"object_discovered","object":"LAPTOP"}]',
 '[{"kind":"deliver_evidence","evidence":"F-01"},{"kind":"close_lead","lead":"L714_ROOM"}]', 30,
 'Every item F-01 lists, shared by the team → F-01 (forensics); the room direction closes.'),

-- private insights for the specialist who can READ the material (037: actor view)
('room-714', 'R714_INSIGHT_DRAFT', 'approved', 'actor',
 '[{"kind":"evidence_unlocked","evidence":"D-01"}]',
 '[{"kind":"open_lead","lead":"L714_DRAFT"}]', 40, null),
('room-714', 'R714_INSIGHT_GUEST', 'approved', 'actor',
 '[{"kind":"evidence_unlocked","evidence":"R-01"}]',
 '[{"kind":"open_lead","lead":"L714_GUEST"}]', 41, null),
('room-714', 'R714_INSIGHT_LAB', 'approved', 'actor',
 '[{"kind":"evidence_unlocked","evidence":"F-02"}]',
 '[{"kind":"open_lead","lead":"L714_BLOOD"}]', 42, null),
('room-714', 'R714_INSIGHT_ACCESS', 'approved', 'actor',
 '[{"kind":"evidence_unlocked","evidence":"D-02"}]',
 '[{"kind":"open_lead","lead":"L714_MASTER_KEY"}]', 43, null),

-- the draft's question is FOLLOWED once the door log has been pulled
-- (private lead: by its holder; shared lead: by the team)
('room-714', 'R714_FOLLOW_DRAFT_PRIVATE', 'approved', 'actor',
 '[{"kind":"lead","lead":"L714_DRAFT","status":"open"},{"kind":"evidence_unlocked","evidence":"D-02"},
   {"kind":"object_state","object":"LAPTOP","states":["DRAFT_RECOVERED"]}]',
 '[{"kind":"follow_lead","lead":"L714_DRAFT"}]', 50, null),
('room-714', 'R714_FOLLOW_DRAFT_TEAM', 'approved', 'team',
 '[{"kind":"lead","lead":"L714_DRAFT","status":"open"},{"kind":"evidence_unlocked","evidence":"D-02"},
   {"kind":"object_state","object":"LAPTOP","states":["DRAFT_RECOVERED"]}]',
 '[{"kind":"follow_lead","lead":"L714_DRAFT"}]', 51, null)
on conflict (case_id, rule_id) do update
  set status = excluded.status, scope = excluded.scope, conditions = excluded.conditions,
      effects = excluded.effects, sort_order = excluded.sort_order, note = excluded.note;

commit;
