-- ============================================================
-- IFADA — 003_seed.sql
-- بيانات الكتالوج. شغّله بعد 002_rls.sql
-- ============================================================

insert into public.cases
  (id, title, victim_name, incident_date, classification,
   difficulty, duration_minutes, min_players, max_players,
   cover_path, price_cents, is_published)
values
  ('room-714', 'غرفة 714', 'رامي الخطيب', '2026-08-23',
   'MISSING PERSON', 4, 150, 2, 4,
   'covers/room-714.webp', 500, true),

  ('scene-17', 'المشهد 17', 'يزن الكيلاني', '2026-03-11',
   'HOMICIDE', 5, 165, 2, 4,
   'covers/scene-17.webp', 500, true)
on conflict (id) do update set
  title            = excluded.title,
  victim_name      = excluded.victim_name,
  incident_date    = excluded.incident_date,
  classification   = excluded.classification,
  difficulty       = excluded.difficulty,
  duration_minutes = excluded.duration_minutes,
  min_players      = excluded.min_players,
  max_players      = excluded.max_players,
  cover_path       = excluded.cover_path,
  price_cents      = excluded.price_cents,
  is_published     = excluded.is_published;


-- ============================================================
-- للتطوير فقط: منح قضية لحسابك بدون دفع.
-- شغّله يدوياً من SQL Editor بعد ما تسجّل حساب.
-- غيّر الإيميل لإيميلك.
-- ============================================================
-- insert into public.entitlements (user_id, case_id, source)
-- select id, 'room-714', 'grant' from auth.users where email = 'YOU@example.com'
-- on conflict do nothing;
--
-- insert into public.entitlements (user_id, case_id, source)
-- select id, 'scene-17', 'grant' from auth.users where email = 'YOU@example.com'
-- on conflict do nothing;
