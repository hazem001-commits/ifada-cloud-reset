-- ============================================================
-- IFADA — 007_seed_timeline_room714.sql
-- بيانات محرك الاتساق لقضية غرفة 714.
--
-- ملاحظة: القيم بوحدة "دقائق منذ منتصف الليل الفلكي لبداية اليوم"،
-- حيث 22:00 = 1320، 23:00 = 1380، 00:00 = 1440، 00:30 = 1470.
-- هيك ما في مشكلة عبور منتصف الليل.
-- ============================================================

delete from public.travel_matrix   where case_id = 'room-714';
delete from public.timeline_facts  where case_id = 'room-714';
delete from public.timeline_people where case_id = 'room-714';
delete from public.locations       where case_id = 'room-714';

-- ------------------------------------------------------------
-- الأماكن
-- ------------------------------------------------------------
insert into public.locations (case_id, code, name) values
  ('room-714', 'ROOM_714',         'الغرفة 714'),
  ('room-714', 'HALL_7',           'ممر الطابق السابع'),
  ('room-714', 'SERVICE_ELEVATOR', 'المصعد الخدمي'),
  ('room-714', 'M1',               'مستوى الخدمات M1'),
  ('room-714', 'SECURITY_OFFICE',  'مكتب الأمن'),
  ('room-714', 'LOBBY',            'اللوبي'),
  ('room-714', 'PARKING',          'موقف السيارات');

-- ------------------------------------------------------------
-- مصفوفة التنقل (بالدقائق) — متماثلة
-- ------------------------------------------------------------
insert into public.travel_matrix (case_id, location_a, location_b, minutes) values
  ('room-714','ROOM_714','HALL_7',1),
  ('room-714','ROOM_714','SERVICE_ELEVATOR',2),
  ('room-714','ROOM_714','M1',3),
  ('room-714','ROOM_714','SECURITY_OFFICE',4),
  ('room-714','ROOM_714','LOBBY',5),
  ('room-714','ROOM_714','PARKING',7),

  ('room-714','HALL_7','SERVICE_ELEVATOR',1),
  ('room-714','HALL_7','M1',2),
  ('room-714','HALL_7','SECURITY_OFFICE',3),
  ('room-714','HALL_7','LOBBY',4),
  ('room-714','HALL_7','PARKING',6),

  ('room-714','SERVICE_ELEVATOR','M1',1),
  ('room-714','SERVICE_ELEVATOR','SECURITY_OFFICE',2),
  ('room-714','SERVICE_ELEVATOR','LOBBY',2),
  ('room-714','SERVICE_ELEVATOR','PARKING',4),

  ('room-714','M1','SECURITY_OFFICE',3),
  ('room-714','M1','LOBBY',3),
  ('room-714','M1','PARKING',5),

  ('room-714','SECURITY_OFFICE','LOBBY',2),
  ('room-714','SECURITY_OFFICE','PARKING',4),

  ('room-714','LOBBY','PARKING',2);

-- ------------------------------------------------------------
-- الأشخاص
-- ------------------------------------------------------------
insert into public.timeline_people (case_id, code, name) values
  ('room-714', 'RAMI',   'رامي الخطيب'),
  ('room-714', 'SARA',   'سارة منصور'),
  ('room-714', 'KAREEM', 'كريم'),
  ('room-714', 'NABIL',  'نبيل ملكاوي'),
  ('room-714', 'YARA',   'يارا ناصر'),
  ('room-714', 'ADAM',   'آدم (الصيانة)');

-- ------------------------------------------------------------
-- الحقائق المثبّتة (canon) — 1380=23:00, 1440=00:00
-- ------------------------------------------------------------
insert into public.timeline_facts
  (case_id, person_code, location_code, start_ck, end_ck, evidence_code)
values
  -- رامي يدخل الغرفة 714 ببطاقته 23:43، وتُفتح مرة ثانية بمفتاح الموظفين 00:06
  ('room-714', 'RAMI', 'ROOM_714', 1423, 1446, 'D-02'),

  -- كريم مع رامي قرب الممر/المصعد الخدمي 23:54 (V-03)
  ('room-714', 'KAREEM', 'HALL_7', 1433, 1435, 'V-03'),

  -- كريم يسجّل دخول لنظام الأمن يدوياً 00:03
  ('room-714', 'KAREEM', 'SECURITY_OFFICE', 1443, 1444, 'D-04'),

  -- استخدام جهاز خدمات غير معرّف من نفس المنطقة 00:21 (يُنسب لكريم لاحقاً)
  ('room-714', 'KAREEM', 'SECURITY_OFFICE', 1461, 1462, 'D-04'),

  -- نبيل يدخل عبر المصعد الخدمي 00:08
  ('room-714', 'NABIL', 'SERVICE_ELEVATOR', 1448, 1449, 'V-08'),

  -- نبيل يغادر بسيارته 00:32
  ('room-714', 'NABIL', 'PARKING', 1472, 1473, 'V-09'),

  -- يارا تتصل بشبكة الموظفين (منطقة اللوبي/الخدمة) 00:11
  ('room-714', 'YARA', 'LOBBY', 1451, 1452, 'D-07');

-- ملاحظة: عمداً لا يوجد fact لموقع "سارة" داخل M1 أو خارج الغرفة —
-- هذا بالضبط ما يفترض بالفريق يكتشفوه عبر النظرية والاستجواب،
-- لا عبر حقيقة جاهزة.
