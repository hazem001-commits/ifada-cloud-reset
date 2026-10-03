// ============================================================
// tests/scene/objectMedia.test.ts
// Scene Object Media — Slice 1: لقطات قريبة للجواز والهاتف والمحفظة.
// ليست أدلة. تُمنح فقط لعنصر يعرفه اللاعب (مكتشَف، ليس خاصاً لزميل)،
// عبر نفس مسار scene-media الخاص، ومساراتها بالسيرفر وحده.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OBJECT_VIEW_ALLOWLIST, SCENE_ALLOWLIST, resolveObjectView, type VisibleObjectRow } from '../../src/lib/sceneMedia';
import { closeUpViewsFor as closeUpViewsIn } from '../../src/app/case/[code]/investigation/scene/objectViews';
import { ROOM_714_PRESENTATION } from '../../src/cases/room-714/presentation';
import type { InvestigationObject } from '../../src/types/investigationObjects';

// غرفة 714: لقطاتها من عرض قضيتها (caseId → عرض → كود العنصر).
const OBJECT_VIEWS = ROOM_714_PRESENTATION.objectViews;
const closeUpViewsFor = (o: InvestigationObject | undefined) => closeUpViewsIn(o, OBJECT_VIEWS);

const PARENTS: Record<string, string | null> = {
  ROOM_714: null,
  VICTIM_ITEMS: 'ROOM_714',
  PASSPORT: 'VICTIM_ITEMS',
  BLOOD_STAIN: 'GLASS_CUP',
  GLASS_CUP: 'ROOM_714',
};
const row = (code: string, discovered: boolean, state: string): VisibleObjectRow => ({
  code,
  parent_code: PARENTS[code] ?? null,
  discovered,
  state,
});
// الغرفة نفسها: جذر مكتشَف ومشترك دائماً (sql/020).
const ROOM = row('ROOM_714', true, 'KNOWN');

function obj(code: string, over: Partial<InvestigationObject> = {}): InvestigationObject {
  return {
    code,
    category: 'object',
    parent_code: 'ROOM_714',
    title: code,
    description: '',
    state: 'DISCOVERED',
    discovered: true,
    is_shared: true,
    processing: false,
    actions: [],
    ...over,
  };
}

test('server grants a close-up only for an object the player knows', () => {
  const mine = [ROOM, row('VICTIM_ITEMS', true, 'DISCOVERED'), row('PASSPORT', true, 'DISCOVERED')];
  assert.equal(resolveObjectView('room-714', 'VICTIM_ITEMS', 'phone', mine), 'room-714/objects/phone-01.png');
  assert.equal(resolveObjectView('room-714', 'VICTIM_ITEMS', 'wallet', mine), 'room-714/objects/wallet-01.png');
  assert.equal(resolveObjectView('room-714', 'PASSPORT', 'passport', mine), 'room-714/objects/passport-01.png');
});

test('no close-up before inspection, for a teammate\'s private find, or outside my index', () => {
  assert.equal(resolveObjectView('room-714', 'VICTIM_ITEMS', 'phone', [row('VICTIM_ITEMS', false, 'UNKNOWN')]), null);
  assert.equal(resolveObjectView('room-714', 'VICTIM_ITEMS', 'phone', [row('VICTIM_ITEMS', true, 'HIDDEN')]), null);
  assert.equal(resolveObjectView('room-714', 'PASSPORT', 'passport', []), null);
});

test('blood stain close-up needs the stain AND its parent glass to be known to me', () => {
  const glass = (discovered: boolean, state: string) => row('GLASS_CUP', discovered, state);
  const stain = row('BLOOD_STAIN', true, 'DISCOVERED');
  assert.equal(resolveObjectView('room-714', 'BLOOD_STAIN', 'stain', [ROOM, glass(true, 'DISCOVERED'), stain]), 'room-714/objects/blood-stain-01.png');
  // يبقى متاحاً عبر حالات المختبر (نفس البقعة كما وُجدت)
  for (const s of ['SAMPLE_COLLECTED', 'PROCESSING', 'ANALYZED']) {
    assert.ok(resolveObjectView('room-714', 'BLOOD_STAIN', 'stain', [ROOM, glass(true, 'DISCOVERED'), row('BLOOD_STAIN', true, s)]), s);
  }
  // الكأس اكتشاف خاص لزميل / غير مكتشَف / غائب عن فهرسي → لا لقطة
  assert.equal(resolveObjectView('room-714', 'BLOOD_STAIN', 'stain', [ROOM, glass(true, 'HIDDEN'), stain]), null);
  assert.equal(resolveObjectView('room-714', 'BLOOD_STAIN', 'stain', [ROOM, glass(false, 'UNKNOWN'), stain]), null);
  assert.equal(resolveObjectView('room-714', 'BLOOD_STAIN', 'stain', [ROOM, stain]), null);
  // البقعة نفسها قبل الفحص أو خاصة لزميل
  assert.equal(resolveObjectView('room-714', 'BLOOD_STAIN', 'stain', [ROOM, glass(true, 'DISCOVERED'), row('BLOOD_STAIN', false, 'UNKNOWN')]), null);
  assert.equal(resolveObjectView('room-714', 'BLOOD_STAIN', 'stain', [ROOM, glass(true, 'DISCOVERED'), row('BLOOD_STAIN', true, 'HIDDEN')]), null);
  // client gating
  assert.deepEqual(closeUpViewsFor(obj('BLOOD_STAIN', { parent_code: 'GLASS_CUP' })).map((v) => v.key), ['stain']);
  assert.deepEqual(closeUpViewsFor(obj('BLOOD_STAIN', { discovered: false, state: 'UNKNOWN', is_shared: false })), []);
});

test('unknown object, view, or case → nothing (no path guessing)', () => {
  const all = [ROOM, row('GLASS_CUP', true, 'DISCOVERED'), row('BLOOD_STAIN', true, 'ANALYZED'), row('VICTIM_ITEMS', true, 'DISCOVERED'), row('PASSPORT', true, 'DISCOVERED')];
  assert.equal(resolveObjectView('room-714', 'BLOOD_STAIN', 'blood', all), null);
  assert.equal(resolveObjectView('room-714', 'PASSPORT', 'phone', all), null);
  assert.equal(resolveObjectView('room-714', 'PASSPORT', '../scene/room714-crime-scene-overview', all), null);
  assert.equal(resolveObjectView('scene-17', 'PASSPORT', 'passport', all), null);
});

test('scope: passport, phone, wallet + blood stain; glass/window held (canon/asset preflight)', () => {
  assert.deepEqual(Object.keys(OBJECT_VIEW_ALLOWLIST['room-714'] ?? {}).sort(), ['BLOOD_STAIN', 'PASSPORT', 'VICTIM_ITEMS']);
  assert.deepEqual(OBJECT_VIEW_ALLOWLIST['room-714']?.BLOOD_STAIN, { stain: 'room-714/objects/blood-stain-01.png' });
  for (const held of ['GLASS_CUP', 'OPEN_WINDOW']) {
    assert.equal(OBJECT_VIEWS[held], undefined);
    assert.equal(OBJECT_VIEW_ALLOWLIST['room-714']?.[held], undefined);
  }
  // لا قضية أخرى تحصل على لقطات غرفة 714
  for (const [caseId, views] of Object.entries(OBJECT_VIEW_ALLOWLIST)) {
    if (caseId !== 'room-714') assert.deepEqual(views, {}, caseId);
  }
  // صورة المشهد الكاملة كما هي.
  assert.equal(SCENE_ALLOWLIST['room-714']?.ROOM_714, 'room-714/scene/room714-crime-scene-overview.png');
});

test('client view keys match the server allowlist exactly', () => {
  for (const [code, views] of Object.entries(OBJECT_VIEWS)) {
    assert.deepEqual(views.map((v) => v.key).sort(), Object.keys(OBJECT_VIEW_ALLOWLIST['room-714']?.[code] ?? {}).sort(), code);
  }
});

test('labels are authored words only (from VICTIM_ITEMS / PASSPORT seed text)', () => {
  const seed = readFileSync('sql/019_investigation_objects.sql', 'utf8');
  assert.ok(seed.includes('الهاتف موجود على الطاولة. المحفظة موجودة. جواز السفر موجود.'));
  for (const v of Object.values(OBJECT_VIEWS).flat()) {
    assert.ok(seed.includes(v.label), `label not authored: ${v.label}`);
  }
});

test('client gating mirrors the server: known objects only', () => {
  assert.deepEqual(closeUpViewsFor(obj('PASSPORT')).map((v) => v.key), ['passport']);
  assert.deepEqual(closeUpViewsFor(obj('VICTIM_ITEMS', { is_shared: false })).map((v) => v.key), ['phone', 'wallet']);
  assert.deepEqual(closeUpViewsFor(obj('VICTIM_ITEMS', { discovered: false, state: 'UNKNOWN' })), []);
  assert.deepEqual(closeUpViewsFor(obj('VICTIM_ITEMS', { state: 'HIDDEN', is_shared: false })), []);
  assert.deepEqual(closeUpViewsFor(obj('LAPTOP')), []);
  // مفاتيح prototype ليست لقطات
  assert.deepEqual(closeUpViewsFor(obj('constructor')), []);
  assert.deepEqual(closeUpViewsFor(undefined), []);
});

test('no storage path ever reaches client code', () => {
  for (const f of ['objectViews.ts', 'ObjectCloseUp.tsx', 'useSceneImage.ts', 'RoomScene.tsx']) {
    const src = readFileSync(`src/app/case/[code]/investigation/scene/${f}`, 'utf8');
    assert.ok(!src.includes('room-714/objects'), `${f} must not contain storage paths`);
    assert.ok(!/media_path/.test(src), `${f} must not reference media_path`);
  }
});
