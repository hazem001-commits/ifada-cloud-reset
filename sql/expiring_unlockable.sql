-- ============================================================
-- OBSOLETE — DO NOT RUN. Superseded by
-- fix_multiplayer_specialization_access.sql (multi-specialization)
-- and reasserted by 017_consolidate_current_state.sql.
-- This single-specialization version (my_specialization) would hide
-- secondary-specialization leads. Kept only as history; the guard
-- below aborts the whole file on any database that already has the
-- multi-specialization model. See sql/MIGRATIONS.md.
-- ============================================================
begin;

do $$
begin
  if to_regclass('public.session_member_specializations') is not null then
    raise exception 'OBSOLETE SCRIPT: expiring_unlockable.sql would regress unlockable_evidence to single-specialization. Do not run it (see sql/MIGRATIONS.md).';
  end if;
end $$;

create or replace function public.unlockable_evidence(p_session uuid)
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
    e.kind
  from public.evidence e
  where e.case_id = v_case
    and e.owner_spec = v_spec

    -- ما تعرض دليل انفتح من قبل
    and not exists (
      select 1
      from public.session_evidence se
      where se.session_id = p_session
        and se.evidence_id = e.id
    )

    -- ما تعرض دليل انتهت صلاحيته
    and (
      e.expires_ck is null
      or v_now <= e.expires_ck
    )

    -- شروط فتح الدليل تحققت
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

commit;
