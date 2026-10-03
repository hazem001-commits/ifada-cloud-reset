-- ============================================================
-- IFADA — 032_room714_connection_rules_DRAFT.sql   (CASE DATA — Room 714)
--
-- STATUS: REVIEW-ONLY DRAFT — NOT APPLIED. Authored rule DATA for the
-- live 027 engine. Requires Hazem's approval of every rule below.
-- Revision 2 (canon proof, 2026-10-01): every meaning was re-derived
-- clause by clause from the live text of its two nodes. Revision 1's
-- meanings were NOT approvable (they asserted Rami's injury — a held F-04
-- fact; Rami's personal ownership of N17; and that Rami performed the copy).
--
-- Two-step gate:
--   STEP 1 inserts the rules as status 'draft' (inert — every proposal
--          still answers not_established). Safe after 027.
--   STEP 2 (commented) approves AND marks team_safe. Requires 033 (which
--          adds team_safe and forbids approving a rule that is not
--          team-safe). Meanings are shown to the whole team.
--
-- Selection rules: live Room 714 evidence only; no HOLD node (D-02 D-06
-- D-07 F-03 F-04 F-07 R-02 R-06 R-07 R-09 V-02 V-04 V-05 V-06 V-09
-- GLASS_CUP OPEN_WINDOW); no fact from another item, a held item, a future
-- result, a hidden character fact or the solution; meaning only.
-- Mirror for tests: src/server/cases/room-714/connections.ts (draft).
--
-- HAZEM DECISIONS (2026-10-01 — recorded only; nothing seeded or approved):
--   R714_N17_PAYMENTS        APPROVED IN PRINCIPLE AS TEAM-SAFE
--                            (do not seed yet; do not uncomment STEP 2 yet)
--   R714_COPY_AFTER_MESSAGE  APPROVED IN PRINCIPLE AS TEAM-SAFE
--                            (do not seed yet; do not uncomment STEP 2 yet)
--   R714_NO_VICTIM_BLOOD     NOT APPROVED as a main authored connection; stays
--                            draft/inert. Possible future tutorial /
--                            introductory validation only. Excluded from any
--                            bulk approval unless Hazem explicitly approves it.
--   => STEP 2 lists only the two approved-in-principle rule IDs.
-- ============================================================

-- STEP 1 — insert as DRAFT (inert)
insert into public.case_connection_rules
  (case_id, rule_id, requires, relation, allow_extra, meaning, effects, status, sort_order)
values
  -- Forensics (F-01 + F-02). Avoids F-03 (held): no identity, no sex, no
  -- glass-wound mechanism; avoids F-04 (held): no "injury" of Rami.
  ('room-714', 'R714_NO_VICTIM_BLOOD',
   '[{"kind":"evidence","id":"F-01"},{"kind":"evidence","id":"F-02"}]'::jsonb,
   null, 0,
   'لا أثر لدم رامي داخل الغرفة: بقعة الدم الوحيدة المسجّلة فيها ليست دمه.',
   '[]'::jsonb,
   'draft', 10),

  -- Records (R-04 + R-05). States the registered holder, not a person;
  -- avoids R-09 (held): no claim about the relationship between س.م and Rami.
  ('room-714', 'R714_N17_PAYMENTS',
   '[{"kind":"evidence","id":"R-04"},{"kind":"evidence","id":"R-05"}]'::jsonb,
   null, 0,
   'تحويلات حساب س. منصور تذهب إلى N17، و70% من حصص N17 مسجّلة باسم R. AL-KHATIB HOLDINGS، وحصة أخرى غير مباشرة فيها مرتبطة بحسابات RAK TECH.',
   '[]'::jsonb,
   'draft', 20),

  -- Digital (D-08 + D-05). Timing only; no actor for the copy, no claim
  -- that the copied file is "the video", nothing about the recipient or
  -- the file's content (D-06 held).
  ('room-714', 'R714_COPY_AFTER_MESSAGE',
   '[{"kind":"evidence","id":"D-08"},{"kind":"evidence","id":"D-05"}]'::jsonb,
   null, 0,
   'بعد ثماني عشرة دقيقة من رسالة «الفيديو عندي»، نُسخ الملف NOV_17_RAW.mp4 من جهاز رامي إلى ذاكرة خارجية.',
   '[]'::jsonb,
   'draft', 30)
on conflict (case_id, rule_id) do nothing;

-- STEP 2 — after 033 AND Hazem's final go-ahead (kept commented on purpose;
-- do NOT uncomment yet). Intended approval set = exactly the two rules
-- approved in principle as team-safe. R714_NO_VICTIM_BLOOD is deliberately
-- NOT in this list and stays 'draft' (tutorial candidate only) unless Hazem
-- separately approves it later — never add it to this bulk statement.
-- update public.case_connection_rules
-- set status = 'approved', team_safe = true
-- where case_id = 'room-714'
--   and rule_id in ('R714_N17_PAYMENTS', 'R714_COPY_AFTER_MESSAGE');

-- READ-ONLY checks after STEP 1:
--   select rule_id, status from public.case_connection_rules where case_id = 'room-714' order by sort_order;
--   select r.rule_id, n ->> 'id' as missing
--   from public.case_connection_rules r cross join lateral jsonb_array_elements(r.requires) n
--   where r.case_id = 'room-714' and n ->> 'kind' = 'evidence'
--     and not exists (select 1 from public.evidence e where e.case_id = r.case_id and e.code = upper(n ->> 'id'));
--   expect: 3 rows draft; no missing nodes.
