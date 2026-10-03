-- ============================================================
-- IFADA — fix_multiplayer_specialization_access.sql
--
-- إصلاح دعم 2–8 لاعبين مع الحفاظ على عدم التماثل:
--
-- 1) يبقى لكل لاعب تخصص أساسي واحد في session_members.
-- 2) نضيف session_member_specializations لتخصصات الوصول الفعلية.
-- 3) عند بدء القضية:
--      2 لاعبين  -> توزيع التخصصات الأربعة بينهم.
--      3 لاعبين  -> توزيع التخصص الرابع على أحدهم.
--      4 لاعبين  -> تخصص أساسي لكل لاعب.
--      5–8       -> يسمح بتكرار التخصص الأساسي بعد تغطية الأربعة.
-- 4) الأدلة + الأدلة المؤقتة تعتمد على صلاحيات الوصول الجديدة.
-- 5) الجلسات النشطة القديمة يتم إصلاحها تلقائياً.
-- ============================================================


-- ============================================================
-- 1. المنصة تدعم حتى 8 لاعبين
-- ============================================================

alter table public.cases
  alter column max_players set default 8;

update public.cases
set max_players = 8
where max_players < 8;


-- ============================================================
-- 2. السماح بتكرار التخصص الأساسي بعد تغطية التخصصات الأربعة
--
-- كان هذا الـ index يمنع أكثر من 4 لاعبين بشكل بنيوي.
-- ============================================================

drop index if exists public.session_members_unique_spec;


-- ============================================================
-- 3. جدول صلاحيات التخصصات الفعلية
--
-- session_members.specialization
-- يظل التخصص الأساسي الظاهر للاعب.
--
-- هذا الجدول يحدد كل التخصصات التي يستطيع اللاعب
-- فعلياً قراءة أدلتها واستخدام قدراتها.
-- ============================================================

create table if not exists public.session_member_specializations (
  session_id      uuid not null,
  user_id         uuid not null,
  specialization  specialization not null,
  is_primary      boolean not null default false,
  assigned_at     timestamptz not null default now(),

  primary key (session_id, user_id, specialization),

  foreign key (session_id, user_id)
    references public.session_members(session_id, user_id)
    on delete cascade
);

create index if not exists session_member_specializations_session_idx
  on public.session_member_specializations(session_id);

create index if not exists session_member_specializations_user_idx
  on public.session_member_specializations(user_id);

create index if not exists session_member_specializations_spec_idx
  on public.session_member_specializations(session_id, specialization);

-- كل لاعب عنده تخصص أساسي واحد فقط.
create unique index if not exists session_member_specializations_primary_idx
  on public.session_member_specializations(session_id, user_id)
  where is_primary = true;


-- ============================================================
-- 4. RLS
-- ============================================================

alter table public.session_member_specializations
  enable row level security;

drop policy if exists session_member_specializations_select
  on public.session_member_specializations;

create policy session_member_specializations_select
  on public.session_member_specializations
  for select
  to authenticated
  using (public.is_session_member(session_id));

-- القراءة مسموحة لأعضاء نفس الجلسة فقط.
-- الكتابة ممنوعة من المتصفح وتتم من دوال السيرفر فقط.

revoke all
  on table public.session_member_specializations
  from anon;

revoke insert, update, delete
  on table public.session_member_specializations
  from authenticated;

grant select
  on table public.session_member_specializations
  to authenticated;


-- ============================================================
-- 5. هل اللاعب الحالي يمتلك صلاحية تخصص معين؟
-- ============================================================

create or replace function public.has_specialization(
  p_session uuid,
  p_specialization specialization
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1
      from public.session_member_specializations sms
      where sms.session_id = p_session
        and sms.user_id = auth.uid()
        and sms.specialization = p_specialization
    )
    or
    exists (
      select 1
      from public.session_members sm
      where sm.session_id = p_session
        and sm.user_id = auth.uid()
        and sm.specialization = p_specialization
    );
$$;

revoke all
  on function public.has_specialization(uuid, specialization)
  from public;

grant execute
  on function public.has_specialization(uuid, specialization)
  to authenticated;


-- ============================================================
-- 6. كل تخصصات اللاعب الحالي
-- ============================================================

create or replace function public.my_specializations(
  p_session uuid
)
returns specialization[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    array_agg(q.spec order by q.spec::text),
    '{}'::specialization[]
  )
  from (
    select sms.specialization as spec
    from public.session_member_specializations sms
    where sms.session_id = p_session
      and sms.user_id = auth.uid()

    union

    select sm.specialization as spec
    from public.session_members sm
    where sm.session_id = p_session
      and sm.user_id = auth.uid()
  ) q;
$$;

revoke all
  on function public.my_specializations(uuid)
  from public;

grant execute
  on function public.my_specializations(uuid)
  to authenticated;


-- ============================================================
-- 7. توزيع التخصصات على أعضاء الجلسة
--
-- أولاً:
-- كل لاعب يأخذ تخصصه الأساسي.
--
-- بعدها:
-- أي تخصص من الأربعة غير ممثل يتم إعطاؤه للاعب
-- الذي عنده أقل عدد من التخصصات.
--
-- النتيجة:
-- 2 لاعبين = 2 + 2 غالباً
-- 3 لاعبين = 2 + 1 + 1
-- 4 لاعبين = 1 + 1 + 1 + 1
-- ============================================================

create or replace function public.assign_session_specializations(
  p_session uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spec specialization;
  v_user uuid;
begin
  -- إعادة بناء التوزيع بالكامل.
  delete from public.session_member_specializations
  where session_id = p_session;

  -- التخصص الأساسي لكل عضو.
  insert into public.session_member_specializations (
    session_id,
    user_id,
    specialization,
    is_primary
  )
  select
    sm.session_id,
    sm.user_id,
    sm.specialization,
    true
  from public.session_members sm
  where sm.session_id = p_session
  on conflict (session_id, user_id, specialization)
  do update set is_primary = true;

  -- وزع أي تخصص غير موجود على أقل لاعب حملاً.
  for v_spec in
    select unnest(enum_range(null::specialization))
  loop

    if not exists (
      select 1
      from public.session_member_specializations sms
      where sms.session_id = p_session
        and sms.specialization = v_spec
    ) then

      v_user := null;

      select sm.user_id
      into v_user
      from public.session_members sm
      left join (
        select
          sms2.user_id,
          count(*) as access_count
        from public.session_member_specializations sms2
        where sms2.session_id = p_session
        group by sms2.user_id
      ) access_counts
        on access_counts.user_id = sm.user_id
      where sm.session_id = p_session
      order by
        coalesce(access_counts.access_count, 0),
        sm.joined_at,
        sm.user_id
      limit 1;

      if v_user is not null then
        insert into public.session_member_specializations (
          session_id,
          user_id,
          specialization,
          is_primary
        )
        values (
          p_session,
          v_user,
          v_spec,
          false
        )
        on conflict do nothing;
      end if;

    end if;

  end loop;
end;
$$;

-- داخلية فقط.
revoke all
  on function public.assign_session_specializations(uuid)
  from public;


-- ============================================================
-- 8. إصلاح الجلسات القديمة الموجودة حالياً
--
-- مهم جداً للاختبار الحالي:
-- الجلسة الموجودة أصلاً Active لن تحتاج إعادة إنشاء.
-- ============================================================

do $$
declare
  v_session uuid;
begin
  for v_session in
    select s.id
    from public.sessions s
    where s.status in ('active', 'hearing', 'closed')
  loop
    perform public.assign_session_specializations(v_session);
  end loop;
end $$;


-- ============================================================
-- 9. join_session
--
-- قبل تغطية الأربعة:
-- ممنوع اختيار تخصص مأخوذ.
--
-- بعد ما التخصصات الأربعة تكون ممثلة:
-- اللاعبين 5–8 يقدروا يكرروا تخصص موجود.
--
-- FOR UPDATE يمنع سباق لاعبين يدخلوا بنفس اللحظة.
-- ============================================================

create or replace function public.join_session(
  p_code text,
  p_specialization specialization
)
returns table (
  session_id uuid,
  case_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_session   public.sessions%rowtype;
  v_count     integer;
  v_max       integer;
  v_distinct  integer;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_session
  from public.sessions
  where code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_session.status <> 'lobby' then
    raise exception 'SESSION_ALREADY_STARTED';
  end if;

  -- إعادة اتصال.
  if exists (
    select 1
    from public.session_members sm
    where sm.session_id = v_session.id
      and sm.user_id = v_user
  ) then
    return query
    select v_session.id, v_session.case_id;
    return;
  end if;

  select c.max_players
  into v_max
  from public.cases c
  where c.id = v_session.case_id;

  select count(*)
  into v_count
  from public.session_members sm
  where sm.session_id = v_session.id;

  if v_count >= v_max then
    raise exception 'SESSION_FULL';
  end if;

  select count(distinct sm.specialization)
  into v_distinct
  from public.session_members sm
  where sm.session_id = v_session.id;

  -- طالما التخصصات الأربعة لم تكتمل:
  -- يجب اختيار تخصص غير مستخدم.
  if v_distinct < 4
     and exists (
       select 1
       from public.session_members sm
       where sm.session_id = v_session.id
         and sm.specialization = p_specialization
     )
  then
    raise exception 'SPECIALIZATION_TAKEN';
  end if;

  insert into public.session_members (
    session_id,
    user_id,
    specialization,
    is_host
  )
  values (
    v_session.id,
    v_user,
    p_specialization,
    false
  );

  return query
  select v_session.id, v_session.case_id;
end;
$$;

revoke all
  on function public.join_session(text, specialization)
  from public;

grant execute
  on function public.join_session(text, specialization)
  to authenticated;


-- ============================================================
-- 10. start_session
--
-- بدء التحقيق يصير على السيرفر:
-- - يتأكد إنه Host
-- - يتأكد من العدد الأدنى
-- - يوزع صلاحيات التخصصات
-- - بعدها فقط يفعّل الجلسة
-- ============================================================

create or replace function public.start_session(
  p_session uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_session   public.sessions%rowtype;
  v_count     integer;
  v_min       integer;
  v_max       integer;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_session
  from public.sessions
  where id = p_session
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_session.host_id <> v_user then
    raise exception 'HOST_ONLY';
  end if;

  if v_session.status <> 'lobby' then
    raise exception 'SESSION_ALREADY_STARTED';
  end if;

  select
    c.min_players,
    c.max_players
  into
    v_min,
    v_max
  from public.cases c
  where c.id = v_session.case_id;

  select count(*)
  into v_count
  from public.session_members sm
  where sm.session_id = p_session;

  if v_count < v_min then
    raise exception 'NOT_ENOUGH_PLAYERS';
  end if;

  if v_count > v_max then
    raise exception 'SESSION_FULL';
  end if;

  perform public.assign_session_specializations(p_session);

  update public.sessions
  set
    status = 'active',
    started_at = now()
  where id = p_session;

  return true;
end;
$$;

revoke all
  on function public.start_session(uuid)
  from public;

grant execute
  on function public.start_session(uuid)
  to authenticated;


-- ============================================================
-- 11. evidence_index
--
-- الدليل المقفول يظهر للفريق،
-- لكن المحتوى يُقرأ فقط لمن يملك صلاحية تخصصه.
-- ============================================================

create or replace function public.evidence_index(
  p_session uuid
)
returns table (
  code         text,
  title        text,
  kind         evidence_kind,
  owner_spec   specialization,
  clock_label  text,
  body         text,
  media_path   text,
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
      then e.media_path
      else null
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


-- ============================================================
-- 12. unlockable_evidence
--
-- تشمل كل تخصصات الوصول الخاصة باللاعب،
-- وتحافظ على منطق انتهاء صلاحية الأدلة.
-- ============================================================

create or replace function public.unlockable_evidence(
  p_session uuid
)
returns table (
  code text,
  title text,
  kind evidence_kind
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_case text;
  v_now  numeric;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id
  into v_case
  from public.sessions s
  where s.id = p_session;

  select cc.now_ck
  into v_now
  from public.case_clock(p_session) cc;

  return query
  select
    e.code,
    e.title,
    e.kind
  from public.evidence e
  where e.case_id = v_case

    and public.has_specialization(
      p_session,
      e.owner_spec
    )

    and not exists (
      select 1
      from public.session_evidence se
      where se.session_id = p_session
        and se.evidence_id = e.id
    )

    and (
      e.expires_ck is null
      or v_now is null
      or v_now <= e.expires_ck
    )

    and (
      cardinality(e.requires) = 0

      or not exists (
        select 1
        from unnest(e.requires) as req(c)
        where not exists (
          select 1
          from public.session_evidence se2
          join public.evidence e2
            on e2.id = se2.evidence_id
          where se2.session_id = p_session
            and e2.code = req.c
        )
      )
    )

  order by e.sort_order, e.code;
end;
$$;

revoke all
  on function public.unlockable_evidence(uuid)
  from public;

grant execute
  on function public.unlockable_evidence(uuid)
  to authenticated;


-- ============================================================
-- 13. unlock_evidence
--
-- نفس منطق المرحلة 4:
-- - تخصص
-- - انتهاء صلاحية
-- - requirements
--
-- لكن التخصص الآن يعتمد على صلاحيات اللاعب كاملة.
-- ============================================================

create or replace function public.unlock_evidence(
  p_session uuid,
  p_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case text;
  v_ev   public.evidence%rowtype;
  v_req  text;
  v_now  numeric;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id
  into v_case
  from public.sessions s
  where s.id = p_session;

  select *
  into v_ev
  from public.evidence
  where case_id = v_case
    and code = upper(trim(p_code));

  if not found then
    raise exception 'EVIDENCE_NOT_FOUND';
  end if;

  if not public.has_specialization(
    p_session,
    v_ev.owner_spec
  ) then
    raise exception 'WRONG_SPECIALIZATION';
  end if;

  if v_ev.expires_ck is not null then

    select cc.now_ck
    into v_now
    from public.case_clock(p_session) cc;

    if v_now is not null
       and v_now > v_ev.expires_ck
    then
      raise exception 'EVIDENCE_EXPIRED';
    end if;

  end if;

  foreach v_req in array v_ev.requires
  loop

    if not exists (
      select 1
      from public.session_evidence se
      join public.evidence e2
        on e2.id = se.evidence_id
      where se.session_id = p_session
        and e2.code = v_req
    ) then
      raise exception 'REQUIREMENTS_NOT_MET';
    end if;

  end loop;

  insert into public.session_evidence (
    session_id,
    evidence_id,
    unlocked_by
  )
  values (
    p_session,
    v_ev.id,
    auth.uid()
  )
  on conflict do nothing;

  return true;
end;
$$;

revoke all
  on function public.unlock_evidence(uuid, text)
  from public;

grant execute
  on function public.unlock_evidence(uuid, text)
  to authenticated;


-- ============================================================
-- 14. expiring_evidence
--
-- نفس إصلاح المرحلة 4 + دعم تعدد التخصصات.
-- ============================================================

create or replace function public.expiring_evidence(
  p_session uuid
)
returns table (
  code text,
  title text,
  expires_ck integer,
  minutes_left numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_case text;
  v_now  numeric;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id
  into v_case
  from public.sessions s
  where s.id = p_session;

  select cc.now_ck
  into v_now
  from public.case_clock(p_session) cc;

  return query
  select
    e.code,
    e.title,
    e.expires_ck,

    (
      (e.expires_ck - v_now)
      /
      nullif(
        (
          select cc.multiplier
          from public.case_config cc
          where cc.case_id = v_case
        ),
        0
      )
    )::numeric

  from public.evidence e
  where e.case_id = v_case

    and public.has_specialization(
      p_session,
      e.owner_spec
    )

    and e.expires_ck is not null

    and not exists (
      select 1
      from public.session_evidence se
      where se.session_id = p_session
        and se.evidence_id = e.id
    )

  order by e.expires_ck;
end;
$$;

revoke all
  on function public.expiring_evidence(uuid)
  from public;

grant execute
  on function public.expiring_evidence(uuid)
  to authenticated;