-- ============================================================
-- IFADA — 036_scene17_vertical_slice_DEV.sql
--
-- STATUS: WRITTEN FOR REVIEW — NOT APPLIED.
-- DEVELOPMENT SCENE 17 VERTICAL SLICE — DATA + ONE GENERIC NULLABILITY RELAXATION
-- + ONE PRIVACY HARDENING (open_case). No policies, no new functions/tables;
-- §0 is the only table DDL, §0b the only function body.
-- Run manually in the Supabase SQL Editor only after Hazem approves:
--   BEFORE: sql/verify_036_preapply.sql  (every non-INFO row pass = true, else STOP)
--   AFTER:  sql/verify_036_postapply.sql (every non-INFO row pass = true)
-- Requires 035 (live). Scene 17 stays status = 'development' (case contract).
--
-- WHAT THIS DOES — and nothing else:
--   0. evidence.owner_spec: DROP NOT NULL (generic; see "owner_spec" below)
--   0b. open_case: same signature/return type/grants; returns ONLY the caller-
--       visible initial count (the 004 body returned the inserted-row count,
--       which counted hidden channel rows and revealed who opened first)
--   1. engine policy  scene-17 = channels + hidden          (035 model)
--   2. channel catalogue A–H                                 (04-…Distribution, the 2-player plan uses all eight)
--   3. the 2-player seat plan only: seat 1 = A C E H, seat 2 = B D F G
--      (3–4 player starts fail closed: CHANNEL_PLAN_MISSING)
--   4. four chapter-1 evidence rows that passed the canon gate:
--        E05 قائمة المشتبهين            shared lane (no channel row)
--        E06 صفحة التدريب الأصلية للمشهد  channel A
--        E07 الصفحة الموجودة داخل ملف سلمى channel A
--        E10 سجل أحداث نظام الصوت        channel B   (replaces E31 — see the 036 review)
--   5. their evidence → channel rows (E05 has none: shared lane)
-- Bodies are transcriptions of the approved assets (page furniture and the
-- generic "fictional document" footer omitted). media_path stays NULL: the
-- files reach Storage only through scripts/upload-content.mjs (scene-17
-- mappings), a separate approved step. E10 is a text log: its body IS the
-- evidence, no media file.
-- owner_spec: NULL on all four rows. CHANNEL controls distribution;
-- SPECIALIZATION controls capability. owner_spec is a capability owner, read
-- ONLY by the 'specialization' distribution (Room 714). Scene 17 canon
-- assigns no capability owner to these items, so none is invented (004 made
-- the column NOT NULL only because every case was spec-distributed then).
-- NULL is fail-closed everywhere: has_specialization(s, NULL) is false, so a
-- NULL row in a spec-distributed case is unreadable for everyone; under
-- channels (035) owner_spec is never read. The UI shows no specialization
-- line for a NULL owner. Room 714 rows are untouched (all keep their owner;
-- verify_036_postapply R6/V11).
--
-- NOT SEEDED: other Scene 17 evidence, objects, challenges, characters,
-- timeline, connection rules (032 / S17 drafts), 030 entities, Room 714 data.
-- Idempotent: every insert is ON CONFLICT DO NOTHING, and a guard refuses
-- to run over any other Scene 17 content.
-- ============================================================

-- Guard: only ever on an otherwise-empty Scene 17 (never mixed into a full seed).
do $$
begin
  if not exists (select 1 from public.cases where id = 'scene-17') then
    raise exception 'SCENE17_CASE_MISSING';
  end if;
  if exists (select 1 from public.evidence
             where case_id = 'scene-17' and code not in ('E05', 'E06', 'E07', 'E10')) then
    raise exception 'SCENE17_NOT_EMPTY';
  end if;
  if exists (select 1 from public.case_engine_policy
             where case_id = 'scene-17' and (distribution <> 'channels' or restricted_evidence <> 'hidden')) then
    raise exception 'SCENE17_POLICY_CONFLICT';
  end if;
end $$;

-- 0. owner_spec nullable (generic, non-destructive, idempotent: a no-op if
--    already nullable; no row changes). Needs table ownership (pre-apply P5a).
--    The ALTER takes a brief ACCESS EXCLUSIVE lock on evidence (metadata only,
--    no rewrite): never queue behind a long reader and stall live evidence_index.
--    Run in the SQL Editor (one transaction: a failed guard stops everything).
set lock_timeout = '5s';
alter table public.evidence alter column owner_spec drop not null;
comment on column public.evidence.owner_spec is
  'Capability owner (specialization). Read only when the case distribution is specialization. NULL = no capability owner (fail closed). Never a channel authorization source.';

-- 0b. open_case privacy hardening (generic — every case). 004 returned the
--     number of rows THIS call inserted: under channels + hidden that counts a
--     teammate's private initial rows (first opener of the slice got 4 while
--     seeing 3 or 2) and its 0-vs-N reveals whether a teammate opened first.
--     Now: the insert is verbatim 004; the result is the number of initial rows
--     the CALLER can see (035 _evidence_row_visible) — exactly what
--     evidence_index already returns them, independent of call order.
--     Room 714 (title policy): every row is visible → the full initial count;
--     the only client caller (CaseWorkspace) ignores the value. Same signature
--     and return type → create or replace keeps the 004 grants (re-stated).
create or replace function public.open_case(p_session uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case    text;
  v_visible integer;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;

  insert into public.session_evidence (session_id, evidence_id, unlocked_by)
  select p_session, e.id, null
  from public.evidence e
  where e.case_id = v_case and e.is_initial
  on conflict do nothing;

  select count(*)::integer into v_visible
  from public.session_evidence se
  join public.evidence e on e.id = se.evidence_id
  where se.session_id = p_session
    and e.case_id = v_case
    and e.is_initial
    and public._evidence_row_visible(p_session, e.id);

  return v_visible;
end;
$$;

revoke all on function public.open_case(uuid) from public, anon;
grant execute on function public.open_case(uuid) to authenticated;

-- 1. Engine policy (mirror of src/cases/scene-17/contract.ts)
insert into public.case_engine_policy (case_id, restricted_evidence, distribution)
values ('scene-17', 'hidden', 'channels')
on conflict (case_id) do nothing;

-- 2. Channel catalogue
insert into public.case_channels (case_id, channel_id)
select 'scene-17', c
from unnest(array['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) c
on conflict do nothing;

-- 3. 2-player seat plan (04-Scene-17-Multiplayer-Distribution: لاعبان)
insert into public.case_channel_seats (case_id, players, seat, channel_id)
values
  ('scene-17', 2, 1, 'A'), ('scene-17', 2, 1, 'C'), ('scene-17', 2, 1, 'E'), ('scene-17', 2, 1, 'H'),
  ('scene-17', 2, 2, 'B'), ('scene-17', 2, 2, 'D'), ('scene-17', 2, 2, 'F'), ('scene-17', 2, 2, 'G')
on conflict do nothing;

-- 4. Slice evidence (chapter 1, all initially unlocked for the session)
insert into public.evidence
  (case_id, code, title, kind, owner_spec, clock_label, is_initial, requires, sort_order, body)
values
('scene-17', 'E05', 'قائمة المشتبهين', 'document', null, null, true, '{}', 5,
$e05$قائمة المشتبهين — الإفادات الأولى
الفصل الأول: ما حدث فوق الخشبة
افتحوا مسارات التحقيق الستة — لا تعتبروا الإفادة حقيقة مثبتة.

01 — كمال مراد
مخرج المسرحية والمنتج الفني | 52 سنة
العلاقة بالضحية: شريك يزن الفني منذ ثماني سنوات والمسؤول النهائي عن أي تعديل طارئ.
الإفادة الأولى: «كنت داخل غرفة الإخراج طوال المشهد 17. أعطيتهم تعليمات واضحة عبر السماعات: نفذوا النسخة الجديدة. لم أعرف أن يزن أخذ مكان نادر.»
المكان المزعوم: غرفة الإخراج طوال المشهد 17.
سبب الاشتباه الظاهر: إعلان يزن كان قد يوقف عقد الفيلم ويضر بسمعته.
مسار التحقيق: هل سماع صوته يثبت أنه كان داخل غرفة الإخراج؟

02 — رنا شهاب
مديرة الخشبة | 36 سنة
العلاقة بالضحية: تنظم تحركات يزن أثناء العرض، وهي أخت ليلى شهاب التي ماتت داخل المسرح.
الإفادة الأولى: «كنت عند الجناح الأيسر أتابع دخول الممثلين والإشارات. لم أعدل المشهد 17، ولم أعرف أن يزن موجود تحت القناع.»
المكان المزعوم: الجناح الأيسر للخشبة بين 22:42 و22:49.
سبب الاشتباه الظاهر: كانت تعتقد أن يزن يعرف أكثر مما قاله عن وفاة أختها.
مسار التحقيق: هل كانت تعرف مسبقا سبب ظهور يزن تحت القناع؟

03 — سلمى ناصر
بطلة العرض | 31 سنة
العلاقة بالضحية: البطلة الرئيسية في أعمال يزن خلال السنوات الثلاث الأخيرة.
الإفادة الأولى: «كنت أعتقد أن نادر تحت القناع وأن السكين مسرحية. الصفحة الجديدة طلبت مني الاقتراب وإكمال الحركة حتى التلامس.»
المكان المزعوم: فوق الخشبة أمام الجمهور وقت الطعنة.
سبب الاشتباه الظاهر: هي التي أمسكت السكين ونفذت الحركة باتجاه منتصف الصدر.
مسار التحقيق: هل كانت الحركة التي تسلمتها جزءا آمنا من العرض؟

04 — نادر حجازي
ممثل الشخصية المقنعة | 29 سنة
العلاقة بالضحية: كان يفترض أن يقف تحت القناع ويتلقى الحركة الوهمية في المشهد 17.
الإفادة الأولى: «طلب مني شخص مجهول الحضور إلى غرفة الأزياء. أغلق الباب علي وأخذ أحدهم القناع والزي. لم أعرف أن يزن أخذ مكاني.»
المكان المزعوم: يدعي أنه كان محتجزا في غرفة الأزياء.
سبب الاشتباه الظاهر: هو صاحب القناع، ولا توجد آثار كسر أو احتجاز على الباب.
مسار التحقيق: من أخذ القناع والزي، ولماذا اختفى نادر؟

05 — طارق المصري
مهندس الصوت الرئيسي | 41 سنة
العلاقة بالضحية: مسؤول عن تسجيل العرض وتشغيل سماعات الكواليس وإشارة BELL-17.
الإفادة الأولى: «كنت داخل غرفة الصوت طوال المشهد. سمعت كمال يقول: نفذوا النسخة الجديدة. لا أعرف لماذا لم تعمل BELL-17، ولم أعدل التسجيل.»
المكان المزعوم: غرفة الصوت أمام لوحة التحكم وقت الطعنة.
سبب الاشتباه الظاهر: الأمر الصوتي والإشارة المعطلة خرجا من النظام الذي يديره.
مسار التحقيق: لماذا تعطلت BELL-17 في اللحظة الحاسمة؟

06 — جود عارف
مسؤولة الإكسسوارات المسرحية | 27 سنة
العلاقة بالضحية: المسؤولة عن تجهيز وفحص الأدوات المستخدمة في عروض يزن.
الإفادة الأولى: «فحصت السكين المسرحية بنفسي وكانت آلية الشفرة تعمل. وضعتها فوق الطاولة، ولم يلمسها أحد بعد ذلك حسب علمي.»
المكان المزعوم: الجناح الأيمن للخشبة أثناء تجهيز الأدوات.
سبب الاشتباه الظاهر: وقعت سجل السلامة وكانت آخر مسؤولة تعاملت مع السكين.
مسار التحقيق: هل فحصت السكين المستخدمة فعلا قبل المشهد؟$e05$),

('scene-17', 'E06', 'صفحة التدريب الأصلية للمشهد', 'document', null, null, true, '{}', 6,
$e06$المشهد 17 — صفحة التدريب الأصلية
نسخة الممثلين — تعليمات الحركة والسلامة
الشخصيات: سلمى / الشخصية المقنعة
الموقع: منتصف الخشبة — علامة X
النسخة: REHEARSAL

[تفتح الإضاءة على الشخصية المقنعة واقفة فوق علامة X.]
المقنع: وصلت متأخرة.
سلمى: كنت أبحث عن الحقيقة، لا عنك.

تعليمات الحركة
1. تتوقف سلمى على بعد ثلاث خطوات من الشخصية المقنعة.
2. تنفذ حركة وهمية بالسكين باتجاه الكتف الأيسر.
3. ممنوع التلامس الجسدي — تحفظ مسافة الأمان. لا تلامس!
[تبقى الشخصية المقنعة واقفة ولا تبدأ السقوط مع حركة السكين.]

CUE BELL-17 — إشارة السقوط
[عند سماع BELL-17 فقط، يسقط المقنع إلى الخلف.]
[تطفأ الإضاءة بعد اكتمال السقوط، ثم تغلق الستارة.]

ملاحظة السلامة: لا تنفذ الحركة إذا لم يسمع الممثلان إشارة BELL-17 بوضوح.
PAGE 17 / 24 — ORIGINAL REHEARSAL COPY — SC17-2217$e06$),

('scene-17', 'E07', 'الصفحة الموجودة داخل ملف سلمى', 'document', null, null, true, '{}', 7,
$e07$مسرح أورفيوس — نسخة العرض (Performance Copy)
المشهد 17 — الصفحة الموجودة داخل ملف سلمى
تعليمات الحركة
الشخصيات: سلمى / الشخصية المقنعة
الموقع: منتصف الخشبة - علامة X
النسخة: PERFORMANCE

[تفتح الإضاءة على الشخصية المقنعة واقفة فوق علامة X.]
المقنع: وصلت متأخرة.
سلمى: كنت أبحث عن الحقيقة، لا عنك.

تعليمات الحركة
1. تقترب سلمى ثلاث خطوات حتى تصبح أمام الشخصية المقنعة.
2. توجه الضربة إلى منتصف الصدر.
3. تستمر بالحركة حتى يحدث التلامس.

[لا يتوقف الأداء عند اقتراب السكين.]
[تسقط الشخصية المقنعة بعد اكتمال الحركة.]
[تطفأ الإضاءة فور السقوط، ثم تغلق الستارة.]

ملاحظات بخط اليد على الصفحة:
- «كن أكثر واقعية في نبرة الصوت.» — K.M.
- «لا تغيير هنا.»
- «مراجعة مع الإضاءة والصوت.»
- ورقة لاصقة: «التأكيد على تعبير الوجه قبل الطعنة.»
PAGE 17 / 24 — SC17-2217$e07$),

('scene-17', 'E10', 'سجل أحداث نظام الصوت', 'record', null, '22:46:52', true, '{}', 10,
$e10$سجل أحداث نظام الصوت — المشهد 17
الفترة المسجلة: 22:46:30 - 22:47:30
الترتيب: حسب ساعة النظام

22:46:31.084  [النظام]   بدأ تشغيل المشهد 17.
22:46:38.412  [السماعات] فُتحت قناة الاتصال مع الكواليس.
22:46:44.006  [الإشارة]  أصبحت BELL-17 جاهزة وتنتظر التنفيذ.
22:46:52.000  [تشغيل]    بدأ تشغيل ملف صوتي غير مسمى [UNNAMED] عبر سماعات الكواليس.
22:46:54.871  [تشغيل]    انتهى الملف الصوتي بنجاح.
22:47:04.517  [الإشارة]  ما تزال BELL-17 جاهزة وتنتظر التنفيذ.
22:47:24.550  [النظام]   انتهى المشهد 17 وأُغلق تسلسل الصوت.
22:47:24.551  [تحذير]    لم يُعثر على أي أمر تنفيذ للإشارة BELL-17.$e10$)
on conflict (case_id, code) do nothing;

-- 5. Evidence → channel (E05: shared lane — deliberately NO row)
insert into public.case_evidence_channels (evidence_id, case_id, channel_id)
select e.id, 'scene-17', m.channel
from (values ('E06', 'A'), ('E07', 'A'), ('E10', 'B')) m(code, channel)
join public.evidence e on e.case_id = 'scene-17' and e.code = m.code
on conflict (evidence_id) do nothing;
