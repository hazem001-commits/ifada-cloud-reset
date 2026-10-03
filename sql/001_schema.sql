-- ============================================================
-- IFADA — 001_schema.sql
-- الجداول الأساسية. شغّل هذا الملف أولاً.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- التخصصات الأربعة (عدم التماثل البنيوي)
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'specialization') then
    create type specialization as enum ('forensics', 'digital', 'field', 'records');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type session_status as enum ('lobby', 'active', 'hearing', 'closed', 'abandoned');
  end if;
end $$;

-- ------------------------------------------------------------
-- profiles — بروفايل المحقق الدائم
-- مرتبط بـ auth.users. يُنشأ تلقائياً عند التسجيل (trigger بالأسفل).
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 2 and 40),
  cases_closed  integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- cases — كتالوج القضايا (بيانات عامة فقط، لا أسرار هنا إطلاقاً)
-- ------------------------------------------------------------
create table if not exists public.cases (
  id                text primary key,              -- 'room-714'
  title             text not null,
  victim_name       text not null,
  incident_date     date not null,
  classification    text not null,                 -- 'MISSING PERSON'
  difficulty        smallint not null check (difficulty between 1 and 5),
  duration_minutes  integer not null,
  min_players       smallint not null default 2,
  max_players       smallint not null default 4,
  cover_path        text,
  price_cents       integer not null default 0,
  is_published      boolean not null default false,
  created_at        timestamptz not null default now()
);

-- ------------------------------------------------------------
-- entitlements — من يملك أي قضية
-- لا يُكتب من المتصفح أبداً. فقط من السيرفر (Stripe لاحقاً).
-- ------------------------------------------------------------
create table if not exists public.entitlements (
  user_id     uuid not null references auth.users(id) on delete cascade,
  case_id     text not null references public.cases(id) on delete cascade,
  source      text not null default 'purchase',    -- purchase | grant | trial
  granted_at  timestamptz not null default now(),
  primary key (user_id, case_id)
);

-- ------------------------------------------------------------
-- sessions — جلسة لعب واحدة
-- ------------------------------------------------------------
create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  case_id     text not null references public.cases(id),
  code        text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_id     uuid not null references auth.users(id) on delete cascade,
  status      session_status not null default 'lobby',
  phase       smallint not null default 0,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  closed_at   timestamptz
);

create index if not exists sessions_code_idx on public.sessions (code);
create index if not exists sessions_host_idx on public.sessions (host_id);

-- ------------------------------------------------------------
-- session_members — من في أي جلسة وبأي تخصص
-- التخصص فريد داخل الجلسة الواحدة.
-- ------------------------------------------------------------
create table if not exists public.session_members (
  session_id      uuid not null references public.sessions(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  specialization  specialization not null,
  is_host         boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- تخصص واحد لكل جلسة
create unique index if not exists session_members_unique_spec
  on public.session_members (session_id, specialization);

create index if not exists session_members_user_idx
  on public.session_members (user_id);

-- ------------------------------------------------------------
-- إنشاء بروفايل تلقائياً عند التسجيل
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      'محقق ' || substr(new.id::text, 1, 4)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
