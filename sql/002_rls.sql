-- ============================================================
-- IFADA — 002_rls.sql
-- الحماية الحقيقية. هذا الملف يحل المشكلة B-01.
-- شغّله بعد 001_schema.sql
-- ============================================================
--
-- المبدأ: لا يوجد ولا سياسة واحدة فيها using (true).
-- كل قراءة وكل كتابة مربوطة بهوية المستخدم أو عضويته بالجلسة.
--
-- الانضمام والإنشاء يتمّان عبر دوال SECURITY DEFINER (RPC) فقط،
-- لأن السياسة العادية لا تستطيع فحص كود الغرفة بدون فتح الجدول للجميع.
-- ============================================================

-- ------------------------------------------------------------
-- دوال مساعدة
-- SECURITY DEFINER ضرورية هنا لتجنّب التكرار اللانهائي بالـ RLS
-- (سياسة session_members تحتاج تقرأ session_members)
-- ------------------------------------------------------------
create or replace function public.is_session_member(p_session uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.session_members
    where session_id = p_session
      and user_id = auth.uid()
  );
$$;

create or replace function public.shares_session_with(p_user uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.session_members a
    join public.session_members b on a.session_id = b.session_id
    where a.user_id = auth.uid()
      and b.user_id = p_user
  );
$$;

revoke all on function public.is_session_member(uuid) from public;
revoke all on function public.shares_session_with(uuid) from public;
grant execute on function public.is_session_member(uuid) to authenticated;
grant execute on function public.shares_session_with(uuid) to authenticated;

-- ============================================================
-- profiles
-- ============================================================
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.shares_session_with(id)
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- لا insert ولا delete من المتصفح: الـ trigger يتولى الإنشاء.

-- ============================================================
-- cases — الكتالوج العام. لا أسرار هنا.
-- ============================================================
alter table public.cases enable row level security;

drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases
  for select to authenticated
  using (is_published = true);

-- لا كتابة من المتصفح إطلاقاً.

-- ============================================================
-- entitlements — كل شخص يرى ملكياته فقط
-- ============================================================
alter table public.entitlements enable row level security;

drop policy if exists entitlements_select on public.entitlements;
create policy entitlements_select on public.entitlements
  for select to authenticated
  using (user_id = auth.uid());

-- لا insert/update/delete من المتصفح. فقط service_role (Stripe webhook لاحقاً).

-- ============================================================
-- sessions
-- ============================================================
alter table public.sessions enable row level security;

drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions
  for select to authenticated
  using (public.is_session_member(id));

drop policy if exists sessions_update on public.sessions;
create policy sessions_update on public.sessions
  for update to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

-- insert عبر RPC فقط (create_session).

-- ============================================================
-- session_members
-- ============================================================
alter table public.session_members enable row level security;

drop policy if exists session_members_select on public.session_members;
create policy session_members_select on public.session_members
  for select to authenticated
  using (public.is_session_member(session_id));

drop policy if exists session_members_delete on public.session_members;
create policy session_members_delete on public.session_members
  for delete to authenticated
  using (user_id = auth.uid());

-- insert عبر RPC فقط (join_session).

-- ============================================================
-- RPC: create_session
-- ============================================================
create or replace function public.create_session(
  p_case_id text,
  p_specialization specialization
)
returns table (session_id uuid, session_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_code    text;
  v_id      uuid;
  v_tries   int := 0;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- بدون O/0/I/1
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (select 1 from public.cases where id = p_case_id and is_published) then
    raise exception 'CASE_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.entitlements
    where user_id = v_user and case_id = p_case_id
  ) then
    raise exception 'NOT_ENTITLED';
  end if;

  loop
    v_tries := v_tries + 1;
    if v_tries > 20 then
      raise exception 'CODE_GENERATION_FAILED';
    end if;

    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from public.sessions s where s.code = v_code);
  end loop;

  insert into public.sessions (case_id, code, host_id)
  values (p_case_id, v_code, v_user)
  returning id into v_id;

  insert into public.session_members (session_id, user_id, specialization, is_host)
  values (v_id, v_user, p_specialization, true);

  return query select v_id, v_code;
end;
$$;

-- ============================================================
-- RPC: join_session
-- ============================================================
create or replace function public.join_session(
  p_code text,
  p_specialization specialization
)
returns table (session_id uuid, case_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_count   int;
  v_max     int;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_session
  from public.sessions
  where code = upper(trim(p_code));

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_session.status <> 'lobby' then
    raise exception 'SESSION_ALREADY_STARTED';
  end if;

  -- عضو أصلاً؟ رجّع الجلسة بدون خطأ (إعادة اتصال)
  if exists (
    select 1 from public.session_members
    where session_members.session_id = v_session.id
      and user_id = v_user
  ) then
    return query select v_session.id, v_session.case_id;
    return;
  end if;

  select max_players into v_max from public.cases where id = v_session.case_id;

  select count(*) into v_count
  from public.session_members
  where session_members.session_id = v_session.id;

  if v_count >= v_max then
    raise exception 'SESSION_FULL';
  end if;

  if exists (
    select 1 from public.session_members
    where session_members.session_id = v_session.id
      and specialization = p_specialization
  ) then
    raise exception 'SPECIALIZATION_TAKEN';
  end if;

  insert into public.session_members (session_id, user_id, specialization, is_host)
  values (v_session.id, v_user, p_specialization, false);

  return query select v_session.id, v_session.case_id;
end;
$$;

-- ============================================================
-- RPC: session_lobby — قراءة اللوبي بأسماء الأعضاء
-- ============================================================
create or replace function public.session_lobby(p_code text)
returns table (
  session_id     uuid,
  case_id        text,
  case_title     text,
  status         session_status,
  min_players    smallint,
  max_players    smallint,
  member_user_id uuid,
  display_name   text,
  spec           specialization,
  is_host        boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id, s.case_id, c.title, s.status, c.min_players, c.max_players,
    m.user_id, p.display_name, m.specialization, m.is_host
  from public.sessions s
  join public.cases c on c.id = s.case_id
  join public.session_members m on m.session_id = s.id
  join public.profiles p on p.id = m.user_id
  where s.code = upper(trim(p_code))
    and public.is_session_member(s.id)   -- غير الأعضاء لا يرون شيئاً
  order by m.joined_at;
$$;

revoke all on function public.create_session(text, specialization) from public;
revoke all on function public.join_session(text, specialization) from public;
revoke all on function public.session_lobby(text) from public;
grant execute on function public.create_session(text, specialization) to authenticated;
grant execute on function public.join_session(text, specialization) to authenticated;
grant execute on function public.session_lobby(text) to authenticated;

-- ============================================================
-- Realtime
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'session_members'
  ) then
    alter publication supabase_realtime add table public.session_members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
end $$;
