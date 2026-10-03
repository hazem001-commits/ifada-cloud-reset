-- ============================================================
-- IFADA — 015_evidence_media_safe.sql
-- المتصفح ما لازم يوصله مسار Storage الداخلي إطلاقاً — evidence_index
-- كانت ترجع media_path كاملاً حتى لو الدليل مقروء. هذا يكشف تفصيل
-- تنفيذ داخلي (بنية الـ bucket / اسم الملف) رغم إن الـ bucket خاص.
--
-- هذا الملف يستبدل الحقل بـ has_media boolean فقط — يخبر الواجهة
-- "في وسائط" بدون كشف مسارها. القراءة الفعلية للمسار تصير حصراً
-- بـ /api/evidence-media بعد فحص صلاحية كامل بالسيرفر.
--
-- شكل الإرجاع تغيّر (media_path خرج، has_media دخل)، وPostgres ما
-- بيسمح بتغيير RETURNS TABLE عبر CREATE OR REPLACE — لازم DROP
-- صريح ثم CREATE من جديد، وإعادة GRANT execute بعدها.
--
-- مهم: هذا الملف يحافظ بالكامل على منطق التخصصات المتعددة
-- (2–8 لاعبين) من fix_multiplayer_specialization_access.sql عبر
-- has_specialization(...) — ما رجعنا لـ my_specialization(...)
-- القديمة أحادية التخصص.
-- ============================================================

drop function if exists public.evidence_index(uuid);

create function public.evidence_index(
  p_session uuid
)
returns table (
  code         text,
  title        text,
  kind         evidence_kind,
  owner_spec   specialization,
  clock_label  text,
  body         text,
  has_media    boolean,
  readable     boolean,
  unlocked_at  timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  return query
  select
    e.code,
    e.title,
    e.kind,
    e.owner_spec,
    e.clock_label,

    case
      when public.has_specialization(p_session, e.owner_spec)
      then e.body
      else null
    end,

    case
      when public.has_specialization(p_session, e.owner_spec)
      then (e.media_path is not null)
      else false
    end,

    public.has_specialization(p_session, e.owner_spec),

    se.unlocked_at

  from public.session_evidence se
  join public.evidence e
    on e.id = se.evidence_id

  where se.session_id = p_session

  order by e.sort_order, e.code;
end;
$$;

revoke all
  on function public.evidence_index(uuid)
  from public;

grant execute
  on function public.evidence_index(uuid)
  to authenticated;
