-- ============================================================
-- IFADA — verify_live_state.sql      (READ-ONLY — safe to run)
--
-- One SELECT, no writes. Paste into the Supabase SQL Editor and run.
-- Every row is one check: expected vs actual, plus PASS / FAIL.
-- "body_md5" rows are informational: MATCH means the live function
-- body is byte-identical (ignoring CR) to the authoritative repo
-- definition; DIFFERS means it was defined from another version.
-- See sql/MIGRATIONS.md for what to do with a FAIL.
-- ============================================================
with
fn(name, sig) as (values
  ('has_specialization',             'public.has_specialization(uuid, specialization)'),
  ('my_specializations',             'public.my_specializations(uuid)'),
  ('assign_session_specializations', 'public.assign_session_specializations(uuid)'),
  ('start_session',                  'public.start_session(uuid)'),
  ('join_session',                   'public.join_session(text, specialization)'),
  ('evidence_index',                 'public.evidence_index(uuid)'),
  ('unlockable_evidence',            'public.unlockable_evidence(uuid)'),
  ('unlock_evidence',                'public.unlock_evidence(uuid, text)'),
  ('expiring_evidence',              'public.expiring_evidence(uuid)'),
  ('check_milestones',               'public.check_milestones(uuid)'),
  ('case_clock',                     'public.case_clock(uuid)')
),
src as (
  select f.name, f.sig, to_regprocedure(f.sig) as oid,
         replace(p.prosrc, chr(13), '') as body, p.prosecdef
  from fn f left join pg_proc p on p.oid = to_regprocedure(f.sig)
),
expected_md5(name, md5) as (values
  ('has_specialization',             '8f16f70cc91baf41851c5704a6884999'),
  ('my_specializations',             '576b58d9f0491add6aee9675a8275033'),
  ('assign_session_specializations', '85a52f61ed0fecc860f7a78683dfefb4'),
  ('start_session',                  '507a8c0e9569f44c8526c702a8b9a7dd'),
  ('join_session',                   'ff6f3f60065086bb3754bbaeb2b165fc'),
  ('evidence_index',                 '6dd40a206b4909ca450128ebf96a9e3e'),
  ('unlockable_evidence',            '2d73589e04f42253f6a06a21521ab1e9'),
  ('unlock_evidence',                '6de32a3649eb71b781d736ed1a29f64d'),
  ('expiring_evidence',              '0f08dba4cfdc7d6419de033d1fd4fd47')
),
rt(t) as (values
  ('sessions'), ('session_members'), ('session_evidence'), ('board_notes'),
  ('board_links'), ('theory_placements'), ('interrogation_log'),
  ('session_character_state'), ('session_events'), ('session_verdict')
),
checks(section, check_name, expected, actual) as (
  -- ---------- catalogue / config ----------
  select 'config', 'room-714 max_players', '8',
         (select max_players::text from public.cases where id = 'room-714')
  union all
  select 'config', 'scene-17 max_players', '8',
         (select max_players::text from public.cases where id = 'scene-17')
  union all
  select 'config', 'cases.max_players default', '8',
         (select column_default from information_schema.columns
          where table_schema = 'public' and table_name = 'cases' and column_name = 'max_players')
  union all
  select 'config', 'room-714 start_ck', '1380',
         (select start_ck::text from public.case_config where case_id = 'room-714')
  union all
  select 'config', 'room-714 multiplier = 1', 'true',
         (select (multiplier = 1)::text from public.case_config where case_id = 'room-714')
  union all
  select 'config', 'session_members_unique_spec index absent', 'absent',
         case when to_regclass('public.session_members_unique_spec') is null then 'absent' else 'PRESENT' end

  -- ---------- multi-specialization model ----------
  union all
  select 'multispec', 'session_member_specializations table', 'exists',
         case when to_regclass('public.session_member_specializations') is null then 'MISSING' else 'exists' end
  union all
  select 'multispec', 'session_member_specializations RLS', 'enabled',
         (select case when relrowsecurity then 'enabled' else 'DISABLED' end
          from pg_class where oid = to_regclass('public.session_member_specializations'))
  union all
  select 'multispec', 'session_member_specializations select policy', '1',
         (select count(*)::text from pg_policies
          where schemaname = 'public' and tablename = 'session_member_specializations' and cmd = 'SELECT')
  union all
  select 'multispec', name || ' exists', 'exists',
         case when oid is null then 'MISSING' else 'exists' end
  from src where name in ('has_specialization', 'my_specializations',
                          'assign_session_specializations', 'start_session',
                          'join_session', 'check_milestones', 'case_clock')
  union all
  select 'multispec', 'start_session calls assign_session_specializations', 'yes',
         (select case when body like '%assign_session_specializations%' then 'yes' else 'NO' end
          from src where name = 'start_session')

  -- ---------- evidence functions use effective access ----------
  union all
  select 'evidence', name || ' uses has_specialization (not my_specialization)', 'yes',
         case
           when oid is null then 'MISSING'
           when body like '%has_specialization(%' and body not like '%my_specialization(%' then 'yes'
           else 'NO (single-specialization body)'
         end
  from src where name in ('evidence_index', 'unlockable_evidence',
                          'unlock_evidence', 'expiring_evidence')
  union all
  select 'evidence', 'evidence_index return shape', 'has_media, no media_path',
         (select case
                   when r like '%media_path%' then 'LEAKS media_path'
                   when r like '%has_media boolean%' then 'has_media, no media_path'
                   else r end
          from (select pg_get_function_result(to_regprocedure('public.evidence_index(uuid)')) as r) x)
  union all
  select 'evidence', 'other functions still calling my_specialization()', '0',
         (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname <> 'my_specialization'
            and p.prosrc like '%my_specialization(%')
  union all
  select 'evidence', 'evidence table: RLS on, zero client policies', 'enabled / 0',
         (select case when relrowsecurity then 'enabled' else 'DISABLED' end
          from pg_class where oid = to_regclass('public.evidence'))
         || ' / ' ||
         (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'evidence')

  -- ---------- grants ----------
  union all
  select 'grants', 'anon can execute assign_session_specializations', 'false',
         has_function_privilege('anon', 'public.assign_session_specializations(uuid)', 'execute')::text
  union all
  select 'grants', 'authenticated can execute assign_session_specializations', 'false',
         has_function_privilege('authenticated', 'public.assign_session_specializations(uuid)', 'execute')::text
  union all
  select 'grants', 'authenticated can execute evidence_index', 'true',
         has_function_privilege('authenticated', 'public.evidence_index(uuid)', 'execute')::text

  -- ---------- realtime ----------
  union all
  select 'realtime', 'published: ' || rt.t, 'yes',
         case when exists (select 1 from pg_publication_tables
                           where pubname = 'supabase_realtime'
                             and schemaname = 'public' and tablename = rt.t)
              then 'yes' else 'NO' end
  from rt

  -- ---------- private media ----------
  union all
  select 'storage', 'case-media bucket public', 'false',
         (select public::text from storage.buckets where id = 'case-media')
  union all
  select 'storage', 'storage.objects policies mentioning case-media', '0',
         (select count(*)::text from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and (coalesce(qual, '') like '%case-media%' or coalesce(with_check, '') like '%case-media%'))

  -- ---------- exact body fingerprints (informational) ----------
  union all
  select 'body_md5', s.name || ' matches repo definition', 'MATCH',
         case when s.oid is null then 'MISSING'
              when md5(s.body) = e.md5 then 'MATCH'
              else 'DIFFERS' end
  from src s join expected_md5 e on e.name = s.name
)
select section,
       check_name,
       expected,
       coalesce(actual, 'NULL') as actual,
       case
         when section = 'body_md5' then case when actual = 'MATCH' then 'PASS' else 'INFO' end
         when actual = expected then 'PASS'
         else 'FAIL'
       end as result
from checks
order by case section
           when 'config' then 1 when 'multispec' then 2 when 'evidence' then 3
           when 'grants' then 4 when 'realtime' then 5 when 'storage' then 6 else 7 end,
         check_name;
