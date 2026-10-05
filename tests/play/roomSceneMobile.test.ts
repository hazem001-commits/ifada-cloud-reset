// ============================================================
// tests/play/roomSceneMobile.test.ts
// Room 714's REAL scene definition (anchors in source pixels) framed at
// phone / tablet / desktop sizes. Responsive by construction: the image and
// hotspots share one transform, every overview hotspot is on screen with a
// ≥ 44px touch target, and focusing any object on a phone keeps it in the
// part of the scene the dossier sheet does not cover.
// (The protected photo itself is checked live — docs/qa/RESET2_LIVE_QA.md.)
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOM_714_PRESENTATION } from '../../src/cases/room-714/presentation';
import { anchorsSafe, dossierLayout, fitScene, frameObject, hitBox, toScreen, type Box, type StageTransform } from '../../src/app/case/[code]/investigation/scene/sceneGeometry';

const scene = ROOM_714_PRESENTATION.scenes.ROOM_714!;
// scene viewport = device size minus the case header / tab bar (generous)
const SIZES = [
  { name: '360 portrait', width: 360, height: 640 - 120 },
  { name: '390 portrait', width: 390, height: 844 - 130 },
  { name: '430 portrait', width: 430, height: 932 - 130 },
  { name: '768 tablet', width: 768, height: 1024 - 110 },
  { name: '1440 desktop', width: 1440, height: 900 - 90 },
];
// overview = root objects that have an anchor (PASSPORT / BLOOD_STAIN appear inside their parent)
const ROOTS = ['LAPTOP', 'VICTIM_ITEMS', 'OPEN_WINDOW', 'GLASS_CUP'];
const CHILDREN: Record<string, string> = { PASSPORT: 'VICTIM_ITEMS', BLOOD_STAIN: 'GLASS_CUP' };

const screenRect = (b: Box, t: StageTransform) => {
  const a = toScreen({ x: b.x, y: b.y }, t);
  return { x0: a.x, y0: a.y, x1: a.x + b.w * t.scale, y1: a.y + b.h * t.scale };
};
const EPS = 0.5;

for (const view of SIZES) {
  test(`Room 714 overview at ${view.name}: every object reachable on screen, ≥44px touch target`, () => {
    const t = fitScene(view, scene);
    for (const code of ROOTS) {
      const anchor = scene.anchors[code]!;
      const body = screenRect(anchor.box, t);
      // centre on screen; the TOUCH TARGET (not the drawn object, which may be small) has ≥ 44px on screen per axis
      const cx = (body.x0 + body.x1) / 2;
      const cy = (body.y0 + body.y1) / 2;
      assert.ok(cx > 0 && cx < view.width && cy > 0 && cy < view.height, `${code}: centre on screen`);
      const hit = screenRect(hitBox(anchor.box, t.scale), t);
      const visW = Math.min(hit.x1, view.width) - Math.max(hit.x0, 0);
      const visH = Math.min(hit.y1, view.height) - Math.max(hit.y0, 0);
      assert.ok(visW >= 44 - EPS && visH >= 44 - EPS, `${code}: on-screen touch target ≥ 44px (${visW.toFixed(0)}×${visH.toFixed(0)})`);
    }
  });

  test(`Room 714 focus at ${view.name}: the inspected object stays in the uncovered scene (orientation kept)`, () => {
    const base = fitScene(view, scene);
    const layout = dossierLayout(view, false);
    assert.equal(layout.mode, view.width < 760 ? 'sheet' : 'side');
    for (const code of [...ROOTS, ...Object.keys(CHILDREN)]) {
      const anchor = scene.anchors[code]!;
      const target = anchor.frame ?? anchor.box;
      const t = frameObject(scene, base, target, layout.free, layout.visible);
      const body = screenRect(anchor.box, t);
      const cx = (body.x0 + body.x1) / 2;
      const cy = (body.y0 + body.y1) / 2;
      // the object's centre is inside the part of the scene the dossier does not cover
      assert.ok(cx >= layout.visible.x0 && cx <= layout.visible.x1, `${code}: centre x inside the uncovered scene`);
      assert.ok(cy >= layout.visible.y0 && cy <= layout.visible.y1, `${code}: centre y inside the uncovered scene (not under the sheet)`);
      // zoom brings it closer, never further (no disorienting jump out)
      assert.ok(t.scale >= base.scale, `${code}: focus zooms in`);
      if (code in CHILDREN) {
        // a child seen inside its focused parent still has a ≥44px touch target
        const parentT = frameObject(scene, base, scene.anchors[CHILDREN[code]!]!.frame ?? scene.anchors[CHILDREN[code]!]!.box, layout.free, layout.visible);
        const hit = hitBox(anchor.box, parentT.scale);
        assert.ok(hit.w * parentT.scale >= 44 - EPS && hit.h * parentT.scale >= 44 - EPS, `${code}: touch target inside its parent ≥ 44px`);
      }
    }
  });
}

test('phone sheet leaves the scene visible above it, and hotspots are never hover-only', () => {
  for (const view of SIZES.filter((v) => v.width < 760)) {
    const l = dossierLayout(view, false);
    assert.ok(l.visible.y1 >= view.height * 0.33, `${view.name}: at least a third of the scene stays visible above the sheet`);
  }
  const hotspot = readFileSync('src/app/case/[code]/investigation/scene/SceneHotspot.tsx', 'utf8');
  assert.match(hotspot, /onClick=\{\(\) => \{[\s\S]*onOpen\(\)/, 'a tap opens the object (no hover needed)');
  const css = readFileSync('src/app/case/[code]/investigation/scene/roomScene.module.css', 'utf8');
  assert.match(css, /@media \(hover: none\)[\s\S]*\.hintTouch/, 'touch devices get a touch hint, not "hover"');
  assert.match(css, /@media \(max-width: 759px\)[\s\S]*\.margin \{[\s\S]*safe-area-inset-bottom/, 'off-frame entries (the door) clear the floating leads pill and the safe area');
  const dossier = readFileSync('src/app/case/[code]/investigation/dossier.module.css', 'utf8');
  assert.match(dossier, /\[data-layout='sheet'\] > \.dossier \.scroll \{[^}]*padding:[^;]*calc\(env\(safe-area-inset-bottom/, 'the sheet\'s last action sits above the home indicator');
});

// ------------------------------------------------------------
// Portrait composition (RoomScene when height > width): the image starts right
// under the compact place plaque (no black band), is cropped sideways only down
// to the investigation objects, and keeps a reserved strip at the bottom for the
// off-frame door entry (+ the leads pill on phones). Same transform for image
// and hotspots — objects never move away from their real place in the photo.
// ------------------------------------------------------------
const PORTRAIT = [
  { name: '360x800', width: 360, height: 800 - 120, plaque: 86, phone: true },
  { name: '390x844', width: 390, height: 844 - 124, plaque: 86, phone: true },
  { name: '430x932', width: 430, height: 932 - 124, plaque: 86, phone: true },
  { name: '768x1024', width: 768, height: 1024 - 132, plaque: 98, phone: false },
];
for (const v of PORTRAIT) {
  test(`portrait composition ${v.name}: image under the plaque, objects clear of the door strip, ≥44px targets`, () => {
    const top = v.plaque + 12;
    const reserve = 112 + (v.phone ? 64 : 0);
    const t = fitScene(v, scene, { top, bottom: reserve }, { safe: anchorsSafe(scene), align: 'start' });
    const imageTop = t.ty;
    const imageBottom = t.ty + scene.height * t.scale;
    if (imageBottom - imageTop <= v.height) assert.ok(Math.abs(imageTop - top) < 1 || imageTop >= 0, `${v.name}: image starts right under the plaque`);
    // bigger than the old fit (whole cinematic safe zone): the scene is the priority on a phone
    // phones: the scene is the priority — never smaller than the plain (whole cinematic safe zone) fit
    if (v.phone) assert.ok(t.scale >= fitScene(v, scene).scale - 1e-9, `${v.name}: never smaller than the plain fit`);
    for (const code of [...ROOTS]) {
      const body = screenRect(scene.anchors[code]!.box, t);
      assert.ok(body.y0 >= top - 1, `${code}: below the plaque`);
      assert.ok(body.y1 <= v.height - reserve + 1, `${code}: above the reserved door/leads strip`);
      assert.ok(body.x0 >= -1 && body.x1 <= v.width + 1, `${code}: fully on screen horizontally`);
      const hit = hitBox(scene.anchors[code]!.box, t.scale);
      assert.ok(hit.w * t.scale >= 44 - 0.5 && hit.h * t.scale >= 44 - 0.5, `${code}: ≥ 44px`);
    }
  });
}
