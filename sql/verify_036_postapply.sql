-- ============================================================
-- IFADA 036 — POST-APPLY VERIFICATION (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor right after applying 036.
-- Every row with a non-null pass must show pass = true.
-- Rows with pass = null are INFO (live-play counters).
--
-- S — exactly the reviewed slice config (policy, channels, seats)
-- E — exactly the four reviewed evidence rows (text by md5, media, mapping;
--     owner_spec NULL — no invented capability owner)
-- N — nothing else seeded
-- R — Room 714 unchanged (every row keeps its owner_spec); 032 untouched
-- V — 031 / 033 / 034 / 035 intact; clients cannot self-assign; no cross-case rows;
--     open_case returns only the caller-visible initial count (036 §0b)
-- ============================================================
with
slice(code, title, kind, sort_order, clock, body_md5, media) as (values
  ('E05', 'قائمة المشتبهين',              'document', 5,  null::text, '53f799960fb2a6e2e4e8239277cafb30', 'scene-17/E05.pdf'),
  ('E06', 'صفحة التدريب الأصلية للمشهد',   'document', 6,  null,       '34f6d22a9802262635dfc99c5853bce9', 'scene-17/E06.pdf'),
  ('E07', 'الصفحة الموجودة داخل ملف سلمى', 'document', 7,  null,       '2fdfd16445974d45550ed927232c956d', 'scene-17/E07.png'),
  ('E10', 'سجل أحداث نظام الصوت',         'record',   10, '22:46:52', '15f19ffa593606fb7e44b393b1f81ab5', null)),
chan_tables(name) as (values ('case_channels'), ('case_channel_seats'), ('case_evidence_channels'), ('session_member_channels')),
board_tables(name) as (values ('board_items'), ('board_threads'), ('board_validations')),
legacy(name) as (values ('board_notes'), ('board_links')),
client_roles(name) as (values ('anon'), ('authenticated')),
fsrc(name, body) as (select p.proname, p.prosrc from pg_proc p where p.pronamespace = 'public'::regnamespace
                       and p.proname in ('evidence_index', '_evidence_readable', '_board_material_team_visible', '_connection_match', 'open_case'))
select check_name, pass, detail from (
  -- S — slice configuration
  select 1 as ord, 'S1 scene-17 engine policy = channels + hidden' as check_name,
         exists (select 1 from public.case_engine_policy
                 where case_id = 'scene-17' and distribution = 'channels' and restricted_evidence = 'hidden') as pass,
         null::text as detail
  union all
  select 2, 'S2 channel catalogue is exactly A–H',
         coalesce((select array_agg(channel_id order by channel_id) from public.case_channels where case_id = 'scene-17')
           = array['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], false), null
  union all
  select 3, 'S3 2-player plan exact: seat 1 = A C E H, seat 2 = B D F G',
         coalesce((select string_agg(seat || ':' || channel_id, ',' order by seat, channel_id)
          from public.case_channel_seats where case_id = 'scene-17' and players = 2)
           = '1:A,1:C,1:E,1:H,2:B,2:D,2:F,2:G', false),
         (select string_agg(seat || ':' || channel_id, ',' order by seat, channel_id)
          from public.case_channel_seats where case_id = 'scene-17' and players = 2)
  union all
  select 3, 'S5 evidence.owner_spec is nullable (036 §0)',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'evidence' and column_name = 'owner_spec'
                   and is_nullable = 'YES'), null
  union all
  select 3, 'S4 no seat plan for any other player count (fails closed)',
         not exists (select 1 from public.case_channel_seats where case_id = 'scene-17' and players <> 2), null
  -- E — evidence
  union all
  select 4, 'E1 scene-17 evidence is exactly E05 E06 E07 E10',
         coalesce((select array_agg(code order by code) from public.evidence where case_id = 'scene-17')
           = array['E05', 'E06', 'E07', 'E10'], false), null
  union all
  select 5, 'E2 reviewed row (title, kind, owner_spec NULL, initial, order, clock, exact text): ' || s.code,
         exists (select 1 from public.evidence e
                 where e.case_id = 'scene-17' and e.code = s.code and e.title = s.title and e.kind::text = s.kind
                   and e.owner_spec is null and e.is_initial and cardinality(e.requires) = 0
                   and e.sort_order = s.sort_order and e.clock_label is not distinct from s.clock
                   and md5(replace(e.body, chr(13), '')) = s.body_md5),
         (select md5(replace(e.body, chr(13), '')) from public.evidence e where e.case_id = 'scene-17' and e.code = s.code)
  from slice s
  union all
  select 6, 'E3 media: none yet, or exactly the approved scene-17 asset path (E10 never): ' || s.code,
         exists (select 1 from public.evidence e
                 where e.case_id = 'scene-17' and e.code = s.code
                   and (e.media_path is null or (s.media is not null and e.media_path = s.media))), null
  from slice s
  union all
  select 7, 'E4 private lanes exact: E06 → A, E07 → A, E10 → B',
         coalesce((select string_agg(e.code || ':' || ec.channel_id, ',' order by e.code)
          from public.case_evidence_channels ec join public.evidence e on e.id = ec.evidence_id
          where e.case_id = 'scene-17') = 'E06:A,E07:A,E10:B', false), null
  union all
  select 7, 'E5 E05 is shared lane (no channel row)',
         not exists (select 1 from public.case_evidence_channels ec join public.evidence e on e.id = ec.evidence_id
                     where e.case_id = 'scene-17' and e.code = 'E05'), null
  -- N — nothing else
  union all
  select 8, 'N1 scene-17 has no objects / challenges',
         (select count(*) from public.investigation_objects where case_id = 'scene-17')
         + (select count(*) from public.investigation_challenges where case_id = 'scene-17') = 0, null
  union all
  select 8, 'N2 no Scene 17 connection rule',
         not exists (select 1 from public.case_connection_rules where case_id = 'scene-17'), null
  union all
  select 8, 'N3 030 entities not live',
         to_regclass('public.case_entities') is null and to_regclass('public.session_entity_handles') is null, null
  -- R — Room 714 + 032
  union all
  select 9, 'R1 room-714 evidence = 34', (select count(*) from public.evidence where case_id = 'room-714') = 34, null
  union all
  select 9, 'R2 room-714 investigation_objects = 10', (select count(*) from public.investigation_objects where case_id = 'room-714') = 10, null
  union all
  select 9, 'R3 room-714 investigation_challenges = 3', (select count(*) from public.investigation_challenges where case_id = 'room-714') = 3, null
  union all
  select 9, 'R4 room-714 engine policy unchanged: specialization + title',
         exists (select 1 from public.case_engine_policy
                 where case_id = 'room-714' and distribution = 'specialization' and restricted_evidence = 'title'), null
  union all
  select 9, 'R6 room-714 every evidence row keeps its owner_spec',
         not exists (select 1 from public.evidence where case_id = 'room-714' and owner_spec is null), null
  union all
  select 10, 'R5 032 untouched: no approved rule; only known drafts if any',
         not exists (select 1 from public.case_connection_rules where status = 'approved')
         and not exists (select 1 from public.case_connection_rules r
                         where not (r.case_id = 'room-714' and r.status = 'draft'
                                    and r.rule_id in ('R714_NO_VICTIM_BLOOD', 'R714_N17_PAYMENTS', 'R714_COPY_AFTER_MESSAGE'))), null
  -- V — engine intact, no self-assignment, no cross-case rows
  union all
  select 11, 'V1 035 evidence_index still filters by the one readability rule',
         exists (select 1 from fsrc where name = 'evidence_index'
                   and position('(rd.can_read or public._evidence_row_visible(p_session, e.id))' in body) > 0), null
  union all
  select 11, 'V2 035 channel readability = own session assignment',
         exists (select 1 from fsrc where name = '_evidence_readable'
                   and position('m.session_id = p_session and m.user_id = auth.uid()' in body) > 0), null
  union all
  select 11, 'V3 session_evidence SELECT/realtime still filtered by row visibility',
         exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'session_evidence'
                   and p.qual like '%_evidence_row_visible(session_id, evidence_id)%'), null
  union all
  select 11, 'V4 Board V2 pins only shared-lane channel evidence',
         exists (select 1 from fsrc where name = '_board_material_team_visible'
                   and position('not exists (select 1 from public.case_evidence_channels ec where ec.evidence_id = v_eid)' in body) > 0), null
  union all
  select 12, 'V5 no client access to channel table: ' || t.name,
         not exists (select 1 from client_roles r
                     where has_table_privilege(r.name, 'public.' || t.name, 'SELECT')
                        or has_table_privilege(r.name, 'public.' || t.name, 'INSERT')
                        or has_table_privilege(r.name, 'public.' || t.name, 'UPDATE')
                        or has_table_privilege(r.name, 'public.' || t.name, 'DELETE')), null
  from chan_tables t
  union all
  select 13, 'V6 031 board tables: authenticated SELECT only',
         not exists (select 1 from board_tables t cross join client_roles r
                     where has_table_privilege(r.name, 'public.' || t.name, 'INSERT')
                        or has_table_privilege(r.name, 'public.' || t.name, 'UPDATE')
                        or has_table_privilege(r.name, 'public.' || t.name, 'DELETE')), null
  union all
  select 13, 'V7 033 matcher unchanged (case-scoped, approved AND team_safe)',
         exists (select 1 from fsrc where name = '_connection_match'
                   and position('where r.case_id = p_case and r.status = ''approved'' and r.team_safe' in body) > 0), null
  union all
  select 14, 'V8 034 legacy lock intact: ' || l.name,
         not exists (select 1 from client_roles r
                     where has_table_privilege(r.name, 'public.' || l.name, 'INSERT')
                        or has_table_privilege(r.name, 'public.' || l.name, 'UPDATE')
                        or has_table_privilege(r.name, 'public.' || l.name, 'DELETE')
                        or has_table_privilege(r.name, 'public.' || l.name, 'TRUNCATE')), null
  from legacy l
  union all
  select 15, 'V9 no evidence mapped to another case''s channel',
         not exists (select 1 from public.case_evidence_channels ec join public.evidence e on e.id = ec.evidence_id
                     where e.case_id <> ec.case_id), null
  union all
  select 15, 'V10 no member channel row crosses its session''s case',
         not exists (select 1 from public.session_member_channels m join public.sessions s on s.id = m.session_id
                     where s.case_id <> m.case_id), null
  union all
  select 15, 'V11 NULL owner_spec only in channel-distributed cases (spec cases keep a capability owner)',
         not exists (select 1 from public.evidence e
                     left join public.case_engine_policy p on p.case_id = e.case_id
                     where e.owner_spec is null and p.distribution is distinct from 'channels'), null
  union all
  select 15, 'V12 open_case returns ONLY the caller-visible initial count (no inserted-row count, same signature)',
         exists (select 1 from fsrc where name = 'open_case'
                   and position('if not public.is_session_member(p_session) then' in body) > 0
                   and position('public._evidence_row_visible(p_session, e.id)' in body) > 0
                   and position('return v_visible;' in body) > 0
                   and position('get diagnostics' in lower(body)) = 0
                   and position('row_count' in lower(body)) = 0)
         and exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'open_case'
                       and pg_get_function_identity_arguments(p.oid) = 'p_session uuid'
                       and p.prorettype = 'integer'::regtype and p.prosecdef)
         and (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'open_case') = 1, null
  union all
  select 15, 'V13 open_case EXECUTE: authenticated yes, anon no',
         has_function_privilege('authenticated', 'public.open_case(uuid)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.open_case(uuid)', 'EXECUTE'), null
  -- INFO
  union all
  select 16, 'I1 scene-17 sessions', null::boolean, (select count(*)::text from public.sessions where case_id = 'scene-17')
  union all
  select 17, 'I2 session_member_channels rows', null::boolean, (select count(*)::text from public.session_member_channels)
) checks
order by ord, check_name;
