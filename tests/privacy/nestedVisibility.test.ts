// ============================================================
// tests/privacy/nestedVisibility.test.ts
// "ظهور الابن يتطلب ظهور سلسلة الآباء" — مغلق عند الشك.
//
// (أ) نموذج حالة الجلسة بنفس خوارزمية public._object_ancestors_known
//     (src/lib/objectVisibility.ts) لسيناريوهات اللاعبَين.
// (ب) دفاع scene-media الثاني فوق صفوف فهرس اللاعب.
// (ج) فحص بنيوي لـ sql/026: كل دالة تعرض/تلمس عنصراً تحمل الشرط،
//     بنفس الخطأ المحايد، والمساعد غير مكشوف للعملاء. (لا Postgres
//     محلي — تطبيق 026 والتحقق الحي يتمّان يدوياً بعد الموافقة.)
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_ANCESTOR_DEPTH, ancestorsKnown, ancestorsKnownInRows, type IndexRow } from '../../src/lib/objectVisibility';
import { resolveObjectView } from '../../src/lib/sceneMedia';

// ------------------------------------------------------------
// نموذج قاعدة البيانات: عناصر القضية + حالة الجلسة لكل عنصر
// ------------------------------------------------------------
const A = 'player-a';
const B = 'player-b';

interface State {
  discovered: boolean;
  is_shared: boolean;
  discovered_by: string | null;
}

const ROOM714: Record<string, string | null> = {
  ROOM_714: null,
  VICTIM_ITEMS: 'ROOM_714',
  PASSPORT: 'VICTIM_ITEMS',
  LAPTOP: 'ROOM_714',
  GLASS_CUP: 'ROOM_714',
  BLOOD_STAIN: 'GLASS_CUP',
};

function world(overrides: Record<string, Partial<State>>): Record<string, State> {
  const base: Record<string, State> = {};
  for (const code of Object.keys(ROOM714)) {
    const root = ROOM714[code] === null;
    base[code] = { discovered: root, is_shared: root, discovered_by: null };
  }
  for (const [code, o] of Object.entries(overrides)) base[code] = { ...(base[code] as State), ...o };
  return base;
}

/** مطابق لـ SQL: السلف موجود، مكتشَف، ومشترك أو اكتشاف المستدعي. */
function dbAncestorsKnown(objects: Record<string, string | null>, states: Record<string, State>, me: string, code: string) {
  return ancestorsKnown(
    code,
    (c) => (c in objects ? objects[c] : undefined),
    (c) => {
      const s = states[c];
      return !!s && s.discovered && (s.is_shared || s.discovered_by === me);
    },
  );
}

/** investigation_object_index بعد 026: العنصر مُدرج فقط إذا سلسلة آبائه معروفة للمستدعي. */
function indexFor(states: Record<string, State>, me: string): string[] {
  return Object.keys(ROOM714).filter((c) => dbAncestorsKnown(ROOM714, states, me, c));
}

// A اكتشف أغراض الطاولة سراً ولم يشاركها.
const privateParent = world({ VICTIM_ITEMS: { discovered: true, is_shared: false, discovered_by: A } });
// ثم شاركها.
const sharedParent = world({ VICTIM_ITEMS: { discovered: true, is_shared: true, discovered_by: A } });

// 1
test('parent private to A: A sees the child PASSPORT', () => {
  assert.ok(indexFor(privateParent, A).includes('PASSPORT'));
});

// 2
test('same state: B cannot see (or learn of) PASSPORT', () => {
  const forB = indexFor(privateParent, B);
  assert.ok(!forB.includes('PASSPORT'));
  // الأب نفسه يبقى إشارة الوجود المحجوبة المعتمدة (عنصر جذري) — دون أبنائه.
  assert.ok(forB.includes('VICTIM_ITEMS'));
});

// 3
test('parent shared: PASSPORT becomes visible to B under its normal rules', () => {
  assert.ok(indexFor(sharedParent, B).includes('PASSPORT'));
});

// 8
test('root/room-level objects behave exactly as before for everyone', () => {
  for (const me of [A, B]) {
    for (const code of ['ROOM_714', 'VICTIM_ITEMS', 'LAPTOP', 'GLASS_CUP']) {
      assert.ok(dbAncestorsKnown(ROOM714, privateParent, me, code), `${code} for ${me}`);
    }
  }
});

// 9
test('three-level nesting requires every ancestor to be visible', () => {
  const objects = { ROOT: null, X: 'ROOT', Y: 'X', Z: 'Y' };
  const known = (states: Record<string, State>, me: string) => dbAncestorsKnown(objects, states, me, 'Z');
  const all = (o: Partial<Record<string, Partial<State>>>) => ({
    ROOT: { discovered: true, is_shared: true, discovered_by: null },
    X: { discovered: true, is_shared: true, discovered_by: A, ...o.X },
    Y: { discovered: true, is_shared: true, discovered_by: A, ...o.Y },
    Z: { discovered: false, is_shared: false, discovered_by: null },
  });
  assert.equal(known(all({}), B), true);
  assert.equal(known(all({ Y: { is_shared: false } }), B), false, 'direct parent private');
  assert.equal(known(all({ X: { is_shared: false } }), B), false, 'grandparent private');
  assert.equal(known(all({ X: { discovered: false } }), B), false, 'grandparent undiscovered');
  assert.equal(known(all({ X: { is_shared: false }, Y: { is_shared: false } }), A), true, 'owner of both');
});

// 10
test('missing parent reference fails closed', () => {
  const objects = { ROOT: null, ORPHAN: 'NO_SUCH_PARENT' };
  const states = { ROOT: { discovered: true, is_shared: true, discovered_by: null } };
  assert.equal(dbAncestorsKnown(objects, states, A, 'ORPHAN'), false);
  // والعنصر غير الموجود نفسه
  assert.equal(dbAncestorsKnown(objects, states, A, 'GHOST'), false);
});

// 11
test('cyclic parent chain fails closed', () => {
  const objects = { P: 'Q', Q: 'P', SELF: 'SELF' };
  const states = {
    P: { discovered: true, is_shared: true, discovered_by: null },
    Q: { discovered: true, is_shared: true, discovered_by: null },
    SELF: { discovered: true, is_shared: true, discovered_by: null },
  };
  assert.equal(dbAncestorsKnown(objects, states, A, 'P'), false);
  assert.equal(dbAncestorsKnown(objects, states, A, 'SELF'), false);
});

// 12
test('excessive nesting fails closed; the supported depth still works', () => {
  const chain = (levels: number) => {
    const objects: Record<string, string | null> = { N0: null };
    const states: Record<string, State> = { N0: { discovered: true, is_shared: true, discovered_by: null } };
    for (let i = 1; i <= levels; i += 1) {
      objects[`N${i}`] = `N${i - 1}`;
      states[`N${i}`] = { discovered: true, is_shared: true, discovered_by: null };
    }
    return dbAncestorsKnown(objects, states, A, `N${levels}`);
  };
  assert.equal(chain(MAX_ANCESTOR_DEPTH), true, 'exactly the bound');
  assert.equal(chain(MAX_ANCESTOR_DEPTH + 1), false, 'one past the bound');
});

// ------------------------------------------------------------
// (ب) scene-media: دفاع ثانٍ فوق صفوف فهرس اللاعب
// ------------------------------------------------------------
const r = (code: string, parent: string | null, discovered: boolean, state: string): IndexRow => ({
  code,
  parent_code: parent,
  discovered,
  state,
});
const ROOM = r('ROOM_714', null, true, 'KNOWN');

// 7
test('scene-media close-up cannot bypass a hidden parent (even on the pre-026 index)', () => {
  // فهرس B اليوم (قبل 026): الأب محجوب (HIDDEN) والابن ظاهر.
  const leakyUndiscovered = [ROOM, r('VICTIM_ITEMS', 'ROOM_714', true, 'HIDDEN'), r('PASSPORT', 'VICTIM_ITEMS', false, 'UNKNOWN')];
  // B اكتشف الجواز عبر ثغرة التفاعل القديمة والأب ما زال خاصاً بـ A.
  const leakyDiscovered = [ROOM, r('VICTIM_ITEMS', 'ROOM_714', true, 'HIDDEN'), r('PASSPORT', 'VICTIM_ITEMS', true, 'DISCOVERED')];
  assert.equal(resolveObjectView('room-714', 'PASSPORT', 'passport', leakyUndiscovered), null);
  assert.equal(resolveObjectView('room-714', 'PASSPORT', 'passport', leakyDiscovered), null);
  assert.equal(ancestorsKnownInRows(leakyDiscovered, 'PASSPORT'), false);
});

// 13
test('hidden / private / missing-parent / cyclic / nonexistent / invalid are indistinguishable', () => {
  const cases: IndexRow[][] = [
    [ROOM, r('VICTIM_ITEMS', 'ROOM_714', true, 'HIDDEN'), r('PASSPORT', 'VICTIM_ITEMS', true, 'DISCOVERED')], // private parent
    [ROOM, r('PASSPORT', 'VICTIM_ITEMS', true, 'DISCOVERED')], // parent row missing
    [ROOM, r('VICTIM_ITEMS', 'PASSPORT', true, 'DISCOVERED'), r('PASSPORT', 'VICTIM_ITEMS', true, 'DISCOVERED')], // cycle
    [ROOM, r('VICTIM_ITEMS', 'ROOM_714', true, 'DISCOVERED'), r('PASSPORT', 'VICTIM_ITEMS', true, 'HIDDEN')], // child itself private
    [ROOM, r('VICTIM_ITEMS', 'ROOM_714', true, 'DISCOVERED')], // child absent
  ];
  const results = cases.map((rows) => resolveObjectView('room-714', 'PASSPORT', 'passport', rows));
  results.push(resolveObjectView('room-714', 'PASSPORT', 'wallet', [ROOM, r('VICTIM_ITEMS', 'ROOM_714', true, 'DISCOVERED'), r('PASSPORT', 'VICTIM_ITEMS', true, 'DISCOVERED')]));
  results.push(resolveObjectView('room-714', 'NOPE', 'passport', [ROOM]));
  assert.ok(results.every((x) => x === null));

  // والـ route يحوّل كل null لنفس الرد المحايد الوحيد.
  const route = readFileSync('src/app/api/scene-media/route.ts', 'utf8');
  assert.match(route, /if \(!objectPath\) \{\s*return fail\("SCENE_NOT_FOUND", 404\);/);
  assert.equal((route.match(/SCENE_NOT_FOUND/g) ?? []).length, 1);
});

// 14
test('the owning player still gets PASSPORT and VICTIM_ITEMS close-ups', () => {
  // A اكتشف الأب والابن سراً — فهرس A يُظهرهما له (لا HIDDEN).
  const ownerRows = [ROOM, r('VICTIM_ITEMS', 'ROOM_714', true, 'DISCOVERED'), r('PASSPORT', 'VICTIM_ITEMS', true, 'DISCOVERED')];
  assert.equal(resolveObjectView('room-714', 'PASSPORT', 'passport', ownerRows), 'room-714/objects/passport-01.png');
  assert.equal(resolveObjectView('room-714', 'VICTIM_ITEMS', 'phone', ownerRows), 'room-714/objects/phone-01.png');
});

// ------------------------------------------------------------
// (ج) sql/026 — فحص بنيوي (لا تشغيل)
// ------------------------------------------------------------
const SQL = readFileSync('sql/026_nested_object_visibility.sql', 'utf8');

function fn(name: string): string {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${name} missing from 026`);
  return SQL.slice(start, SQL.indexOf('$$;', SQL.indexOf('as $$', start)) + 3);
}

// 4
test('026: direct interaction cannot bypass a hidden parent (neutral OBJECT_NOT_FOUND, before any other check)', () => {
  const body = fn('execute_object_interaction');
  const check = body.indexOf('if not public._object_ancestors_known(p_session, v_case, v_obj.code) then');
  assert.ok(check > 0);
  assert.match(body.slice(check, check + 200), /raise exception 'OBJECT_NOT_FOUND'/);
  assert.ok(check < body.indexOf("'INTERACTION_NOT_FOUND'"), 'must run before interaction/spec/state checks');
  // المشاركة كذلك: مثل عنصر غير مكتشَف.
  const share = fn('share_object_discovery');
  assert.match(share, /_object_ancestors_known\(p_session, v_case, v_sos\.object_code\) then\s*raise exception 'NOT_DISCOVERED'/);
});

// 5
test('026: challenge index and run cannot bypass a hidden parent', () => {
  assert.match(fn('challenge_index'), /and public\._object_ancestors_known\(p_session, v_case, c\.object_code\)/);
  assert.match(
    fn('_run_challenge'),
    /or not public\._object_ancestors_known\(p_session, v_case, v_ch\.object_code\) then\s*(--[^\n]*)?\s*raise exception 'CHALLENGE_NOT_FOUND'/,
  );
});

// 6
test('026: workspace and provenance cannot bypass a hidden parent', () => {
  assert.match(fn('object_workspace'), /and public\._object_ancestors_known\(p_session, v_case, o\.code\)/);
  assert.equal((fn('evidence_provenance').match(/_object_ancestors_known\(p_session, v_case, o\.code\)/g) ?? []).length, 2);
});

test('026: the index replaces "parent discovered by anyone" with the ancestor chain', () => {
  const idx = fn('investigation_object_index');
  assert.ok(!idx.includes('parent_sos.discovered'));
  assert.match(idx, /and public\._object_ancestors_known\(p_session, v_case, o\.code\)/);
});

test('026: helper fails closed on missing parent, cycle and depth — same bound as the code', () => {
  const helper = fn('_object_ancestors_known');
  assert.match(helper, new RegExp(`c_max_depth constant integer := ${MAX_ANCESTOR_DEPTH};`));
  assert.match(helper, /if v_depth > c_max_depth then\s*return false;/);
  assert.match(helper, /if v_parent = any\(v_seen\) then\s*return false;/);
  assert.ok((helper.match(/if not found then\s*return false;/g) ?? []).length >= 2, 'unknown object + missing parent');
  assert.match(helper, /v_sos\.discovered_by = auth\.uid\(\)/);
});

test('026: helper never exposed to clients; policy helper only to authenticated; RLS covers SELECT + realtime', () => {
  assert.match(SQL, /revoke all on function public\._object_ancestors_known\(uuid, text, text\) from public, anon, authenticated;/);
  assert.ok(!/grant execute on function public\._object_ancestors_known/.test(SQL));
  assert.match(SQL, /grant execute on function public\._object_state_row_visible\(uuid, text\) to authenticated;/);
  assert.ok(!/grant execute on function public\._object_state_row_visible\(uuid, text\) to (anon|public)/.test(SQL));
  assert.match(SQL, /create policy session_object_state_select[\s\S]*public\._object_state_row_visible\(session_id, object_code\)/);
});

test('026: no destructive top-level statements, and it is marked NOT APPLIED', () => {
  // أجسام الدوال (بين $$ … $$) نسخ حرفية من 025/019 وفيها insert/update
  // الأصلية (سجل المحاولات، المصدر، الحالة) — نفحص التعليمات العليا فقط.
  const topLevel = SQL.replace(/as \$\$[\s\S]*?\$\$;/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toLowerCase();
  for (const bad of ['drop table', 'truncate', 'delete from', 'alter table', 'drop function', 'insert into', 'update public.']) {
    assert.ok(!topLevel.includes(bad), `unexpected top-level: ${bad}`);
  }
  assert.match(SQL, /STATUS: WRITTEN FOR REVIEW — NOT APPLIED/);
});
