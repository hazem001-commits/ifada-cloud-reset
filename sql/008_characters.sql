-- ============================================================
-- IFADA — 008_characters.sql
-- نظام الحقيقة الطبقية. جدول characters مقفول تماماً من
-- المتصفح — فقط الـ Route Handler (service role) يقرأه.
-- ============================================================

-- ------------------------------------------------------------
-- characters — الشخصيات القابلة للاستجواب
-- layers: jsonb بالشكل:
-- {
--   "persona": "وصف الشخصية ونبرتها للنموذج",
--   "layer1": "ما يقوله بحرية من البداية",
--   "layer2": { "trigger": ["V-03"], "text": "..." },
--   "layer3": { "trigger": ["D-04","D-03"], "text": "..." },
--   "layer4_refusal": "ما يمتنع عن قوله أياً كان الضغط"
-- }
-- ------------------------------------------------------------
create table if not exists public.characters (
  case_id  text not null references public.cases(id) on delete cascade,
  code     text not null,
  name     text not null,
  role     text not null,
  layers   jsonb not null,
  primary key (case_id, code)
);

-- ⚠️ لا سياسة select أبداً. مقفول بالكامل من anon/authenticated.
alter table public.characters enable row level security;

-- ------------------------------------------------------------
-- session_character_state — أي طبقة انفتحت بأي جلسة
-- ------------------------------------------------------------
create table if not exists public.session_character_state (
  session_id      uuid not null references public.sessions(id) on delete cascade,
  character_code  text not null,
  current_layer   smallint not null default 1,
  revealed        text[] not null default '{}',   -- أكواد أدلة استُخدمت فعلاً
  updated_at      timestamptz not null default now(),
  primary key (session_id, character_code)
);

alter table public.session_character_state enable row level security;

drop policy if exists scs_select on public.session_character_state;
create policy scs_select on public.session_character_state
  for select to authenticated
  using (public.is_session_member(session_id));

-- لا insert/update من المتصفح — فقط الـ Route Handler (service role).

-- ------------------------------------------------------------
-- interrogation_log — كل الاستجواب. سجل واحد لكل الفريق
-- (المحقق الميداني يسأل، الباقي يشوف بالوقت الحقيقي)
-- ------------------------------------------------------------
create table if not exists public.interrogation_log (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  character_code  text not null,
  speaker         text not null check (speaker in ('player','character')),
  author_id       uuid references auth.users(id) on delete set null,
  evidence_code   text,
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists interrogation_log_session_idx
  on public.interrogation_log (session_id, character_code, created_at);

alter table public.interrogation_log enable row level security;

drop policy if exists interrogation_log_select on public.interrogation_log;
create policy interrogation_log_select on public.interrogation_log
  for select to authenticated
  using (public.is_session_member(session_id));

-- لا insert من المتصفح — يمنع لاعب من تلفيق اعتراف مزيّف.
-- كل الكتابة تمر عبر /api/interrogate بمفتاح service role.

-- ------------------------------------------------------------
-- RPC: interrogation_subjects — القائمة العامة فقط (بدون أسرار)
-- ------------------------------------------------------------
create or replace function public.interrogation_subjects(p_session uuid)
returns table (code text, name text, role text, current_layer smallint)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.code, c.name, c.role,
    coalesce(s.current_layer, 1)
  from public.characters c
  join public.sessions se on se.id = p_session
  left join public.session_character_state s
    on s.session_id = p_session and s.character_code = c.code
  where c.case_id = se.case_id
    and public.is_session_member(p_session)
  order by c.code;
$$;

revoke all on function public.interrogation_subjects(uuid) from public;
grant execute on function public.interrogation_subjects(uuid) to authenticated;

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'interrogation_log'
  ) then
    alter publication supabase_realtime add table public.interrogation_log;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'session_character_state'
  ) then
    alter publication supabase_realtime add table public.session_character_state;
  end if;
end $$;
