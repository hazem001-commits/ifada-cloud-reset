-- ============================================================
-- IFADA 037 — POST-APPLY VERIFICATION (READ-ONLY: one SELECT, no writes)
-- Run in the Supabase SQL Editor right after applying 037 (ONLY after
-- Hazem approves applying it). Every row with a non-null pass must show
-- pass = true. Rows with pass = null are INFO.
--
-- T — tables + RLS + policies          G — grants (nothing widened)
-- X — helper/trigger EXECUTE locked     R — realtime exposure
-- P — pulse carries safe columns only   I — idempotency constraints
-- C — concurrency (advisory lock, deferred triggers, cascade bound)
-- H — gated objects (column, canonical+1 bodies, nothing gated yet)
-- K — approved-rule guards (authored content cannot change under a rule)
-- Z — engine only: no case runtime data, no session runtime rows (exhaustive)
-- ============================================================
with
authored(name) as (values ('case_runtime_nodes'), ('case_leads'), ('case_world_states'), ('case_runtime_rules')),
server_session(name) as (values ('session_pulse_sources'), ('session_runtime_firings'), ('session_runtime_effects'), ('session_runtime_provenance')),
member_read(name) as (values ('session_leads'), ('session_world_state'), ('session_pulses')),
all_new(name) as (select name from authored union all select name from server_session union all select name from member_read),
client_roles(name) as (values ('anon'), ('authenticated')),
write_priv(name) as (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')),
helpers as (select p.oid, p.proname from pg_proc p
            where p.pronamespace = 'public'::regnamespace and (p.proname like '\_runtime\_%')),
guard_fn(sig) as (values ('public._runtime_world_states_guard()'), ('public._runtime_leads_guard()'),
                         ('public._runtime_evidence_guard()'), ('public._runtime_objects_guard()'),
                         ('public._runtime_truncate_guard()')),
guard_trig(name, tbl) as (values
  ('case_world_states_guard', 'case_world_states'), ('case_leads_runtime_guard', 'case_leads'),
  ('evidence_runtime_guard', 'evidence'), ('investigation_objects_runtime_guard', 'investigation_objects')),
guarded(tbl) as (values ('evidence'), ('investigation_objects'), ('case_leads'), ('case_world_states')),
rpcs(sig) as (values ('public.runtime_state(uuid)'), ('public.runtime_provenance(uuid)'),
                     ('public.share_lead(uuid, text)'), ('public.runtime_settle(uuid)')),
trig(name, tbl) as (values
  ('runtime_object_state_changed', 'session_object_state'), ('runtime_evidence_unlocked', 'session_evidence'),
  ('runtime_lead_changed', 'session_leads'), ('runtime_connection_validated', 'session_validated_connections'),
  ('runtime_world_state_reached', 'session_world_state')),
src as (select p.proname, p.prosrc from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('_runtime_cascade', '_runtime_cascade_safe', 'runtime_settle', 'open_investigation', 'investigation_object_index',
                          '_runtime_on_object_state', '_runtime_on_evidence', '_runtime_on_lead', '_runtime_on_team_fact',
                          '_runtime_condition_holds', '_runtime_try_deliver', '_runtime_rules_validate', '_runtime_apply_effect'))
select check_name, pass, detail from (
  -- T
  select 1 as ord, 'T1 table exists with RLS enabled: ' || t.name as check_name,
         coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || t.name)), false) as pass,
         null::text as detail
  from all_new t
  union all
  select 2, 'T2 no policy at all (RPC-only): ' || t.name,
         not exists (select 1 from pg_policy pol where pol.polrelid = to_regclass('public.' || t.name)), null
  from (select name from authored union all select name from server_session) t
  union all
  select 3, 'T3 exactly one SELECT policy: ' || t.name,
         (select count(*) from pg_policy pol where pol.polrelid = to_regclass('public.' || t.name)) = 1
         and (select bool_and(pol.polcmd = 'r') from pg_policy pol where pol.polrelid = to_regclass('public.' || t.name)), null
  from member_read t
  union all
  select 4, 'T4 session_leads policy = member AND (shared OR holder is me)',
         (select pg_get_expr(pol.polqual, pol.polrelid) from pg_policy pol
          where pol.polrelid = 'public.session_leads'::regclass) ~ 'is_session_member'
         and (select pg_get_expr(pol.polqual, pol.polrelid) from pg_policy pol
              where pol.polrelid = 'public.session_leads'::regclass) ~ 'is_shared'
         and (select pg_get_expr(pol.polqual, pol.polrelid) from pg_policy pol
              where pol.polrelid = 'public.session_leads'::regclass) ~ 'holder = auth\.uid\(\)',
         (select pg_get_expr(pol.polqual, pol.polrelid) from pg_policy pol where pol.polrelid = 'public.session_leads'::regclass)
  union all
  select 5, 'T5 case_runtime_rules validation trigger present',
         exists (select 1 from pg_trigger where tgrelid = 'public.case_runtime_rules'::regclass
                 and tgname = 'case_runtime_rules_validate' and not tgisinternal), null
  -- G
  union all
  select 10, 'G1 no SELECT for ' || r.name || ' on ' || t.name,
         not has_table_privilege(r.name, 'public.' || t.name, 'SELECT'), null
  from (select name from authored union all select name from server_session) t cross join client_roles r
  union all
  select 11, 'G2 anon has no SELECT on ' || t.name, not has_table_privilege('anon', 'public.' || t.name, 'SELECT'), null
  from member_read t
  union all
  select 12, 'G3 authenticated has SELECT on ' || t.name, has_table_privilege('authenticated', 'public.' || t.name, 'SELECT'), null
  from member_read t
  union all
  select 13, 'G4 no ' || w.name || ' for ' || r.name || ' on ' || t.name,
         not has_table_privilege(r.name, 'public.' || t.name, w.name), null
  from all_new t cross join client_roles r cross join write_priv w
  union all
  select 14, 'G5 investigation_objects still fully locked for clients',
         not has_table_privilege('authenticated', 'public.investigation_objects', 'SELECT')
         and not has_table_privilege('anon', 'public.investigation_objects', 'SELECT'), null
  -- X
  union all
  select 20, 'X1 helper not executable by ' || r.name || ': ' || h.proname,
         not has_function_privilege(r.name, h.oid, 'EXECUTE'), null
  from helpers h cross join client_roles r
  union all
  select 21, 'X2 helper not executable by PUBLIC: ' || h.proname,
         not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     where p.oid = h.oid and a.grantee = 0 and a.privilege_type = 'EXECUTE'), null
  from helpers h
  union all
  select 22, 'X3 at least 12 _runtime_ helpers present', (select count(*) from helpers) >= 12,
         (select count(*)::text from helpers)
  union all
  select 23, 'X4 RPC executable by authenticated, not anon: ' || r.sig,
         has_function_privilege('authenticated', r.sig, 'EXECUTE') and not has_function_privilege('anon', r.sig, 'EXECUTE'), null
  from rpcs r
  union all
  select 24, 'X5 authenticated-only (authenticated yes, anon no, PUBLIC no): ' || f.sig,
         has_function_privilege('authenticated', f.sig, 'EXECUTE')
         and not has_function_privilege('anon', f.sig, 'EXECUTE')
         and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                         where p.oid = f.sig::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'), null
  from (values ('public.open_investigation(uuid)'), ('public.investigation_object_index(uuid)')) f(sig)
  union all
  select 25, 'X6 guard function exists, SECURITY DEFINER, not client/PUBLIC executable: ' || g.sig,
         coalesce((select p.prosecdef from pg_proc p where p.oid = to_regprocedure(g.sig)), false)
         and not has_function_privilege('anon', g.sig, 'EXECUTE')
         and not has_function_privilege('authenticated', g.sig, 'EXECUTE')
         and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                         where p.oid = to_regprocedure(g.sig) and a.grantee = 0 and a.privilege_type = 'EXECUTE'), null
  from guard_fn g
  -- R
  union all
  select 30, 'R1 in supabase_realtime: ' || t.name,
         exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t.name), null
  from member_read t
  union all
  select 31, 'R2 NOT in supabase_realtime: ' || t.name,
         not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t.name), null
  from (select name from authored union all select name from server_session) t
  -- P
  union all
  select 40, 'P1 session_pulses columns are exactly id, session_id, actor_id, category, created_at',
         (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
          where table_schema = 'public' and table_name = 'session_pulses') = array['id', 'session_id', 'actor_id', 'category', 'created_at'],
         (select string_agg(column_name::text, ',' order by ordinal_position) from information_schema.columns
          where table_schema = 'public' and table_name = 'session_pulses')
  union all
  select 41, 'P2 pulse category is constrained to the fixed taxonomy',
         exists (select 1 from pg_constraint c where c.conrelid = 'public.session_pulses'::regclass and c.contype = 'c'
                 and pg_get_constraintdef(c.oid) ~ 'PHYSICAL_TRACE' and pg_get_constraintdef(c.oid) ~ 'NEW_ACTION'), null
  union all
  select 42, 'P3 CONTRADICTION is not a pulse category anywhere: ' || t.name,
         exists (select 1 from pg_constraint c where c.conrelid = to_regclass('public.' || t.name) and c.contype = 'c'
                 and pg_get_constraintdef(c.oid) ~ 'PHYSICAL_TRACE')
         and not exists (select 1 from pg_constraint c where c.conrelid = to_regclass('public.' || t.name) and c.contype = 'c'
                         and pg_get_constraintdef(c.oid) ~ 'CONTRADICTION'), null
  from (values ('session_pulses'), ('case_runtime_nodes'), ('case_leads')) t(name)
  -- I
  union all
  select 50, 'I1 primary key ' || x.tbl || ' (' || x.cols || ')',
         coalesce((select string_agg(a.attname::text, ',' order by array_position(c.conkey, a.attnum))
                   from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
                   where c.conrelid = to_regclass('public.' || x.tbl) and c.contype = 'p') = x.cols, false), null
  from (values ('session_leads', 'session_id,lead_code'),
               ('session_world_state', 'session_id,state_code'),
               ('session_pulse_sources', 'session_id,source_key'),
               ('session_runtime_firings', 'session_id,rule_id,actor_key'),
               ('session_runtime_effects', 'session_id,effect_kind,effect_id'),
               ('session_runtime_provenance', 'session_id,node_kind,node_code'),
               ('case_runtime_rules', 'case_id,rule_id')) x(tbl, cols)
  -- C
  union all
  select 60, 'C1 _runtime_cascade serializes per session (pg_advisory_xact_lock)',
         (select prosrc from src where proname = '_runtime_cascade') ~ 'pg_advisory_xact_lock\(hashtextextended\(''ifada\.runtime:''', null
  union all
  select 61, 'C2 runtime_settle and every trigger go through the contained cascade (_runtime_cascade_safe)',
         (select bool_and(prosrc ~ '_runtime_cascade_safe\(') from src
          where proname in ('runtime_settle', '_runtime_on_object_state', '_runtime_on_evidence', '_runtime_on_lead', '_runtime_on_team_fact')), null
  union all
  select 61, 'C2b runaway rolls back only the cascade (subtransaction) and is logged',
         (select prosrc from src where proname = '_runtime_cascade_safe') ~ 'exception when others then'
         and (select prosrc from src where proname = '_runtime_cascade_safe') ~ 'cascade_limit', null
  union all
  select 61, 'C2c no deadlock: per-firing subtransaction with a short lock_timeout',
         (select prosrc from src where proname = '_runtime_cascade') ~ 'set_config\(''lock_timeout'', ''250ms'', true\)'
         and (select prosrc from src where proname = '_runtime_cascade') ~ 'exception when lock_not_available', null
  union all
  select 62, 'C3 cascade is bounded (≤ 32 firings / txn, ≤ 8 passes, RUNTIME_CASCADE_LIMIT)',
         (select prosrc from src where proname = '_runtime_cascade') ~ 'c_max_firings\s+constant integer := 32'
         and (select prosrc from src where proname = '_runtime_cascade') ~ 'c_max_passes\s+constant integer := 8'
         and (select prosrc from src where proname = '_runtime_cascade') ~ 'RUNTIME_CASCADE_LIMIT', null
  union all
  select 63, 'C4 once-only firing ledger used before effects',
         (select prosrc from src where proname = '_runtime_cascade') ~ 'insert into public\.session_runtime_firings', null
  union all
  select 64, 'C5 deferred constraint trigger (fires at commit): ' || t.name,
         exists (select 1 from pg_trigger g where g.tgname = t.name and g.tgrelid = to_regclass('public.' || t.tbl)
                 and g.tgdeferrable and g.tginitdeferred and g.tgconstraint <> 0), null
  from trig t
  union all
  select 65, 'C6 read-time auto-advance runs as SYSTEM (actor null)',
         (select prosrc from src where proname = '_runtime_on_object_state') ~ 'case when v_system then null else auth\.uid\(\) end', null
  union all
  select 66, 'C7 actor perspective is always the caller',
         (select prosrc from src where proname = '_runtime_condition_holds') ~ 'p_actor is distinct from auth\.uid\(\)', null
  union all
  select 67, 'C8 world-delivered material is runtime-only (never via unlock_evidence; sentinel requires)',
         (select prosrc from src where proname = '_runtime_try_deliver') !~ 'unlock_evidence'
         and (select prosrc from src where proname = '_runtime_try_deliver') ~ '@RUNTIME'
         and (select prosrc from src where proname = '_runtime_rules_validate') ~ '@RUNTIME', null
  union all
  select 68, 'C9 world-state guard trigger present',
         exists (select 1 from pg_trigger where tgrelid = 'public.case_world_states'::regclass
                 and tgname = 'case_world_states_guard' and not tgisinternal), null
  union all
  select 69, 'C10 open-case roots are not discoveries (runtime + authoring)',
         (select prosrc from src where proname = '_runtime_condition_holds') ~ 'not v_gated and v_parent is null'
         and (select prosrc from src where proname = '_runtime_rules_validate') ~ 'known from case open', null
  union all
  select 69, 'C11 team open_lead promotes an existing private lead',
         (select prosrc from src where proname = '_runtime_apply_effect') ~ 'on conflict \(session_id, lead_code\) do update\s+set is_shared = true', null
  union all
  select 69, 'C12 delivered material must be runtime-only AND not initial',
         (select prosrc from src where proname = '_runtime_rules_validate') ~ 'or v_init then', null
  -- K
  union all
  select 75, 'K1 row guard trigger BEFORE UPDATE OR DELETE FOR EACH ROW: ' || t.name,
         exists (select 1 from pg_trigger g where g.tgname = t.name and g.tgrelid = to_regclass('public.' || t.tbl)
                 and not g.tgisinternal and g.tgenabled <> 'D' and (g.tgtype & 27) = 27), null
  from guard_trig t
  union all
  select 76, 'K2 BEFORE TRUNCATE guard trigger: ' || t.tbl,
         exists (select 1 from pg_trigger g where g.tgname = t.tbl || '_runtime_truncate_guard' and g.tgrelid = to_regclass('public.' || t.tbl)
                 and not g.tgisinternal and g.tgenabled <> 'D' and (g.tgtype & 32) = 32 and (g.tgtype & 2) = 2), null
  from guarded t
  -- H
  union all
  select 70, 'H1 investigation_objects.gated boolean not null default false',
         exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'investigation_objects' and column_name = 'gated'
                   and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false'), null
  union all
  select 71, 'H2 open_investigation = canonical 020 + gated clause (md5)',
         (select md5(prosrc) from src where proname = 'open_investigation') = '40eecd13f963c6552a434efa4c107a81',
         (select md5(prosrc) from src where proname = 'open_investigation')
  union all
  select 72, 'H3 investigation_object_index = canonical 026 + gated clause (md5)',
         (select md5(prosrc) from src where proname = 'investigation_object_index') = '4fa968e3f43d504d9cdbfd9556674601',
         (select md5(prosrc) from src where proname = 'investigation_object_index')
  union all
  select 73, 'H4 no object is gated yet (engine only)',
         not exists (select 1 from public.investigation_objects where gated), null
  -- Z
  union all
  select 80, 'Z1 no authored runtime rows: ' || t.name, t.n = 0, t.n::text
  from (values ('case_runtime_rules', (select count(*) from public.case_runtime_rules)),
               ('case_runtime_nodes', (select count(*) from public.case_runtime_nodes)),
               ('case_leads',         (select count(*) from public.case_leads)),
               ('case_world_states',  (select count(*) from public.case_world_states))) t(name, n)
  union all
  select 81, 'Z2 no session runtime rows (inert engine): ' || t.name, t.n = 0, t.n::text
  from (values ('session_leads',              (select count(*) from public.session_leads)),
               ('session_world_state',        (select count(*) from public.session_world_state)),
               ('session_pulses',             (select count(*) from public.session_pulses)),
               ('session_pulse_sources',      (select count(*) from public.session_pulse_sources)),
               ('session_runtime_firings',    (select count(*) from public.session_runtime_firings)),
               ('session_runtime_effects',    (select count(*) from public.session_runtime_effects)),
               ('session_runtime_provenance', (select count(*) from public.session_runtime_provenance))) t(name, n)
  union all
  select 81, 'Z2b Z1+Z2 are exhaustive: every 037 table (case_runtime_*, case_leads, case_world_states, session_runtime_*, session_pulse*, session_leads, session_world_state) is listed',
         not exists (select 1 from pg_class c
                     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                       and (c.relname like 'case\_runtime\_%' or c.relname like 'session\_runtime\_%' or c.relname like 'session\_pulse%'
                            or c.relname in ('case_leads', 'case_world_states', 'session_leads', 'session_world_state'))
                       and c.relname not in (select name from all_new)),
         (select string_agg(c.relname, ',') from pg_class c
          where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
            and (c.relname like 'case\_runtime\_%' or c.relname like 'session\_runtime\_%' or c.relname like 'session\_pulse%')
            and c.relname not in (select name from all_new))
  union all
  select 81, 'Z2c no gated-object session rows (nothing revealed)',
         not exists (select 1 from public.session_object_state sos
                     join public.sessions s on s.id = sos.session_id
                     join public.investigation_objects o on o.case_id = s.case_id and o.code = sos.object_code
                     where o.gated), null
  union all
  select 82, 'Z3 Room 714 legacy milestones untouched (3 rows: MAP_EXPANDED, RAMI_FOUND, RAMI_DIED)',
         (select array_agg(code order by code) from public.case_milestones where case_id = 'room-714')
           = array['MAP_EXPANDED', 'RAMI_DIED', 'RAMI_FOUND'], null
) checks
order by ord, check_name;
