-- ============================================================
-- OBSOLETE — DO NOT RUN. Superseded by
-- fix_multiplayer_specialization_access.sql (multi-specialization)
-- and reasserted by 017_consolidate_current_state.sql.
-- This single-specialization version (my_specialization) would hide
-- expiring secondary-specialization evidence. Kept only as history;
-- the guard below aborts the whole file on any database that already
-- has the multi-specialization model. See sql/MIGRATIONS.md.
-- ============================================================
begin;

do $$
begin
  if to_regclass('public.session_member_specializations') is not null then
    raise exception 'OBSOLETE SCRIPT: fix_expiring_evidence.sql would regress expiring_evidence to single-specialization. Do not run it (see sql/MIGRATIONS.md).';
  end if;
end $$;

create or replace function public.expiring_evidence(p_session uuid)
returns table(
  code text,
  title text,
  expires_ck integer,
  minutes_left numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_spec specialization;
  v_case text;
  v_now numeric;
begin
  if not public.is_session_member(p_session) then
    raise exception 'NOT_A_MEMBER';
  end if;

  v_spec := public.my_specialization(p_session);

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
      (e.expires_ck - v_now) /
      nullif(
        (
          select multiplier
          from public.case_config
          where case_id = v_case
        ),
        0
      )
    )::numeric
  from public.evidence e
  where e.case_id = v_case
    and e.owner_spec = v_spec
    and e.expires_ck is not null
    and not exists (
      select 1
      from public.session_evidence se
      where se.session_id = p_session
        and se.evidence_id = e.id
    )
  order by e.expires_ck;
end;
$function$;

commit;
