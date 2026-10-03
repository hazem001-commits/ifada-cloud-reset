-- ============================================================
-- IFADA — 006_timeline.sql
-- محرك الاتساق الزمني-المكاني. أهم جزء بالمشروع.
--
-- الفكرة: اللاعبون يبنون نظرية (مين كان وين وإيمتى).
-- المحرك ما بيقول "صح/غلط" — بيقول "مستحيل فيزيائياً" أو
-- "بيتعارض مع دليل مثبت" أو "في فجوة غير مفسّرة".
-- ============================================================

-- ------------------------------------------------------------
-- locations — أماكن القضية
-- ------------------------------------------------------------
create table if not exists public.locations (
  case_id  text not null references public.cases(id) on delete cascade,
  code     text not null,
  name     text not null,
  primary key (case_id, code)
);

alter table public.locations enable row level security;

drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
  for select to authenticated
  using (true);   -- أسماء الأماكن فقط، لا معلومة حساسة. آمن كـ "عام".

-- ------------------------------------------------------------
-- travel_matrix — دقائق التنقل بين كل مكانين (متماثل)
-- ------------------------------------------------------------
create table if not exists public.travel_matrix (
  case_id      text not null references public.cases(id) on delete cascade,
  location_a   text not null,
  location_b   text not null,
  minutes      smallint not null check (minutes >= 0),
  primary key (case_id, location_a, location_b),
  foreign key (case_id, location_a) references public.locations(case_id, code),
  foreign key (case_id, location_b) references public.locations(case_id, code)
);

alter table public.travel_matrix enable row level security;

drop policy if exists travel_matrix_select on public.travel_matrix;
create policy travel_matrix_select on public.travel_matrix
  for select to authenticated
  using (true);

create or replace function public.travel_minutes(
  p_case text, p_a text, p_b text
) returns smallint
language sql stable
security definer set search_path = public
as $$
  select case when p_a = p_b then 0::smallint else (
    select minutes from public.travel_matrix
    where case_id = p_case
      and ((location_a = p_a and location_b = p_b)
        or (location_a = p_b and location_b = p_a))
    limit 1
  ) end;
$$;

-- ------------------------------------------------------------
-- timeline_people — أشخاص القضية (للاستخدام بالإعادة، منفصل
-- عن "characters" الاستجواب لأن هون بس اسم/رمز، بدون أسرار)
-- ------------------------------------------------------------
create table if not exists public.timeline_people (
  case_id  text not null references public.cases(id) on delete cascade,
  code     text not null,
  name     text not null,
  primary key (case_id, code)
);

alter table public.timeline_people enable row level security;

drop policy if exists timeline_people_select on public.timeline_people;
create policy timeline_people_select on public.timeline_people
  for select to authenticated
  using (true);

-- ------------------------------------------------------------
-- timeline_facts — حقائق مثبّتة بالأدلة (canon، غير قابلة للنقاش)
-- مربوطة برمز دليل — تُستخدم للتحقق من التعارض، ما توصل
-- كنص خام للاعب؛ الإشارة له عند التعارض تكون برمز الدليل فقط.
-- ------------------------------------------------------------
create table if not exists public.timeline_facts (
  id             uuid primary key default gen_random_uuid(),
  case_id        text not null references public.cases(id) on delete cascade,
  person_code    text not null,
  location_code  text not null,
  start_ck       integer not null,   -- دقائق منذ منتصف ليل بداية اليوم (23:00 = 1380)
  end_ck         integer not null,
  evidence_code  text not null,      -- الدليل اللي بيثبت هالحقيقة
  check (end_ck >= start_ck)
);

create index if not exists timeline_facts_case_idx
  on public.timeline_facts (case_id, person_code);

-- لا سياسة select: الحقائق نفسها سرية، فقط نتيجة التعارض تُكشف.
alter table public.timeline_facts enable row level security;

-- ------------------------------------------------------------
-- theory_placements — نظرية الفريق: مين كان وين وإيمتى
-- ------------------------------------------------------------
create table if not exists public.theory_placements (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  author_id    uuid not null references auth.users(id) on delete cascade,
  person_code  text not null,
  location_code text not null,
  start_ck     integer not null,
  end_ck       integer not null,
  note         text not null default '',
  created_at   timestamptz not null default now(),
  check (end_ck > start_ck)
);

create index if not exists theory_placements_session_idx
  on public.theory_placements (session_id, person_code);

alter table public.theory_placements enable row level security;

drop policy if exists theory_placements_select on public.theory_placements;
create policy theory_placements_select on public.theory_placements
  for select to authenticated
  using (public.is_session_member(session_id));

drop policy if exists theory_placements_insert on public.theory_placements;
create policy theory_placements_insert on public.theory_placements
  for insert to authenticated
  with check (
    author_id = auth.uid() and public.is_session_member(session_id)
  );

drop policy if exists theory_placements_delete on public.theory_placements;
create policy theory_placements_delete on public.theory_placements
  for delete to authenticated
  using (public.is_session_member(session_id));

-- ============================================================
-- evaluate_theory — قلب المحرك
-- يرجع jsonb: { status, issues: [...] }
-- issues[].kind: 'impossible' | 'contradiction' | 'gap'
-- ============================================================
create or replace function public.evaluate_theory(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case text;
  v_issues jsonb := '[]'::jsonb;
  v_person record;
  v_cur record;
  v_prev record;
  v_gap integer;
  v_need integer;
  v_fact record;
  -- نافذة الحدث الحرجة لهذه القضية (23:40 → 00:40) بوحدة "دقائق منذ 22:00"
  v_window_start constant integer := 1420;
  v_window_end   constant integer := 1480;
  v_cursor integer;
  v_has_cover boolean;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;

  -- ---------- لكل شخص ظهر بالنظرية ----------
  for v_person in
    select distinct person_code from public.theory_placements
    where session_id = p_session
  loop
    v_prev := null;

    for v_cur in
      select * from public.theory_placements
      where session_id = p_session and person_code = v_person.person_code
      order by start_ck
    loop
      -- تداخل مباشر: نفس الشخص بمكانين بنفس الوقت
      if v_prev is not null and v_cur.start_ck < v_prev.end_ck then
        v_issues := v_issues || jsonb_build_object(
          'kind', 'impossible',
          'person', v_person.person_code,
          'detail', format(
            'وجود متزامن: %s موجود بـ %s و%s بنفس الوقت تقريباً.',
            v_person.person_code, v_prev.location_code, v_cur.location_code
          )
        );
      elsif v_prev is not null then
        v_gap := v_cur.start_ck - v_prev.end_ck;
        v_need := coalesce(
          public.travel_minutes(v_case, v_prev.location_code, v_cur.location_code),
          999
        );
        if v_gap < v_need then
          v_issues := v_issues || jsonb_build_object(
            'kind', 'impossible',
            'person', v_person.person_code,
            'detail', format(
              'مستحيل فيزيائياً: الانتقال من %s إلى %s يحتاج %s دقيقة على الأقل، والنظرية تعطيه %s دقيقة فقط.',
              v_prev.location_code, v_cur.location_code, v_need, v_gap
            )
          );
        end if;
      end if;

      -- تعارض مع حقيقة مثبتة
      for v_fact in
        select * from public.timeline_facts
        where case_id = v_case
          and person_code = v_person.person_code
          and start_ck < v_cur.end_ck
          and end_ck > v_cur.start_ck
      loop
        if v_fact.location_code <> v_cur.location_code then
          v_issues := v_issues || jsonb_build_object(
            'kind', 'contradiction',
            'person', v_person.person_code,
            'detail', format(
              'تعارض مع الدليل %s: يثبت وجود %s بـ %s بنفس الفترة اللي نظريتك تحطه فيها بـ %s.',
              v_fact.evidence_code, v_person.person_code,
              v_fact.location_code, v_cur.location_code
            )
          );
        end if;
      end loop;

      v_prev := v_cur;
    end loop;

    -- ---------- فجوة غير مفسّرة بالنافذة الحرجة ----------
    v_cursor := v_window_start;
    v_has_cover := false;

    while v_cursor < v_window_end loop
      if exists (
        select 1 from public.theory_placements
        where session_id = p_session
          and person_code = v_person.person_code
          and start_ck <= v_cursor and end_ck > v_cursor
      ) then
        v_has_cover := true;
      else
        v_has_cover := false;
      end if;

      if not v_has_cover then
        -- وجدنا نقطة غير مغطاة؛ سجّل تحذير واحد وانتقل
        v_issues := v_issues || jsonb_build_object(
          'kind', 'gap',
          'person', v_person.person_code,
          'detail', format(
            'فجوة غير مفسّرة بنظريتك حوالي الساعة %s:%s — ما حطيت %s بأي مكان بهاي اللحظة.',
            (v_cursor / 60), lpad((v_cursor % 60)::text, 2, '0'), v_person.person_code
          )
        );
        exit;
      end if;

      v_cursor := v_cursor + 10;
    end loop;
  end loop;

  return jsonb_build_object(
    'status', case
      when exists (
        select 1 from jsonb_array_elements(v_issues) i
        where i->>'kind' in ('impossible', 'contradiction')
      ) then 'inconsistent'
      when jsonb_array_length(v_issues) = 0 then 'consistent'
      else 'consistent_with_gaps'
    end,
    'issues', v_issues
  );
end;
$$;

revoke all on function public.evaluate_theory(uuid) from public;
grant execute on function public.evaluate_theory(uuid) to authenticated;
revoke all on function public.travel_minutes(text, text, text) from public;
grant execute on function public.travel_minutes(text, text, text) to authenticated;

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'theory_placements'
  ) then
    alter publication supabase_realtime add table public.theory_placements;
  end if;
end $$;
