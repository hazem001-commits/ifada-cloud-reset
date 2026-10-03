-- ============================================================
-- IFADA 036 — LIVE SLICE ASSERTION: CHANNEL ≠ OWNER_SPEC ≠ SPECIALIZATION
-- (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor AFTER 036 is applied and a 2-player
-- Scene 17 dev session has been STARTED. Put its 6-character code below.
-- Every row with a non-null pass must show pass = true. Rows with
-- pass = null are INFO — the per-player rows are the expected browser view.
--
-- LIVE LIMITATION (by design, not weakened for QA): join_session refuses a
-- specialization already taken until all four are covered
-- (SPECIALIZATION_TAKEN), and assign_session_specializations then spreads the
-- rest — two live players always hold DIFFERENT specializations. This live
-- run therefore does NOT prove "same specialization + different channels";
-- the synthetic tests (tests/cases/dualCase.test.ts, sql035.test.ts) do.
--
-- What it proves live:
--   L5  no slice row has a capability owner → the specialization rule
--       (has_specialization(owner_spec)) would grant NOTHING to anyone;
--   L6  yet each private row is readable by exactly its channel holder,
--       a player whose specializations do NOT include that row's owner_spec;
--   L7  rows with the SAME owner_spec (E06 vs E10) have DIFFERENT readers, and
--       the shared row (same owner_spec again) has BOTH → neither owner_spec nor
--       the players' global specializations decide readability; the channel does.
--
-- Browser half (each player, own account): Case File / evidence list shows
-- exactly the I2 "expected readable" codes for that player — no title,
-- count, or placeholder for the other lane; Search: seat 1 finds "الكتف"
-- (E06) and gets zero for "UNNAMED"; seat 2 the reverse; both find "جود" (E05).
-- ============================================================
with
-- ← the session code for THIS run. Reuse for a later run: replace the single
-- literal below with the new 6-character code; nothing else in this file
-- needs to change. Current target: the first live Scene 17 2-player session.
params(code) as (values ('HNRWLH')),
-- Resolves to exactly one row (sessions.code is UNIQUE) — case_id/status are
-- filtered here too (not just inside L1's pass expression) so this CTE itself
-- never silently resolves to some other session: wrong code, wrong case, or
-- not yet active all collapse to s having zero rows, and every downstream
-- CTE (mem/ev/grid) then correctly reports nothing rather than guessing.
s as (select x.id, x.case_id, x.status from public.sessions x
      where x.code = (select code from params) and x.case_id = 'scene-17' and x.status = 'active'),
slice(code, lane) as (values ('E05', null::text), ('E06', 'A'), ('E07', 'A'), ('E10', 'B')),
mem as (
  select sm.user_id, sm.specialization as primary_spec,
         row_number() over (order by sm.joined_at, sm.user_id) as seat
  from public.session_members sm where sm.session_id = (select id from s)
),
ev as (
  select e.id, e.code, e.owner_spec, ec.channel_id,
         exists (select 1 from public.session_evidence se
                 where se.session_id = (select id from s) and se.evidence_id = e.id) as unlocked
  from public.evidence e
  left join public.case_evidence_channels ec on ec.evidence_id = e.id
  where e.case_id = 'scene-17' and e.code in (select code from slice)
),
grid as (   -- every member × every slice row, judged by each rule independently
  select m.user_id, m.seat, e.code, e.owner_spec,
         -- 035 channel rule (what evidence_index applies to a Scene 17 member)
         (e.channel_id is null
          or exists (select 1 from public.session_member_channels c
                     where c.session_id = (select id from s) and c.user_id = m.user_id
                       and c.case_id = 'scene-17' and c.channel_id = e.channel_id)) as by_channel,
         -- counterfactual specialization rule (has_specialization(owner_spec), Room 714)
         coalesce(exists (select 1 from public.session_member_specializations x
                  where x.session_id = (select id from s) and x.user_id = m.user_id
                    and x.specialization = e.owner_spec)
          or m.primary_spec = e.owner_spec, false) as by_spec
  from mem m cross join ev e
)
select check_name, pass, detail from (
  select 1 as ord, 'L1 session is an ACTIVE scene-17 session with exactly 2 members' as check_name,
         exists (select 1 from s where s.case_id = 'scene-17' and s.status = 'active')
         and (select count(*) from mem) = 2 as pass,
         (select coalesce(max(s.case_id || ' / ' || s.status::text), 'SESSION NOT FOUND') from s)
           || ' / ' || (select count(*) from mem) || ' members' as detail
  union all
  select 2, 'L2 server assigned exactly the authored seat plan (seat 1 = A C E H, seat 2 = B D F G)',
         coalesce((select string_agg(m.seat || ':' || c.channel_id, ',' order by m.seat, c.channel_id)
          from mem m join public.session_member_channels c
            on c.session_id = (select id from s) and c.user_id = m.user_id)
           = '1:A,1:C,1:E,1:H,2:B,2:D,2:F,2:G', false),
         null
  union all
  select 3, 'L3 every slice row is unlocked in this session (E05 E06 E07 E10)',
         (select count(*) from ev where unlocked) = 4, null
  union all
  select 4, 'L4 lanes are the reviewed ones (E05 shared, E06/E07 → A, E10 → B)',
         coalesce((select string_agg(ev.code || ':' || coalesce(ev.channel_id, '-'), ',' order by ev.code) from ev)
           = 'E05:-,E06:A,E07:A,E10:B', false), null
  union all
  select 5, 'L5 no slice row has a capability owner → the specialization rule grants NOTHING',
         not exists (select 1 from ev where owner_spec is not null)
         and not exists (select 1 from grid where by_spec), null
  union all
  select 6, 'L6 ' || sl.code || ' readable by exactly '
            || case when sl.lane is null then 'both seats (shared)' when sl.lane = 'A' then 'seat 1' else 'seat 2' end
            || ' — granted by channel, not by owner_spec / specialization',
         coalesce((select string_agg(g.seat::text, ',' order by g.seat) from grid g where g.code = sl.code and g.by_channel)
           = case when sl.lane is null then '1,2' when sl.lane = 'A' then '1' else '2' end, false)
         and not exists (select 1 from grid g where g.code = sl.code and g.by_spec),
         null
  from slice sl
  union all
  select 7, 'L7 same owner_spec, different readers: E06 vs E10 split the seats; shared E05 reaches both',
         (select count(*) from ev) = 4
         and (select count(distinct coalesce(owner_spec::text, '(none)')) from ev) = 1   -- one identical owner_spec on all four
         and (select string_agg(seat::text, ',') from grid where code = 'E06' and by_channel)
             is distinct from (select string_agg(seat::text, ',') from grid where code = 'E10' and by_channel)
         and (select count(*) from grid where code = 'E05' and by_channel) = 2,
         null
  -- INFO: the expected browser view per player
  union all
  select 8, 'I1 seat ' || m.seat || ' specializations (primary first) / channels', null::boolean,
         m.primary_spec::text || ' + '
         || coalesce((select string_agg(x.specialization::text, ',' order by x.specialization)
                      from public.session_member_specializations x
                      where x.session_id = (select id from s) and x.user_id = m.user_id
                        and x.specialization <> m.primary_spec), '—')
         || ' / ' || coalesce((select string_agg(c.channel_id, ',' order by c.channel_id)
                               from public.session_member_channels c
                               where c.session_id = (select id from s) and c.user_id = m.user_id), '—')
  from mem m
  union all
  select 9, 'I2 seat ' || m.seat || ' expected readable (browser must show exactly these)', null::boolean,
         (select string_agg(g.code, ' ' order by g.code) from grid g where g.user_id = m.user_id and g.by_channel)
  from mem m
) checks
order by ord, check_name;
