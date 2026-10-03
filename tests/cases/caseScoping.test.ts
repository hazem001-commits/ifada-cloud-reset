// ============================================================
// tests/cases/caseScoping.test.ts
// قضيتان تستطيعان استخدام نفس كود العنصر/الموقع بلا أي تداخل:
// كل عرض وكل وسائط تُقرأ دائماً caseId → وحدة القضية → الكود.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCaseContract, getCasePresentation, registeredCaseIds } from '../../src/cases/registry';
import { EMPTY_PRESENTATION, own, type CasePresentation } from '../../src/cases/presentation';
import { ROOM_714_PRESENTATION } from '../../src/cases/room-714/presentation';
import { closeUpViewsFor } from '../../src/app/case/[code]/investigation/scene/objectViews';
import { entryFromObject } from '../../src/app/case/[code]/casefile/caseFileModel';
import { OBJECT_VIEW_ALLOWLIST, SCENE_ALLOWLIST, resolveObjectView, sceneImagePath } from '../../src/lib/sceneMedia';
import { getCaseServerModule, serverCaseIds } from '../../src/server/cases/registry';
import type { InvestigationObject } from '../../src/types/investigationObjects';

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

// قضية افتراضية تعيد استخدام نفس الأكواد بمعنى مختلف تماماً.
const OTHER: CasePresentation = {
  scenes: {},
  objectViews: { PASSPORT: [{ key: 'stamp', label: 'ختم' }] },
  objectProfiles: { PASSPORT: { DISCOVERED: { identity: 'document', provenance: 'من أرشيف المسرح' } } },
  boardLanes: [],
};

test('every registered case resolves to its own contract and presentation', () => {
  for (const id of registeredCaseIds()) {
    assert.equal(getCaseContract(id)?.id, id);
  }
  assert.equal(getCasePresentation('room-714'), ROOM_714_PRESENTATION);
  // المشهد 17: لا مشهد ولا لقطات ولا ملفات تعريف — فقط ممرات لوحته الخاصة. لا شيء من غرفة 714.
  const s17 = getCasePresentation('scene-17');
  assert.deepEqual([s17.scenes, s17.objectViews, s17.objectProfiles], [{}, {}, {}]);
  assert.deepEqual(s17.boardLanes.map((l) => l.id), ['written', 'instructed', 'happened']);
  assert.deepEqual(ROOM_714_PRESENTATION.boardLanes, []);
});

test('unknown / prototype-shaped case ids fail closed', () => {
  for (const id of ['nope', '', null, undefined, 'constructor', '__proto__', 'toString']) {
    assert.equal(getCaseContract(id), null, String(id));
    assert.equal(getCasePresentation(id), EMPTY_PRESENTATION, String(id));
    assert.equal(getCaseServerModule(id), null, String(id));
  }
});

test('same object code in two cases → close-ups never cross cases', () => {
  const passport = obj('PASSPORT');
  assert.deepEqual(closeUpViewsFor(passport, ROOM_714_PRESENTATION.objectViews).map((v) => v.key), ['passport']);
  assert.deepEqual(closeUpViewsFor(passport, OTHER.objectViews).map((v) => v.key), ['stamp']);
  assert.deepEqual(closeUpViewsFor(passport, getCasePresentation('scene-17').objectViews), []);
  assert.deepEqual(closeUpViewsFor(obj('BLOOD_STAIN'), OTHER.objectViews), []);
});

test('same object code in two cases → case-file identity/provenance never cross cases', () => {
  const passport = obj('PASSPORT');
  const room = entryFromObject(passport, ROOM_714_PRESENTATION.objectProfiles);
  const other = entryFromObject(passport, OTHER.objectProfiles);
  const none = entryFromObject(passport, getCasePresentation('scene-17').objectProfiles);
  assert.equal(room.provenance, 'عُثر عليه ضمن أغراض النزيل الشخصية');
  assert.equal(other.provenance, 'من أرشيف المسرح');
  assert.equal(other.identity, 'document');
  // بلا ملف تعريف: هوية افتراضية ولا نص من أي قضية أخرى.
  assert.equal(none.provenance, null);
  assert.equal(none.identity, 'physical');
  // ولا عبارة مصدر من ملفات تعريف غرفة 714.
  assert.ok(!Object.values(ROOM_714_PRESENTATION.objectProfiles.PASSPORT ?? {}).some((p) => p.provenance === none.provenance));
});

test('same location code in two cases → a scene only exists in its own case', () => {
  assert.ok(own(ROOM_714_PRESENTATION.scenes, 'ROOM_714'));
  assert.equal(own(getCasePresentation('scene-17').scenes, 'ROOM_714'), undefined);
  assert.equal(own(OTHER.scenes, 'ROOM_714'), undefined);
});

test('server media is case-scoped: another case cannot sign Room 714 paths', () => {
  const rows = [
    { code: 'ROOM_714', parent_code: null, discovered: true, state: 'KNOWN' },
    { code: 'VICTIM_ITEMS', parent_code: 'ROOM_714', discovered: true, state: 'DISCOVERED' },
    { code: 'PASSPORT', parent_code: 'VICTIM_ITEMS', discovered: true, state: 'DISCOVERED' },
  ];
  assert.equal(resolveObjectView('room-714', 'PASSPORT', 'passport', rows), 'room-714/objects/passport-01.png');
  // نفس الكود ونفس الصفوف لكن قضية أخرى → لا شيء.
  assert.equal(resolveObjectView('scene-17', 'PASSPORT', 'passport', rows), null);
  assert.equal(sceneImagePath('room-714', 'ROOM_714'), 'room-714/scene/room714-crime-scene-overview.png');
  assert.equal(sceneImagePath('scene-17', 'ROOM_714'), null);
  assert.deepEqual(SCENE_ALLOWLIST['scene-17'], {});
  assert.deepEqual(OBJECT_VIEW_ALLOWLIST['scene-17'], {});
});

test('prototype keys are never media, views, scenes or profiles', () => {
  const row = { code: 'PASSPORT', parent_code: null, discovered: true, state: 'DISCOVERED' };
  const rows = [row];
  for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(resolveObjectView('room-714', 'PASSPORT', k, rows), null, k);
    assert.equal(resolveObjectView('room-714', k, 'passport', [{ ...row, code: k }]), null, k);
    assert.equal(sceneImagePath('room-714', k), null, k);
    assert.equal(sceneImagePath(k, 'ROOM_714'), null, k);
    assert.deepEqual(closeUpViewsFor(obj(k), ROOM_714_PRESENTATION.objectViews), [], k);
    assert.equal(entryFromObject(obj(k), ROOM_714_PRESENTATION.objectProfiles).provenance, null, k);
  }
});

test('public registry and server registry cover exactly the same cases', () => {
  assert.deepEqual([...registeredCaseIds()].sort(), [...serverCaseIds()].sort());
});

test('client view keys match the server allowlist for every case', () => {
  for (const id of registeredCaseIds()) {
    const client = getCasePresentation(id).objectViews;
    const server = getCaseServerModule(id)!.media.objectViews;
    assert.deepEqual(Object.keys(client).sort(), Object.keys(server).sort(), id);
    for (const [code, views] of Object.entries(client)) {
      assert.deepEqual(views.map((v) => v.key).sort(), Object.keys(server[code] ?? {}).sort(), `${id}/${code}`);
    }
    // كل مشهد مصوّر بالواجهة له صورة بالسيرفر، والعكس.
    assert.deepEqual(Object.keys(getCasePresentation(id).scenes).sort(), Object.keys(getCaseServerModule(id)!.media.scenes).sort(), id);
  }
});

test('Room 714 presentation unchanged by the move (anchors, labels, profiles)', () => {
  const room = ROOM_714_PRESENTATION;
  assert.deepEqual(Object.keys(room.scenes), ['ROOM_714']);
  assert.deepEqual(Object.keys(room.scenes.ROOM_714!.anchors).sort(), ['BLOOD_STAIN', 'GLASS_CUP', 'LAPTOP', 'OPEN_WINDOW', 'PASSPORT', 'VICTIM_ITEMS']);
  assert.deepEqual(room.scenes.ROOM_714!.anchors.PASSPORT, {
    box: { x: 1182, y: 758, w: 144, h: 80 },
    glint: { x: 1250, y: 800 },
    frame: { x: 1070, y: 720, w: 390, h: 190 },
  });
  assert.deepEqual(Object.keys(room.objectProfiles).sort(), ['BLOOD_STAIN', 'GLASS_CUP', 'LAPTOP', 'OPEN_WINDOW', 'PASSPORT', 'VICTIM_ITEMS']);
  assert.equal(room.objectProfiles.BLOOD_STAIN!.ANALYZED!.identity, 'lab');
});
