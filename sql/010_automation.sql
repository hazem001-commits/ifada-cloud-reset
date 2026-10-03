-- ============================================================
-- IFADA — 010_automation.sql
-- محرك الأتمتة: الساعة الحية، المعالم (Milestones)،
-- البث الحي، والانقطاع الجماعي.
--
-- المبدأ: كل الأتمتة مبنية على تقدّم الفريق (أدلة انفتحت) أو
-- على الساعة الداخلية للقضية — أبداً على "بعد كذا دقيقة ثابتة".
-- ============================================================

-- ------------------------------------------------------------
-- case_config — تعريف الساعة الداخلية لكل قضية
-- start_ck: الوقت الداخلي عند بداية التحقيق (23:00 = 1380)
-- multiplier: كم دقيقة داخلية تعادل كل دقيقة حقيقية
-- ------------------------------------------------------------
create table if not exists public.case_config (
  case_id     text primary key references public.cases(id) on delete cascade,
  start_ck    integer not null,
  multiplier  real not null default 1.0 check (multiplier > 0)
);

alter table public.case_config enable row level security;

drop policy if exists case_config_select on public.case_config;
create policy case_config_select on public.case_config
  for select to authenticated
  using (true);   -- إعداد عام، لا سر فيه.

-- ------------------------------------------------------------
-- الأدلة القابلة للانتهاء — الأرشيف بيتمسح إذا ما فتحتها بوقتها
-- ------------------------------------------------------------
alter table public.evidence
  add column if not exists expires_ck integer;

-- ------------------------------------------------------------
-- case_milestones — تعريف اللحظات الدرامية لكل قضية
-- kind: 'broadcast' (شريط إشعار) أو 'blackout' (انقطاع جماعي كامل)
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'milestone_kind') then
    create type milestone_kind as enum ('broadcast', 'blackout');
  end if;
end $$;

create table if not exists public.case_milestones (
  case_id          text not null references public.cases(id) on delete cascade,
  code             text not null,
  kind             milestone_kind not null,
  headline         text not null,
  body             text not null,
  required_evidence text[] not null,
  sort_order       integer not null default 0,
  primary key (case_id, code)
);

-- لا سياسة select من المتصفح: هاد بيكشف "شو رح يصير بعدين" مقدماً.
alter table public.case_milestones enable row level security;

-- ------------------------------------------------------------
-- session_events — الأحداث اللي فعلياً صارت بجلسة معينة
-- ------------------------------------------------------------
create table if not exists public.session_events (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  milestone_code text not null,
  kind           milestone_kind not null,
  headline       text not null,
  body           text not null,
  created_at     timestamptz not null default now(),
  unique (session_id, milestone_code)
);

alter table public.session_events enable row level security;

drop policy if exists session_events_select on public.session_events;
create policy session_events_select on public.session_events
  for select to authenticated
  using (public.is_session_member(session_id));

-- لا insert من المتصفح — فقط عبر الدالة أدناه.

-- ============================================================
-- RPC: case_clock — الوقت الداخلي الحالي للجلسة
-- ============================================================
create or replace function public.case_clock(p_session uuid)
returns table (
  start_ck    integer,
  multiplier  real,
  started_at  timestamptz,
  now_ck      numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select
    cc.start_ck,
    cc.multiplier,
    s.started_at,
    cc.start_ck + (
      extract(epoch from (now() - coalesce(s.started_at, now()))) / 60.0
    ) * cc.multiplier
  from public.sessions s
  join public.case_config cc on cc.case_id = s.case_id
  where s.id = p_session
    and public.is_session_member(p_session);
$$;

revoke all on function public.case_clock(uuid) from public;
grant execute on function public.case_clock(uuid) to authenticated;

-- ============================================================
-- RPC: expiring_evidence — أدلة تخصّي توشك تختفي ولسا ما فُتحت
-- ============================================================
create or replace function public.expiring_evidence(p_session uuid)
returns table (code text, title text, expires_ck integer, minutes_left numeric)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_spec specialization;
  v_case text;
  v_now  numeric;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  v_spec := public.my_specialization(p_session);
  select s.case_id into v_case from public.sessions s where s.id = p_session;
  select cc.now_ck into v_now from public.case_clock(p_session) cc;

  return query
  select e.code, e.title, e.expires_ck, (e.expires_ck - v_now) / nullif(
    (select multiplier from public.case_config where case_id = v_case), 0
  )
  from public.evidence e
  where e.case_id = v_case
    and e.owner_spec = v_spec
    and e.expires_ck is not null
    and not exists (
      select 1 from public.session_evidence se
      where se.session_id = p_session and se.evidence_id = e.id
    )
  order by e.expires_ck;
end;
$$;

revoke all on function public.expiring_evidence(uuid) from public;
grant execute on function public.expiring_evidence(uuid) to authenticated;

-- ============================================================
-- RPC: check_milestones — يُنادى بعد أي فتح دليل
-- يرجع المعالم اللي انفتحت لأول مرة بهاي الجلسة (للعرض فوراً)
-- ============================================================
create or replace function public.check_milestones(p_session uuid)
returns setof public.session_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case text;
  v_m record;
  v_have_all boolean;
  v_req text;
  v_new public.session_events%rowtype;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;

  for v_m in
    select * from public.case_milestones
    where case_id = v_case
    order by sort_order
  loop
    if exists (
      select 1 from public.session_events
      where session_id = p_session and milestone_code = v_m.code
    ) then
      continue;
    end if;

    v_have_all := true;
    foreach v_req in array v_m.required_evidence loop
      if not exists (
        select 1
        from public.session_evidence se
        join public.evidence e on e.id = se.evidence_id
        where se.session_id = p_session and e.code = v_req
      ) then
        v_have_all := false;
        exit;
      end if;
    end loop;

    if v_have_all then
      insert into public.session_events
        (session_id, milestone_code, kind, headline, body)
      values
        (p_session, v_m.code, v_m.kind, v_m.headline, v_m.body)
      on conflict (session_id, milestone_code) do nothing
      returning * into v_new;

      if v_new.id is not null then
        return next v_new;
      end if;
    end if;
  end loop;

  return;
end;
$$;

revoke all on function public.check_milestones(uuid) from public;
grant execute on function public.check_milestones(uuid) to authenticated;

-- ============================================================
-- unlock_evidence — إعادة تعريف: يضيف فحص انتهاء الصلاحية
-- (نفس الدالة من المرحلة 2، بس بشرط إضافي)
-- ============================================================
create or replace function public.unlock_evidence(
  p_session uuid,
  p_code    text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spec specialization;
  v_case text;
  v_ev   public.evidence%rowtype;
  v_req  text;
  v_now  numeric;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  v_spec := public.my_specialization(p_session);
  select s.case_id into v_case from public.sessions s where s.id = p_session;

  select * into v_ev
  from public.evidence
  where case_id = v_case and code = upper(trim(p_code));

  if not found then
    raise exception 'EVIDENCE_NOT_FOUND';
  end if;

  if v_ev.owner_spec <> v_spec then
    raise exception 'WRONG_SPECIALIZATION';
  end if;

  if v_ev.expires_ck is not null then
    select cc.now_ck into v_now from public.case_clock(p_session) cc;
    if v_now > v_ev.expires_ck then
      raise exception 'EVIDENCE_EXPIRED';
    end if;
  end if;

  foreach v_req in array v_ev.requires loop
    if not exists (
      select 1
      from public.session_evidence se
      join public.evidence e2 on e2.id = se.evidence_id
      where se.session_id = p_session and e2.code = v_req
    ) then
      raise exception 'REQUIREMENTS_NOT_MET';
    end if;
  end loop;

  insert into public.session_evidence (session_id, evidence_id, unlocked_by)
  values (p_session, v_ev.id, auth.uid())
  on conflict do nothing;

  return true;
end;
$$;

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'session_events'
  ) then
    alter publication supabase_realtime add table public.session_events;
  end if;
end $$;
