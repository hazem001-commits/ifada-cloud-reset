// ============================================================
// tests/connections/sql027.test.ts
// فحص بنيوي لمسودة 027 بعد مراجعة الأمان (لا تشغيل — لا Postgres محلي).
// كل بند هنا مرتبط بنتيجة مراجعة: لا oracle، لا تسريب معرّفات، آثار
// idempotent، حدود معدل، صلاحيات.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SQL = readFileSync('sql/027_validated_connections.sql', 'utf8');
const fn = (name: string) => {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, name);
  return SQL.slice(start, SQL.indexOf('$$;', SQL.indexOf('as $$', start)) + 3);
};
const code = (s: string) => s.replace(/--[^\n]*/g, '');

test('027 is a review draft that seeds nothing and touches no existing object', () => {
  assert.match(SQL, /STATUS: WRITTEN FOR REVIEW — NOT APPLIED/);
  const top = SQL.replace(/as \$\$[\s\S]*?\$\$;/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toLowerCase();
  for (const bad of ['insert into', 'update public.', 'delete from', 'drop ', 'truncate', 'alter table public.evidence', 'create policy']) {
    assert.ok(!top.includes(bad), bad);
  }
  const defined = [...SQL.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(defined, ['_apply_connection_effects', '_connection_node_known', 'propose_connection', 'session_connection_state', 'settle_connection_effects']);
  // كل دالة SECURITY DEFINER بمسار بحث ثابت، وكل جدول مؤهَّل بـ public.
  for (const name of defined) {
    const body = fn(name!);
    assert.match(body, /security definer\s+set search_path = public/, name);
    const relations = [...code(body).matchAll(/\b(?:from|join|insert into|update|delete from)\s+([a-z_][a-z0-9_.]*)/gi)].map((m) => m[1]!);
    for (const r of relations) {
      assert.ok(r.startsWith('public.') || ['jsonb_array_elements', 'unnest'].includes(r), `${name}: unqualified ${r}`);
    }
  }
});

test('order: membership → shape → throttle → every node known → only then rules', () => {
  const p = fn('propose_connection');
  const order = [
    p.indexOf("raise exception 'NOT_A_MEMBER'"),
    p.indexOf("raise exception 'INVALID_REQUEST'"),
    p.indexOf("'throttled'"),
    p.indexOf('public._connection_node_known('),
    p.indexOf('from public.case_connection_rules'),
  ];
  assert.ok(order.every((i) => i > 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  // قواعد هذه القضية المعتمدة فقط
  assert.match(p, /where r\.case_id = v_case and r\.status = 'approved'/);
  assert.match(p, /where c\.case_id = v_case and c\.status = 'approved'/);
});

test('no oracle: one neutral miss shape; success returns only the meaning', () => {
  const p = code(fn('propose_connection'));
  assert.equal((p.match(/jsonb_build_object\('status', 'not_established'\)/g) ?? []).length, 2);
  assert.match(p, /return jsonb_build_object\('status', 'validated', 'meaning', v_match\.meaning\);/);
  // لا معرّف قاعدة ولا أهداف ولا أعداد بأي رد
  const returns = [...p.matchAll(/return jsonb_build_object\(([^;]*)\);/g)].map((m) => m[1]!).join(' ');
  for (const leak of ['rule_id', "'rule'", "'evidence'", "'chapters'", 'v_produced', 'v_keys', 'reason']) assert.ok(!returns.includes(leak), leak);
  // الحالة الوحيدة الأخرى: throttled
  assert.deepEqual(
    [...new Set([...p.matchAll(/jsonb_build_object\('status', '([a-z_]+)'/g)].map((m) => m[1]))].sort(),
    ['not_established', 'throttled', 'validated'],
  );
});

test('effects can never turn a valid hit into an error (oracle fix): refusals deferred, faults logged', () => {
  const a = code(fn('_apply_connection_effects'));
  assert.ok(!/raise exception/.test(a), 'effects never raise to the proposer');
  assert.match(a, /if sqlerrm in \('WRONG_SPECIALIZATION', 'REQUIREMENTS_NOT_MET'\) then\s*insert into public\.session_connection_effects[^;]*'evidence_pending'/);
  assert.match(a, /elsif sqlerrm = 'EVIDENCE_EXPIRED' then\s*null;/);
  assert.match(a, /'effect_error'/);
  assert.match(a, /perform public\.unlock_evidence\(p_session, v_code\)/, 'authoritative unlock path only');
  // تسوية المعلّق: كعضو نفسه، بلا رد
  const s = fn('settle_connection_effects');
  assert.match(s, /returns void/);
  assert.match(code(s), /effect_kind = 'evidence_pending'/);
});

test('idempotent effects: rule once, condition once (race-safe), evidence never twice', () => {
  const p = code(fn('propose_connection'));
  assert.match(p, /insert into public\.session_validated_connections[\s\S]*?on conflict do nothing;\s*if found then\s*v_produced := v_produced \+ public\._apply_connection_effects\(p_session, v_match\.effects\);/);
  assert.match(p, /values \(p_session, 'condition', v_cond\.condition_id\)\s*on conflict do nothing;\s*if found then/);
  const a = code(fn('_apply_connection_effects'));
  assert.match(a, /effect_kind = 'evidence' and effect_id = v_code\) then\s*continue;/);
  for (const t of ['session_validated_connections', 'session_connection_effects']) {
    assert.match(SQL, new RegExp(`create table if not exists public\\.${t}[\\s\\S]*?primary key \\(session_id`), t);
  }
});

test('rate limits: per-player burst kept at 6/min, plus a team failure budget', () => {
  const p = fn('propose_connection');
  assert.match(p, /c_player_per_min constant integer := 6;/);
  assert.match(p, /c_team_fail_max\s+constant integer := 20;/);
  assert.match(p, /c_team_window\s+constant interval := interval '10 minutes';/);
  assert.match(code(p), /a\.outcome = 'not_established'/);
});

test('node authorization reuses the authoritative 026 boundaries; title-only evidence is not known', () => {
  const k = fn('_connection_node_known');
  assert.match(k, /from public\.evidence_index\(p_session\) e\s+where upper\(e\.code\) = p_id and e\.readable/);
  assert.match(k, /public\._object_state_row_visible\(p_session, p_id\)/);
  assert.match(k, /return false;\s*end;/);
});

test('team state RPC exposes meanings and chapters only — no rule, condition or contradiction ids', () => {
  const st = code(fn('session_connection_state'));
  assert.match(st, /'meaning', r\.meaning/);
  assert.ok(!/'rule_id'|'rule'|condition_id|mark_contradiction/.test(st));
  assert.ok(!SQL.includes('function public.session_connections('), 'old rule-id-leaking RPC removed');
});

test('grants: internals never executable by clients; tables RPC-only', () => {
  for (const f of ['_connection_node_known(uuid, text, text)', '_apply_connection_effects(uuid, jsonb)']) {
    assert.match(SQL, new RegExp(`revoke all on function public\\.${f.replace(/[()]/g, '\\$&')}\\s+from public, anon, authenticated;`), f);
    assert.ok(!SQL.includes(`grant execute on function public.${f}`), f);
  }
  for (const f of ['propose_connection(uuid, jsonb, text)', 'settle_connection_effects(uuid)', 'session_connection_state(uuid)']) {
    assert.ok(SQL.includes(`grant execute on function public.${f}`), f);
  }
  for (const t of ['case_connection_rules', 'case_connection_conditions', 'session_connection_attempts', 'session_validated_connections', 'session_connection_effects']) {
    assert.match(SQL, new RegExp(`alter table public\\.${t}\\s+enable row level security;`), t);
    assert.match(SQL, new RegExp(`revoke all on table public\\.${t}\\s+from public, anon, authenticated;`), t);
  }
});

test('028 is a one-row, reversible, not-applied catalogue change; proposals are not migrations', () => {
  const s028 = readFileSync('sql/028_scene17_unpublish.sql', 'utf8');
  assert.match(s028, /STATUS: WRITTEN FOR REVIEW — NOT APPLIED\. PRODUCTION DATA CHANGE/);
  const statements = s028.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--')).join(' ');
  assert.equal(statements.replace(/\s+/g, ' ').trim(), "update public.cases set is_published = false where id = 'scene-17' and is_published = true;");
  for (const f of ['sql/029_case_channels_PROPOSAL.sql', 'sql/030_progressive_entities_PROPOSAL.sql']) {
    assert.match(readFileSync(f, 'utf8'), /NOT A MIGRATION\. DESIGN PROPOSAL ONLY/, f);
  }
});

// ------------------------------------------------------------
// ملفات التحقق الحية (تُشغَّل يدوياً بمحرر SQL): قراءة فقط، ومتطابقة مع 027
// ------------------------------------------------------------
const PRE = readFileSync('sql/verify_027_preapply.sql', 'utf8');
const POST = readFileSync('sql/verify_027_postapply.sql', 'utf8');
const body = (name: string) => {
  const f = fn(name);
  return f.slice(f.indexOf('as $$') + 5, f.lastIndexOf('$$;'));
};

test('verify files are a single read-only SELECT each (no mutating statement)', () => {
  for (const [name, sql] of [['pre', PRE], ['post', POST]] as const) {
    // بلا تعليقات وبلا محتوى النصوص الحرفية (قد تحوي ; أو كلمات مثل CREATE)
    const stmt = sql.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''").toLowerCase();
    assert.equal((stmt.match(/;/g) ?? []).length, 1, `${name}: exactly one statement`);
    assert.match(stmt.trim(), /^with[\s\S]*order by ord, check_name;$/, name);
    for (const bad of ['insert ', 'update ', 'delete ', 'drop ', 'alter ', 'create ', 'grant ', 'revoke ', 'truncate', 'perform ', 'propose_connection(', 'settle_connection_effects(']) {
      assert.ok(!stmt.includes(bad), `${name}: ${bad}`);
    }
  }
});

test('post-apply checks would pass on 027 exactly as written (needles present in the real bodies)', () => {
  const sqlLit = (s: string) => s.replace(/'/g, "''");
  const needles: [string, string][] = [
    ['_connection_node_known', 'from public.evidence_index(p_session) e'],
    ['_connection_node_known', 'e.readable'],
    ['_connection_node_known', 'public._object_state_row_visible(p_session, p_id)'],
    ['propose_connection', 'public._connection_node_known('],
    ['propose_connection', 'from public.case_connection_rules'],
    ['propose_connection', "where r.case_id = v_case and r.status = 'approved'"],
    ['propose_connection', "where c.case_id = v_case and c.status = 'approved'"],
    ['propose_connection', "interval '60 seconds'"],
    ['propose_connection', "a.outcome = 'not_established'"],
    ['propose_connection', "jsonb_build_object('status', 'validated', 'meaning', v_match.meaning)"],
    ['_apply_connection_effects', "'evidence_pending'"],
  ];
  for (const [f, needle] of needles) {
    assert.ok(body(f).includes(needle), `${f} body lacks: ${needle}`);
    assert.ok(POST.includes(sqlLit(needle)), `post-apply file lacks: ${needle}`);
  }
  const p = body('propose_connection');
  assert.ok(p.indexOf('public._connection_node_known(') < p.indexOf('from public.case_connection_rules'));
  assert.match(p, /c_player_per_min constant integer := 6;/);
  assert.match(p, /c_team_fail_max\s+constant integer := 20;/);
  assert.match(p, /c_team_window\s+constant interval := interval '10 minutes';/);
  assert.ok(!/raise exception/i.test(body('_apply_connection_effects')), 'N2 check holds');
  // pre-apply: نفس أسماء الجداول/الدوال التي ينشئها 027
  for (const t of ['case_connection_rules', 'case_connection_conditions', 'session_connection_attempts', 'session_validated_connections', 'session_connection_effects']) {
    assert.ok(PRE.includes(`'${t}'`) && POST.includes(`'${t}'`) && SQL.includes(`create table if not exists public.${t}`), t);
  }
  for (const f of ['_connection_node_known', '_apply_connection_effects', 'propose_connection', 'settle_connection_effects', 'session_connection_state']) {
    assert.ok(PRE.includes(`'${f}'`) && POST.includes(`'${f}'`), f);
  }
});

test('verifiers never pass "public" as a role name; PUBLIC is proven via ACLs (grantee 0, acldefault for NULL)', () => {
  for (const [name, sql] of [['pre', PRE], ['post', POST]] as const) {
    const roles = /client_roles\(name\) as \(values ([^)]*\)(?:, \([^)]*\))*)\)/.exec(sql);
    assert.ok(roles, `${name}: client_roles CTE`);
    assert.deepEqual([...roles![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]), ['anon', 'authenticated'], name);
    assert.ok(!/has_[a-z]+_privilege\(\s*'public'/i.test(sql), `${name}: literal 'public' role`);
    // every has_*_privilege role argument is a real role (r.name / current_user)
    for (const m of sql.matchAll(/has_[a-z]+_privilege\(\s*([^,]+),/gi)) {
      assert.ok(['r.name', 'current_user'].includes(m[1]!.trim()), `${name}: role arg ${m[1]}`);
    }
  }
  // pre: PUBLIC has no CREATE on schema public
  assert.match(PRE, /aclexplode\(coalesce\(n\.nspacl, acldefault\('n', n\.nspowner\)\)\) a\s+where n\.nspname = 'public' and a\.grantee = 0 and a\.privilege_type = 'CREATE'/);
  // post: PUBLIC has no table DML, no sequence use, no EXECUTE on the five functions
  assert.match(POST, /aclexplode\(coalesce\(c\.relacl, acldefault\('r', c\.relowner\)\)\) a[\s\S]*?a\.grantee = 0\s+and a\.privilege_type in \('SELECT', 'INSERT', 'UPDATE', 'DELETE'\)/);
  assert.match(POST, /aclexplode\(coalesce\(c\.relacl, acldefault\('s', c\.relowner\)\)\) a[\s\S]*?a\.grantee = 0\s+and a\.privilege_type in \('USAGE', 'SELECT', 'UPDATE'\)/);
  assert.match(POST, /aclexplode\(coalesce\(fn\.proacl, acldefault\('f', fn\.proowner\)\)\) a\s+where a\.grantee = 0 and a\.privilege_type = 'EXECUTE'/);
  assert.match(POST, /from fn\s*\n\s*-- B/, 'PUBLIC EXECUTE row covers every 027 function (from fn)');
  assert.match(POST, /p\.proacl, p\.proowner/);
});

test('MIGRATIONS.md has one authoritative 027 status (APPLIED + VERIFIED by Hazem, never re-run) and keeps 028 unapplied', () => {
  const md = readFileSync('sql/MIGRATIONS.md', 'utf8');
  const rows = md.split('\n').filter((l) => l.includes('027_validated_connections.sql'));
  assert.equal(rows.length, 1);
  assert.match(rows[0]!, /APPLIED \+ VERIFIED \(applied manually by Hazem/);
  assert.match(rows[0]!, /Never re-run/);
  assert.ok(!/027[^\n]*(written for review|READY TO APPLY)/i.test(md), 'no stale 027 status');
  assert.match(md, /`028` is \*\*not\*\* applied — keep unapplied/);
});
