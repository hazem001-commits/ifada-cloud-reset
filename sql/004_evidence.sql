-- ============================================================
-- IFADA — 004_evidence.sql
-- الأدلة، الفتح، اللوحة المشتركة.
-- هذا الملف يحل المشكلة B-02: لا يصل للمتصفح دليل غير مفتوح،
-- ولا محتوى دليل خارج تخصص اللاعب.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'evidence_kind') then
    create type evidence_kind as enum
      ('document', 'photo', 'audio', 'video', 'record', 'testimony');
  end if;
end $$;

-- ------------------------------------------------------------
-- evidence — كل أدلة كل القضايا.
-- ⚠️ هذا الجدول ممنوع القراءة منه مباشرة. لا سياسة select إطلاقاً.
--    كل وصول يمر عبر RPC يفحص الفتح والتخصص.
-- ------------------------------------------------------------
create table if not exists public.evidence (
  id              uuid primary key default gen_random_uuid(),
  case_id         text not null references public.cases(id) on delete cascade,
  code            text not null,                    -- 'S-01'
  title           text not null,
  kind            evidence_kind not null,
  owner_spec      specialization not null,          -- مين بيقدر يقرأ المحتوى
  body            text,                             -- النص الكامل للدليل
  media_path      text,                             -- مسار بـ Storage (خاص)
  clock_label     text,                             -- '23:47:12' لمحرك الزمن لاحقاً
  is_initial      boolean not null default false,   -- متاح من بداية القضية
  requires        text[] not null default '{}',     -- أكواد لازم تُفتح قبله
  sort_order      integer not null default 0,
  unique (case_id, code)
);

create index if not exists evidence_case_idx on public.evidence (case_id);

-- ------------------------------------------------------------
-- session_evidence — شو انفتح بأي جلسة
-- ------------------------------------------------------------
create table if not exists public.session_evidence (
  session_id   uuid not null references public.sessions(id) on delete cascade,
  evidence_id  uuid not null references public.evidence(id) on delete cascade,
  unlocked_by  uuid references auth.users(id) on delete set null,
  unlocked_at  timestamptz not null default now(),
  primary key (session_id, evidence_id)
);

-- ------------------------------------------------------------
-- board_notes — عناصر اللوحة المشتركة
-- ------------------------------------------------------------
create table if not exists public.board_notes (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  author_id      uuid not null references auth.users(id) on delete cascade,
  evidence_code  text,                 -- إذا مثبّت دليل
  text           text not null default '',
  x              real not null default 0.5,   -- نسبة 0..1 من عرض اللوحة
  y              real not null default 0.5,
  created_at     timestamptz not null default now()
);

create index if not exists board_notes_session_idx
  on public.board_notes (session_id);

-- ------------------------------------------------------------
-- board_links — الخيوط بين العناصر
-- ------------------------------------------------------------
create table if not exists public.board_links (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  from_note   uuid not null references public.board_notes(id) on delete cascade,
  to_note     uuid not null references public.board_notes(id) on delete cascade,
  label       text not null default '',
  author_id   uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (from_note <> to_note)
);

create index if not exists board_links_session_idx
  on public.board_links (session_id);

-- ============================================================
-- RLS
-- ============================================================

-- evidence: مفعّل بدون أي سياسة = ممنوع تماماً من المتصفح.
alter table public.evidence enable row level security;

-- session_evidence: الأعضاء يشوفون شو انفتح بجلستهم (بدون محتوى).
alter table public.session_evidence enable row level security;

drop policy if exists session_evidence_select on public.session_evidence;
create policy session_evidence_select on public.session_evidence
  for select to authenticated
  using (public.is_session_member(session_id));

-- الفتح عبر RPC فقط.

-- board_notes
alter table public.board_notes enable row level security;

drop policy if exists board_notes_select on public.board_notes;
create policy board_notes_select on public.board_notes
  for select to authenticated
  using (public.is_session_member(session_id));

drop policy if exists board_notes_insert on public.board_notes;
create policy board_notes_insert on public.board_notes
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_session_member(session_id)
  );

-- أي عضو يقدر يحرّك أي عنصر — اللوحة مشتركة فعلاً
drop policy if exists board_notes_update on public.board_notes;
create policy board_notes_update on public.board_notes
  for update to authenticated
  using (public.is_session_member(session_id))
  with check (public.is_session_member(session_id));

drop policy if exists board_notes_delete on public.board_notes;
create policy board_notes_delete on public.board_notes
  for delete to authenticated
  using (public.is_session_member(session_id));

-- board_links
alter table public.board_links enable row level security;

drop policy if exists board_links_select on public.board_links;
create policy board_links_select on public.board_links
  for select to authenticated
  using (public.is_session_member(session_id));

drop policy if exists board_links_insert on public.board_links;
create policy board_links_insert on public.board_links
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_session_member(session_id)
  );

drop policy if exists board_links_delete on public.board_links;
create policy board_links_delete on public.board_links
  for delete to authenticated
  using (public.is_session_member(session_id));

-- ============================================================
-- RPC: my_specialization
-- ============================================================
create or replace function public.my_specialization(p_session uuid)
returns specialization
language sql
security definer
set search_path = public
stable
as $$
  select specialization
  from public.session_members
  where session_id = p_session and user_id = auth.uid();
$$;

-- ============================================================
-- RPC: evidence_index
-- القلب. كل عضو يشوف قائمة الأدلة المفتوحة — بس المحتوى
-- بيرجع فقط إذا التخصص مطابق. غير هيك بيرجع null والواجهة
-- بتعرضه كشريط محجوب.
-- ============================================================
create or replace function public.evidence_index(p_session uuid)
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
declare
  v_spec specialization;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  v_spec := public.my_specialization(p_session);

  return query
  select
    e.code,
    e.title,
    e.kind,
    e.owner_spec,
    e.clock_label,
    case when e.owner_spec = v_spec then e.body       else null end,
    case when e.owner_spec = v_spec then e.media_path else null end,
    (e.owner_spec = v_spec),
    se.unlocked_at
  from public.session_evidence se
  join public.evidence e on e.id = se.evidence_id
  where se.session_id = p_session
  order by e.sort_order, e.code;
end;
$$;

-- ============================================================
-- RPC: unlockable_evidence
-- الأدلة اللي صار ممكن تُفتح (شروطها تحققت) ولسا مقفلة.
-- يشوفها صاحب التخصص فقط — هو اللي بيقدر يفتحها.
-- ============================================================
create or replace function public.unlockable_evidence(p_session uuid)
returns table (code text, title text, kind evidence_kind)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_spec specialization;
  v_case text;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  v_spec := public.my_specialization(p_session);
  select s.case_id into v_case from public.sessions s where s.id = p_session;

  return query
  select e.code, e.title, e.kind
  from public.evidence e
  where e.case_id = v_case
    and e.owner_spec = v_spec
    and not exists (
      select 1 from public.session_evidence se
      where se.session_id = p_session and se.evidence_id = e.id
    )
    and (
      cardinality(e.requires) = 0
      or not exists (
        select 1 from unnest(e.requires) as req(c)
        where not exists (
          select 1
          from public.session_evidence se2
          join public.evidence e2 on e2.id = se2.evidence_id
          where se2.session_id = p_session and e2.code = req.c
        )
      )
    )
  order by e.sort_order, e.code;
end;
$$;

-- ============================================================
-- RPC: unlock_evidence
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

-- ============================================================
-- RPC: open_case — يفتح الأدلة الابتدائية عند بدء التحقيق
-- ============================================================
create or replace function public.open_case(p_session uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case  text;
  v_count integer;
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

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.evidence_index(uuid) from public;
revoke all on function public.unlockable_evidence(uuid) from public;
revoke all on function public.unlock_evidence(uuid, text) from public;
revoke all on function public.open_case(uuid) from public;
revoke all on function public.my_specialization(uuid) from public;

grant execute on function public.evidence_index(uuid) to authenticated;
grant execute on function public.unlockable_evidence(uuid) to authenticated;
grant execute on function public.unlock_evidence(uuid, text) to authenticated;
grant execute on function public.open_case(uuid) to authenticated;
grant execute on function public.my_specialization(uuid) to authenticated;

-- ============================================================
-- Realtime
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['session_evidence', 'board_notes', 'board_links'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
