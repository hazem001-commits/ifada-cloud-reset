-- ============================================================
-- IFADA — 012_verdict.sql
-- جلسة الاستماع: مو "اختر المذنب" — سلسلة مسؤولية بأربع أسئلة،
-- وكل جواب له تصنيف مستقل: PROVEN / TRUE_BUT_UNPROVEN / WRONG.
-- هذا الفرق (عرفنا الحقيقة ≠ أثبتناها) هو جوهر لحظة النهاية.
-- ============================================================

-- ------------------------------------------------------------
-- case_verdict_questions — أسئلة الاستماع لكل قضية
-- options: jsonb [{ "id": "a", "label": "..." }, ...]
-- correct_option_id + required_evidence سرّية بالكامل
-- ------------------------------------------------------------
create table if not exists public.case_verdict_questions (
  case_id            text not null references public.cases(id) on delete cascade,
  code               text not null,
  prompt             text not null,
  options            jsonb not null,
  correct_option_id  text not null,
  required_evidence  text[] not null,
  sort_order         integer not null default 0,
  primary key (case_id, code)
);

-- لا سياسة select على الجواب الصحيح ومتطلبات الإثبات.
-- الواجهة تجيب الأسئلة والخيارات فقط عبر RPC (بدون الحل).
alter table public.case_verdict_questions enable row level security;

-- ------------------------------------------------------------
-- session_verdict — نتيجة الفريق النهائية (تُكتب مرة واحدة فقط)
-- ------------------------------------------------------------
create table if not exists public.session_verdict (
  session_id    uuid primary key references public.sessions(id) on delete cascade,
  answers       jsonb not null,      -- [{question_code, option_id}]
  results       jsonb not null,      -- تفاصيل التقييم لكل سؤال
  overall       text not null,       -- proven | true_but_unproven | wrong_reconstruction
  submitted_by  uuid references auth.users(id) on delete set null,
  submitted_at  timestamptz not null default now()
);

alter table public.session_verdict enable row level security;

drop policy if exists session_verdict_select on public.session_verdict;
create policy session_verdict_select on public.session_verdict
  for select to authenticated
  using (public.is_session_member(session_id));

-- الكتابة فقط عبر submit_verdict أدناه.

-- ------------------------------------------------------------
-- case_narrative — إعادة البناء السينمائية (تُكشف بعد الإغلاق فقط)
-- ------------------------------------------------------------
create table if not exists public.case_narrative (
  case_id       text not null references public.cases(id) on delete cascade,
  sort_order    integer not null,
  time_label    text,
  body          text not null,
  primary key (case_id, sort_order)
);

-- لا سياسة select: تُكشف فقط عبر RPC بعد إغلاق الجلسة (سبويلر كامل).
alter table public.case_narrative enable row level security;

-- ============================================================
-- RPC: verdict_questions — الأسئلة والخيارات فقط، بدون الحل
-- ============================================================
create or replace function public.verdict_questions(p_session uuid)
returns table (code text, prompt text, options jsonb)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_case text;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id into v_case from public.sessions s where s.id = p_session;

  return query
  select q.code, q.prompt, q.options
  from public.case_verdict_questions q
  where q.case_id = v_case
  order by q.sort_order;
end;
$$;

revoke all on function public.verdict_questions(uuid) from public;
grant execute on function public.verdict_questions(uuid) to authenticated;

-- ============================================================
-- RPC: submit_verdict — يُنادى مرة واحدة، يقفل الجلسة نهائياً
-- ============================================================
create or replace function public.submit_verdict(
  p_session uuid,
  p_answers jsonb   -- [{ "question_code": "...", "option_id": "..." }]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case      text;
  v_status    session_status;
  v_q         record;
  v_ans       jsonb;
  v_chosen    text;
  v_correct   boolean;
  v_proven    boolean;
  v_req       text;
  v_tier      text;
  v_results   jsonb := '[]'::jsonb;
  v_any_wrong boolean := false;
  v_any_unproven boolean := false;
  v_member    record;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id, s.status into v_case, v_status
  from public.sessions s where s.id = p_session;

  if v_status = 'closed' then
    raise exception 'ALREADY_CLOSED';
  end if;

  for v_q in
    select * from public.case_verdict_questions
    where case_id = v_case
    order by sort_order
  loop
    select elem into v_ans
    from jsonb_array_elements(p_answers) elem
    where elem->>'question_code' = v_q.code
    limit 1;

    v_chosen := coalesce(v_ans->>'option_id', '');
    v_correct := (v_chosen = v_q.correct_option_id);

    v_proven := true;
    foreach v_req in array v_q.required_evidence loop
      if not exists (
        select 1
        from public.session_evidence se
        join public.evidence e on e.id = se.evidence_id
        where se.session_id = p_session and e.code = v_req
      ) then
        v_proven := false;
        exit;
      end if;
    end loop;

    if not v_correct then
      v_tier := 'wrong';
      v_any_wrong := true;
    elsif v_proven then
      v_tier := 'proven';
    else
      v_tier := 'true_but_unproven';
      v_any_unproven := true;
    end if;

    v_results := v_results || jsonb_build_object(
      'question_code', v_q.code,
      'chosen', v_chosen,
      'correct', v_correct,
      'tier', v_tier
    );
  end loop;

  insert into public.session_verdict
    (session_id, answers, results, overall, submitted_by)
  values (
    p_session, p_answers, v_results,
    case
      when v_any_wrong then 'wrong_reconstruction'
      when v_any_unproven then 'true_but_unproven'
      else 'proven'
    end,
    auth.uid()
  )
  on conflict (session_id) do nothing;

  update public.sessions
  set status = 'closed', closed_at = now()
  where id = p_session;

  for v_member in
    select user_id from public.session_members where session_id = p_session
  loop
    update public.profiles
    set cases_closed = cases_closed + 1
    where id = v_member.user_id;
  end loop;

  return jsonb_build_object(
    'overall', case
      when v_any_wrong then 'wrong_reconstruction'
      when v_any_unproven then 'true_but_unproven'
      else 'proven'
    end,
    'results', v_results
  );
end;
$$;

revoke all on function public.submit_verdict(uuid, jsonb) from public;
grant execute on function public.submit_verdict(uuid, jsonb) to authenticated;

-- ============================================================
-- RPC: case_narrative — تُكشف فقط بعد إغلاق الجلسة
-- ============================================================
create or replace function public.case_narrative(p_session uuid)
returns table (sort_order integer, time_label text, body text)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_case text;
  v_status session_status;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  select s.case_id, s.status into v_case, v_status
  from public.sessions s where s.id = p_session;

  if v_status <> 'closed' then
    raise exception 'CASE_NOT_CLOSED';
  end if;

  return query
  select n.sort_order, n.time_label, n.body
  from public.case_narrative n
  where n.case_id = v_case
  order by n.sort_order;
end;
$$;

revoke all on function public.case_narrative(uuid) from public;
grant execute on function public.case_narrative(uuid) to authenticated;

-- Realtime — لما فرد يضغط "أرسل"، الفريق كله ينتقل لشاشة النتيجة فوراً
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'session_verdict'
  ) then
    alter publication supabase_realtime add table public.session_verdict;
  end if;
end $$;
