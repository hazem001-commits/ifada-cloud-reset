// ============================================================
// tests/privacy/rowVisibilityHelper.test.ts
// public._object_state_row_visible (sql/026) قابلة للاستدعاء مباشرة من
// authenticated كـ RPC — لذلك يجب ألا تكشف أكثر مما يكشفه SELECT عبر
// سياسة session_object_state_select.
//
// (أ) نموذج خطوة بخطوة للمساعد وللسياسة، وإثبات تطابقهما شاملاً.
// (ب) فحص بنيوي لـ sql/026: كل شرط موجود بجسم المساعد نفسه، والسياسة،
//     وفحوص ما قبل التطبيق (قراءة فقط)، وتنظيف فحوص ما بعد التطبيق.
//     (لا Postgres محلي — التحقق الحي يدوي بعد الموافقة.)
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ancestorsKnown } from '../../src/lib/objectVisibility';

// ------------------------------------------------------------
// (أ) نموذج قاعدة البيانات
// ------------------------------------------------------------
const A = 'player-a';
const B = 'player-b';
const OUTSIDER = 'player-c';
const S = 'session-1';
const S2 = 'session-2';

interface Row {
  session: string;
  code: string;
  discovered: boolean;
  is_shared: boolean;
  discovered_by: string | null;
}

interface Db {
  members: Record<string, string[]>;
  sessionCase: Record<string, string>;
  objects: Record<string, Record<string, string | null>>;
  rows: Row[];
}

const norm = (c: string | null | undefined) => (c ?? '').trim().toUpperCase();

/** مطابق لـ _object_ancestors_known. */
function ancestorsKnownDb(db: Db, me: string, session: string, caseId: string, code: string): boolean {
  const objects = db.objects[caseId] ?? {};
  return ancestorsKnown(
    code,
    (c) => (c in objects ? objects[c] : undefined),
    (c) => {
      const r = db.rows.find((x) => x.session === session && x.code === c);
      return !!r && r.discovered && (r.is_shared || r.discovered_by === me);
    },
  );
}

/** مطابق لـ _object_state_row_visible بعد المراجعة — نفس ترتيب الخطوات بالـ SQL. */
function helper(db: Db, me: string, session: string | null, rawCode: string | null): boolean {
  const code = norm(rawCode);
  if (!session || !code) return false;
  if (!(db.members[session] ?? []).includes(me)) return false; // 1
  const caseId = db.sessionCase[session];
  if (!caseId) return false;
  const objects = db.objects[caseId] ?? {};
  if (!(code in objects)) return false; // 2
  const row = db.rows.find((r) => r.session === session && r.code === code);
  if (!row) return false; // 3
  if (!row.discovered) return false; // 4
  if (!(row.is_shared || row.discovered_by === me)) return false; // 5
  return ancestorsKnownDb(db, me, session, caseId, code); // 6
}

/** مطابق لسياسة session_object_state_select: الصفوف التي يعيدها SELECT مباشر. */
function selectRows(db: Db, me: string): Row[] {
  return db.rows.filter(
    (r) =>
      (db.members[r.session] ?? []).includes(me) &&
      r.discovered &&
      (r.is_shared || r.discovered_by === me) &&
      helper(db, me, r.session, r.code),
  );
}

/** ما يتعلّمه العميل عبر SELECT عن (جلسة، كود): هل يوجد صف؟ */
const selectReveals = (db: Db, me: string, session: string, code: string) =>
  selectRows(db, me).some((r) => r.session === session && r.code === norm(code));

// غرفة 714 (قضية room-714) + جذر إضافي خاص للاختبار.
const ROOM714: Record<string, string | null> = {
  ROOM_714: null,
  SECURITY_OFFICE: null,
  VICTIM_ITEMS: 'ROOM_714',
  PASSPORT: 'VICTIM_ITEMS',
  LAPTOP: 'ROOM_714',
};

type St = Omit<Row, 'session' | 'code'>;
const UNDISCOVERED: St = { discovered: false, is_shared: false, discovered_by: null };
const SHARED_ROOT: St = { discovered: true, is_shared: true, discovered_by: null };
const privateTo = (p: string): St => ({ discovered: true, is_shared: false, discovered_by: p });
const sharedBy = (p: string): St => ({ discovered: true, is_shared: true, discovered_by: p });

function room(states: Partial<Record<string, St>>, omitRows: string[] = []): Db {
  const base: Record<string, St> = {
    ROOM_714: SHARED_ROOT,
    SECURITY_OFFICE: SHARED_ROOT,
    VICTIM_ITEMS: UNDISCOVERED,
    PASSPORT: UNDISCOVERED,
    LAPTOP: UNDISCOVERED,
  };
  const merged = { ...base, ...states };
  return {
    members: { [S]: [A, B], [S2]: [OUTSIDER] },
    sessionCase: { [S]: 'room-714', [S2]: 'room-714' },
    objects: { 'room-714': ROOM714, 'scene-17': { OTHER_CASE_ONLY: null } },
    rows: [
      ...Object.keys(ROOM714)
        .filter((c) => !omitRows.includes(c))
        .map((code) => ({ session: S, code, ...(merged[code] as St) })),
      { session: S2, code: 'ROOM_714', ...SHARED_ROOT },
    ],
  };
}

test('teammate-private root object → helper false for the teammate', () => {
  const db = room({ SECURITY_OFFICE: privateTo(A) });
  assert.equal(helper(db, B, S, 'SECURITY_OFFICE'), false);
  assert.equal(selectReveals(db, B, S, 'SECURITY_OFFICE'), false);
  assert.equal(helper(db, A, S, 'SECURITY_OFFICE'), true, 'the discoverer still sees it');
});

test('teammate-private child with visible ancestors → false', () => {
  // ROOM_714 مشترك (الأب ظاهر للجميع) لكن VICTIM_ITEMS اكتشاف خاص لـ A.
  const db = room({ VICTIM_ITEMS: privateTo(A) });
  assert.equal(helper(db, B, S, 'VICTIM_ITEMS'), false);
  assert.equal(helper(db, B, S, 'victim_items '), false, 'normalised input changes nothing');
});

test('undiscovered object → false, even with a visible chain', () => {
  const db = room({ VICTIM_ITEMS: sharedBy(A) });
  for (const me of [A, B]) {
    assert.equal(helper(db, me, S, 'PASSPORT'), false);
    assert.equal(helper(db, me, S, 'LAPTOP'), false);
  }
});

test('nonexistent object → false (unknown code, other case, empty, missing state row)', () => {
  const db = room({ LAPTOP: sharedBy(A) }, ['LAPTOP']);
  for (const code of ['GHOST', 'OTHER_CASE_ONLY', '', '   ', null]) {
    assert.equal(helper(db, A, S, code), false, String(code));
  }
  // الكائن موجود بالقضية لكن لا صف حالة له بالجلسة
  assert.equal(helper(db, A, S, 'LAPTOP'), false);
});

test('non-member, unknown session, or another session → false', () => {
  const db = room({ VICTIM_ITEMS: sharedBy(A) });
  assert.equal(helper(db, OUTSIDER, S, 'ROOM_714'), false);
  assert.equal(helper(db, A, S2, 'ROOM_714'), false, 'A is not in session-2');
  assert.equal(helper(db, A, 'no-such-session', 'ROOM_714'), false);
  assert.equal(helper(db, A, null, 'ROOM_714'), false);
});

test('own private object → true', () => {
  const db = room({ VICTIM_ITEMS: privateTo(A), PASSPORT: privateTo(A) });
  assert.equal(helper(db, A, S, 'VICTIM_ITEMS'), true);
  assert.equal(helper(db, A, S, 'PASSPORT'), true);
});

test('shared object → true for every member', () => {
  const db = room({ VICTIM_ITEMS: sharedBy(A) });
  for (const me of [A, B]) {
    assert.equal(helper(db, me, S, 'VICTIM_ITEMS'), true);
    assert.equal(helper(db, me, S, 'ROOM_714'), true);
  }
});

test('hidden ancestor → false (even when the child row itself is shared or mine)', () => {
  // أ) الأب خاص لـ A والابن مشترك (مشاركة قديمة قبل 026)
  const sharedChild = room({ VICTIM_ITEMS: privateTo(A), PASSPORT: sharedBy(A) });
  assert.equal(helper(sharedChild, B, S, 'PASSPORT'), false);
  assert.equal(helper(sharedChild, A, S, 'PASSPORT'), true);
  // ب) B اكتشف الابن عبر الثغرة القديمة والأب ما زال خاصاً بـ A
  const leaked = room({ VICTIM_ITEMS: privateTo(A), PASSPORT: privateTo(B) });
  assert.equal(helper(leaked, B, S, 'PASSPORT'), false);
  // ج) الأب غير مكتشَف
  const undiscoveredParent = room({ PASSPORT: sharedBy(A) });
  assert.equal(helper(undiscoveredParent, A, S, 'PASSPORT'), false);
});

test('missing parent, cycle and over-deep chains → false through the helper too', () => {
  const on = (objects: Record<string, string | null>, codes: string[]): Db => ({
    members: { [S]: [A] },
    sessionCase: { [S]: 'c' },
    objects: { c: objects },
    rows: codes.map((code) => ({ session: S, code, ...sharedBy(A) })),
  });
  assert.equal(helper(on({ ORPHAN: 'NO_SUCH_PARENT' }, ['ORPHAN']), A, S, 'ORPHAN'), false);
  assert.equal(helper(on({ P: 'Q', Q: 'P' }, ['P', 'Q']), A, S, 'P'), false);
  const deep: Record<string, string | null> = { N0: null };
  for (let i = 1; i <= 9; i += 1) deep[`N${i}`] = `N${i - 1}`;
  assert.equal(helper(on(deep, Object.keys(deep)), A, S, 'N9'), false);
  assert.equal(helper(on(deep, Object.keys(deep)), A, S, 'N8'), true, 'the supported bound');
});

test('direct helper semantics match the SELECT policy semantics (exhaustive)', () => {
  // كل تركيبات الحالة لسلسلة ثلاثية تحت الغرفة + خصوصية الجذر نفسه.
  const options: St[] = [UNDISCOVERED, privateTo(A), privateTo(B), sharedBy(A), sharedBy(B)];
  const probeCodes = [...Object.keys(ROOM714), 'GHOST', 'OTHER_CASE_ONLY', 'passport', ''];
  let checked = 0;
  for (const root of [SHARED_ROOT, privateTo(A), UNDISCOVERED]) {
    for (const vi of options) {
      for (const pp of options) {
        for (const lt of options) {
          for (const omit of [[], ['VICTIM_ITEMS']]) {
            const db = room({ ROOM_714: root, VICTIM_ITEMS: vi, PASSPORT: pp, LAPTOP: lt }, omit);
            for (const me of [A, B, OUTSIDER]) {
              for (const session of [S, S2]) {
                for (const code of probeCodes) {
                  assert.equal(
                    helper(db, me, session, code),
                    selectReveals(db, me, session, code),
                    `${me} ${session} ${code} ${JSON.stringify({ root, vi, pp, lt, omit })}`,
                  );
                  checked += 1;
                }
              }
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 10_000);

  // والاتجاه العكسي: كل صف يعيده SELECT يقبله المساعد، وكل صف يقبله
  // المساعد يعيده SELECT — لا شيء يُعرف عبر أحدهما دون الآخر.
  const db = room({ VICTIM_ITEMS: privateTo(A), PASSPORT: privateTo(A), LAPTOP: sharedBy(B) });
  for (const me of [A, B, OUTSIDER]) {
    const viaSelect = selectRows(db, me).map((r) => `${r.session}:${r.code}`).sort();
    const viaHelper = db.rows.filter((r) => helper(db, me, r.session, r.code)).map((r) => `${r.session}:${r.code}`).sort();
    assert.deepEqual(viaHelper, viaSelect, me);
  }
});

// ------------------------------------------------------------
// (ب) sql/026 — فحص بنيوي (لا تشغيل)
// ------------------------------------------------------------
const SQL = readFileSync('sql/026_nested_object_visibility.sql', 'utf8');

function fn(name: string): string {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${name} missing from 026`);
  return SQL.slice(start, SQL.indexOf('$$;', SQL.indexOf('as $$', start)) + 3);
}

test('026 helper: checks the complete row itself, in order, failing closed', () => {
  const h = fn('_object_state_row_visible');
  assert.match(h, /returns boolean\s+language plpgsql\s+stable\s+security definer\s+set search_path = public/);
  const steps = [
    /if p_session is null or v_code = '' then\s*return false;/,
    /if not coalesce\(public\.is_session_member\(p_session\), false\) then\s*return false;/,
    /select s\.case_id into v_case from public\.sessions s where s\.id = p_session;\s*if not found or v_case is null then\s*return false;/,
    /from public\.investigation_objects o\s*where o\.case_id = v_case and upper\(trim\(o\.code\)\) = v_code;\s*if not found then\s*return false;/,
    /where sos\.session_id = p_session and sos\.object_code = v_obj;\s*if not found then\s*return false;/,
    /if not coalesce\(v_sos\.discovered, false\) then\s*return false;/,
    /if not \(coalesce\(v_sos\.is_shared, false\) or v_sos\.discovered_by = auth\.uid\(\)\) then\s*return false;/,
    /return coalesce\(public\._object_ancestors_known\(p_session, v_case, v_obj\), false\);\s*end;/,
  ];
  let at = 0;
  for (const re of steps) {
    const m = re.exec(h.slice(at));
    assert.ok(m, `missing or out of order: ${re}`);
    at += m.index + m[0].length;
  }
  // الطريق الوحيد إلى true هو السطر الأخير — لا "return true" مبكر.
  assert.ok(!/return true/.test(h));
  assert.equal((h.match(/\breturn\b/g) ?? []).length, 8);
});

test('026 policy: row columns inline + the same helper; nothing looser', () => {
  const start = SQL.indexOf('create policy session_object_state_select');
  const policy = SQL.slice(start, SQL.indexOf(');', start) + 2);
  assert.match(
    policy,
    /for select to authenticated\s+using \(\s*public\.is_session_member\(session_id\)\s+and discovered\s+(--[^\n]*)?\s*and \(is_shared or discovered_by = auth\.uid\(\)\)\s+and public\._object_state_row_visible\(session_id, object_code\)/,
  );
  assert.ok(!/\bor\b/i.test(policy.replace('is_shared or discovered_by', '')), 'no extra OR branch');
  assert.equal((SQL.match(/create policy/g) ?? []).length, 1);
});

test('026 pre-apply checks: present before any DDL, fully commented, read-only', () => {
  const head = SQL.indexOf('-- PRE-APPLY CHECKS — READ-ONLY');
  const firstDdl = SQL.indexOf('create or replace function');
  assert.ok(head > 0 && head < firstDdl);
  const block = SQL.slice(head, firstDdl);
  for (const line of block.split('\n')) {
    if (line.trim()) assert.ok(line.trimStart().startsWith('--'), `uncommented pre-apply line: ${line}`);
  }
  assert.ok(!/^--\s+(insert into|update public|delete from|alter |drop |grant |revoke |truncate|create (or replace|table|policy|function))/im.test(block));
  // الملكية، CREATE على schema public، RLS مفعّل وغير مفروض، ولا سياسة SELECT إضافية.
  assert.match(block, /pg_get_userbyid\(c\.relowner\) = current_user as owned_by_current_user/);
  assert.match(block, /pg_get_userbyid\(p\.proowner\) = current_user/);
  assert.match(block, /r\.rolbypassrls/);
  assert.match(block, /has_schema_privilege\(r\.rolname, 'public', 'CREATE'\)/);
  assert.match(block, /\(values \('public'\), \('anon'\), \('authenticated'\)\)/);
  assert.match(block, /c\.relrowsecurity\s+as rls_enabled/);
  assert.match(block, /c\.relforcerowsecurity as rls_forced/);
  assert.match(block, /tablename = 'session_object_state'/);
  for (const t of ['session_object_state', 'investigation_objects', 'sessions', 'session_members']) {
    assert.ok(block.includes(`'${t}'`), t);
  }
  assert.match(block, /STOP, do not apply/);
});

test('026 post-apply verification: honest heading, schema-scoped catalog queries', () => {
  const v = SQL.slice(SQL.indexOf('-- POST-APPLY VERIFICATION'));
  assert.ok(!SQL.includes('POST-APPLY VERIFICATION (read-only'));
  assert.match(v, /Checks 1–3: READ-ONLY/);
  assert.match(v, /Check 4:\s+MUTATING — TEST SESSION ONLY/);
  const q1 = v.slice(v.indexOf('-- 1. [READ-ONLY]'), v.indexOf('-- 2. [READ-ONLY]'));
  const q2 = v.slice(v.indexOf('-- 2. [READ-ONLY]'), v.indexOf('-- 3. [READ-ONLY]'));
  const q4 = v.slice(v.indexOf('-- 4. [MUTATING — TEST SESSION ONLY]'));
  for (const q of [q1, q2]) assert.match(q, /where p\.pronamespace = 'public'::regnamespace/);
  assert.ok(q4.length > 0);
  // كل سطور التحقق تعليقات
  for (const line of v.split('\n')) {
    if (line.trim()) assert.ok(line.trimStart().startsWith('--'), `uncommented verification line: ${line}`);
  }
});
