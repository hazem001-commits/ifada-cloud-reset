// ============================================================
// tests/connections/sql031.test.ts
// 031 (Board V2) — فحص بنيوي بعد مراجعة الأمان + اتساق ملفات التحقق.
// (لا Postgres محلي: التحقق الحي يدوي بالملفات verify_031_*.sql.)
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SQL = readFileSync('sql/031_board_v2.sql', 'utf8');
const PRE = readFileSync('sql/verify_031_preapply.sql', 'utf8');
const POST = readFileSync('sql/verify_031_postapply.sql', 'utf8');
const code = (s: string) => s.replace(/--[^\n]*/g, '');
const fn = (name: string) => {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, name);
  return SQL.slice(start, SQL.indexOf('$$;', SQL.indexOf('as $$', start)) + 3);
};
const body = (name: string) => {
  const f = fn(name);
  return f.slice(f.indexOf('as $$') + 5, f.lastIndexOf('$$;'));
};
const FUNCS = [
  '_board_material_team_visible',
  'pin_board_material',
  'add_board_reasoning',
  'move_board_item',
  'edit_board_reasoning',
  'remove_board_item',
  'link_board_items',
  'unlink_board_thread',
  'test_board_selection',
];

test('031 is a review draft; every function is SECURITY DEFINER with a fixed search_path and qualified relations', () => {
  assert.match(SQL, /STATUS: WRITTEN FOR REVIEW — NOT APPLIED/);
  const defined = [...SQL.matchAll(/create or replace function public\.([a-z_]+)\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(defined, [...FUNCS].sort());
  for (const name of FUNCS) {
    assert.match(fn(name), /security definer\s+set search_path = public/, name);
    for (const r of [...code(body(name)).matchAll(/\b(?:from|join|insert into|update|delete from)\s+([a-z_][a-z0-9_.]*)/gi)].map((m) => m[1]!)) {
      assert.ok(r.startsWith('public.') || ['unnest'].includes(r), `${name}: unqualified ${r}`);
    }
  }
});

test('material authorization: evidence needs case policy "title" (no row = hidden); objects reuse 026 + require a shared chain', () => {
  const v = code(body('_board_material_team_visible'));
  assert.match(v, /coalesce\(\(select p\.restricted_evidence from public\.case_engine_policy p where p\.case_id = v_case\), 'hidden'\) <> 'title'/);
  assert.match(v, /public\._object_state_row_visible\(p_session, v_code\)/, '026 boundary reused');
  assert.ok(v.indexOf('_object_state_row_visible') < v.indexOf('sos.discovered and sos.is_shared'), '026 first, then shared chain');
  assert.equal((v.match(/sos\.discovered and sos\.is_shared/g) ?? []).length, 2, 'object AND every ancestor shared');
  // Scene 17 never gets a policy row → its evidence is never pinnable
  assert.match(SQL, /select 'room-714', 'title'/);
  assert.ok(!/'scene-17'/.test(code(SQL)), 'no scene-17 policy row');
  assert.match(code(body('pin_board_material')), /if not public\._board_material_team_visible\(p_session, p_kind, p_code\) then\s*raise exception 'NOT_PINNABLE';/);
});

test('no stored labels: material rows are forced to empty text and store only an uppercase ref', () => {
  assert.match(SQL, /check \(kind <> 'material' or text = ''\)/);
  assert.match(SQL, /material_code text check \(material_code ~ '\^\[A-Z0-9_-\]\{1,64\}\$'\)/);
  assert.match(code(body('pin_board_material')), /values \(p_session, 'material', p_kind, upper\(trim\(p_code\)\), '',/);
});

test('reasoning: ≤400 chars, author-only edit/delete with membership, no cross-session links', () => {
  assert.match(SQL, /check \(char_length\(text\) <= 400\)/);
  assert.match(code(body('edit_board_reasoning')), /i\.author_id = auth\.uid\(\)\s+and public\.is_session_member\(i\.session_id\)/);
  assert.match(code(body('remove_board_item')), /\(i\.kind = 'material' or i\.author_id = auth\.uid\(\)\)/);
  assert.match(code(body('unlink_board_thread')), /t\.author_id = auth\.uid\(\) and public\.is_session_member\(t\.session_id\)/);
  assert.match(code(body('link_board_items')), /where id in \(p_from, p_to\) and session_id = p_session\) <> 2/);
});

test('validated state is server-only and unforgeable', () => {
  assert.match(SQL, /kind\s+text not null check \(kind in \('tentative','support','tension'\)\)/);
  assert.ok(!/'validated'\)/.test(SQL.slice(SQL.indexOf('create table if not exists public.board_threads'), SQL.indexOf('create index if not exists board_threads_session_idx'))));
  assert.ok(!/rule_id/.test(SQL.slice(SQL.indexOf('create table if not exists public.board_validations'), SQL.indexOf('create index if not exists board_validations_session_idx'))));
  // only test_board_selection writes it; clients get SELECT only
  for (const name of FUNCS) {
    const writes = /insert into public\.board_validations/.test(body(name));
    assert.equal(writes, name === 'test_board_selection', name);
  }
  assert.ok(!/grant (insert|update|delete|all)[^;]*board_validations/i.test(SQL));
  // through 027 as the caller, no second matcher
  const t = code(body('test_board_selection'));
  assert.match(t, /v_result := public\.propose_connection\(p_session, v_nodes, null\);/);
  assert.ok(!/case_connection_rules/.test(t));
  assert.match(t, /where i\.id = any\(p_items\) and i\.session_id = p_session and i\.kind = 'material'/);
});

test('RLS: one permissive SELECT policy per board table, nothing for case_engine_policy, writes RPC-only, realtime published', () => {
  for (const t of ['board_items', 'board_threads', 'board_validations']) {
    assert.match(SQL, new RegExp(`create policy ${t}_select on public\\.${t}\\s+for select to authenticated using \\(public\\.is_session_member\\(session_id\\)\\);`), t);
    assert.ok(!new RegExp(`create policy \\w+ on public\\.${t}\\s+for (insert|update|delete|all)`).test(SQL), t);
    assert.match(SQL, new RegExp(`grant select on table public\\.${t}\\s+to authenticated;`), t);
  }
  assert.ok(!/create policy [^;]* on public\.case_engine_policy/.test(SQL));
  assert.match(SQL, /revoke all on table public\.case_engine_policy from public, anon, authenticated;/);
  assert.match(SQL, /revoke all on function public\._board_material_team_visible\(uuid, text, text\) from public, anon, authenticated;/);
  assert.match(SQL, /array\['board_items', 'board_threads', 'board_validations'\]/);
});

test('031 does not touch legacy tables, evidence, discovery state or 027 objects', () => {
  const top = code(SQL.replace(/as \$\$[\s\S]*?\$\$;/g, '')).toLowerCase();
  for (const bad of ['board_notes', 'board_links', 'session_object_state', 'session_evidence ', 'case_connection_rules', 'drop table', 'truncate', 'delete from']) {
    assert.ok(!top.includes(bad), bad);
  }
  for (const name of FUNCS) {
    assert.ok(!/update public\.(session_object_state|session_evidence|evidence)\b|insert into public\.(session_object_state|session_evidence)\b/.test(body(name)), name);
  }
});

test('verify files: single read-only SELECT each; post-apply needles match the real 031 bodies', () => {
  for (const [name, sql] of [['pre', PRE], ['post', POST]] as const) {
    const stmt = sql.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''").toLowerCase();
    assert.equal((stmt.match(/;/g) ?? []).length, 1, name);
    assert.match(stmt.trim(), /^with[\s\S]*order by ord, check_name;$/, name);
    for (const bad of ['insert ', 'update ', 'delete ', 'drop ', 'alter ', 'create ', 'grant ', 'revoke ', 'truncate', 'perform ']) {
      assert.ok(!stmt.includes(bad), `${name}: ${bad}`);
    }
    assert.ok(!/has_[a-z]+_privilege\(\s*'public'/i.test(sql), `${name}: PUBLIC via ACL only`);
    assert.match(sql, /client_roles\(name\) as \(values \('anon'\), \('authenticated'\)\)/);
  }
  const lit = (s: string) => s.replace(/'/g, "''");
  const needles: [string, string][] = [
    ['pin_board_material', 'public._board_material_team_visible(p_session, p_kind, p_code)'],
    ['pin_board_material', "'NOT_PINNABLE'"],
    ['_board_material_team_visible', 'from public.case_engine_policy'],
    ['_board_material_team_visible', "'hidden') <> 'title'"],
    ['_board_material_team_visible', 'public._object_state_row_visible(p_session, v_code)'],
    ['_board_material_team_visible', 'sos.discovered and sos.is_shared'],
    ['test_board_selection', 'public.propose_connection(p_session, v_nodes, null)'],
    ['test_board_selection', 'insert into public.board_validations'],
  ];
  for (const [f, n] of needles) {
    assert.ok(body(f).includes(n), `${f} lacks ${n}`);
    assert.ok(POST.includes(lit(n)), `post-apply lacks ${n}`);
  }
  for (const f of FUNCS) assert.ok(PRE.includes(`'${f}'`) && POST.includes(`'${f}'`), f);
  for (const t of ['case_engine_policy', 'board_items', 'board_threads', 'board_validations']) assert.ok(PRE.includes(`'${t}'`) && POST.includes(`'${t}'`), t);
  // pre-apply pins the exact 026/027 signatures 031 calls
  assert.match(PRE, /\('propose_connection',\s+'p_session uuid, p_nodes jsonb, p_relation text'\)/);
  assert.match(PRE, /\('_object_state_row_visible',\s+'p_session uuid, p_object_code text'\)/);
});
