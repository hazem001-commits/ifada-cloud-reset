// ============================================================
// tests/connections/sql034.test.ts
// 034 (قفل جداول اللوحة القديمة) — صلاحيات فقط، لا بيانات؛ وملفا التحقق
// قراءة فقط باستعلام SELECT واحد لكل منهما.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SQL = readFileSync('sql/034_lock_legacy_board.sql', 'utf8');
const PRE = readFileSync('sql/verify_034_preapply.sql', 'utf8');
const POST = readFileSync('sql/verify_034_postapply.sql', 'utf8');
const code = (s: string) => s.replace(/--[^\n]*/g, '').toLowerCase();

test('034 is permissions-only: locks client writes on exactly the two legacy tables, keeps member reads, deletes nothing', () => {
  assert.match(SQL, /STATUS: WRITTEN FOR REVIEW — NOT APPLIED/);
  const c = code(SQL);
  for (const t of ['board_notes', 'board_links']) {
    assert.ok(c.includes(`revoke all on table public.${t} from public, anon;`), t);
    assert.ok(c.includes(`revoke insert, update, delete, truncate, references, trigger on table public.${t} from authenticated;`), t);
    assert.ok(!new RegExp(`drop policy if exists ${t}_select`).test(c), `${t}: member SELECT policy is kept`);
  }
  for (const p of ['board_notes_insert', 'board_notes_update', 'board_notes_delete', 'board_links_insert', 'board_links_delete']) {
    assert.ok(c.includes(`drop policy if exists ${p} on public.`), p);
  }
  for (const bad of ['delete from', 'truncate table', 'drop table', 'insert into', 'update public', 'publication', 'grant ', 'board_items', 'board_threads', 'board_validations']) {
    assert.ok(!c.includes(bad), bad);
  }
  // كل جملة تنفيذية تخص الجدولين القديمين فقط
  for (const stmt of c.split(';').map((x) => x.trim()).filter(Boolean)) assert.match(stmt, /public\.board_(notes|links)\b/, stmt);
});

test('verify_034 files: single read-only SELECT each, PUBLIC via ACL only', () => {
  for (const [name, sql] of [['pre', PRE], ['post', POST]] as const) {
    const stmt = sql.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''").toLowerCase();
    assert.equal((stmt.match(/;/g) ?? []).length, 1, name);
    assert.match(stmt.trim(), /^with[\s\S]*order by ord, check_name;$/, name);
    for (const bad of ['insert ', 'update ', 'delete ', 'drop ', 'alter ', 'create ', 'grant ', 'revoke ', 'truncate', 'perform ']) {
      assert.ok(!stmt.includes(bad), `${name}: ${bad}`);
    }
    assert.ok(!/has_[a-z]+_privilege\(\s*'public'/i.test(sql), `${name}: PUBLIC via ACL only`);
  }
  // قبل: 031 حي + لا شيء يعتمد على كتابة القديم. بعد: مقفل + 031 سليم.
  assert.match(PRE, /P3a no function in public references a legacy board table/);
  assert.match(PRE, /P3c no legacy writes since the Board V2 switch baseline/);
  for (const f of ['pin_board_material', 'test_board_selection', '_board_material_team_visible']) assert.ok(PRE.includes(`'${f}'`), f);
  assert.match(POST, /'TRUNCATE'/);
  assert.match(POST, /L3 authenticated keeps SELECT/);
  assert.match(POST, /V3 authenticated can still EXECUTE 031 RPC/);
});
