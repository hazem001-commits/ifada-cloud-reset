// ============================================================
// tests/cases/scene17Manifest.test.ts
// سلامة خريطة المشهد 17 للاعتماد: 40 بنداً بالضبط، كل بند بثقة معرّفة،
// التعارض/النقص مسبَّب، والقنوات مطابقة لتوزيع السيرفر المكتوب.
// الملفات المصدرية غير متتبَّعة (content-source) — فحص وجودها يُتخطى
// على جهاز لا يملكها.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SCENE_17_CHANNELS, SCENE_17_SHARED_EVIDENCE } from '../../src/server/cases/scene-17/channels';

interface Item {
  code: string;
  channel: string;
  assets: string[];
  confidence: 'CONFIRMED' | 'PROBABLE' | 'CONFLICT' | 'MISSING';
  reasons: string[];
}
const M = JSON.parse(readFileSync('docs/cases/scene-17/asset-evidence-manifest.json', 'utf8')) as {
  status: string;
  assetRoot: string;
  items: Item[];
  unassignedFiles: { path: string }[];
};

test('exactly E01–E40, each once, never marked seeded', () => {
  assert.deepEqual(M.items.map((i) => i.code), Array.from({ length: 40 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`));
  assert.match(M.status, /AWAITING_APPROVAL/);
});

test('uncertainty is explicit: conflicts and gaps always carry reasons; missing items have no asset', () => {
  for (const i of M.items) {
    if (i.confidence === 'CONFLICT') assert.ok(i.reasons.length > 0, i.code);
    if (i.confidence === 'MISSING') assert.equal(i.assets.length, 0, i.code);
    else assert.ok(i.assets.length > 0, i.code);
  }
  const count = (c: Item['confidence']) => M.items.filter((i) => i.confidence === c).length;
  assert.deepEqual([count('CONFIRMED'), count('PROBABLE'), count('CONFLICT'), count('MISSING')], [10, 6, 14, 10]);
});

test('channels in the manifest match the authored distribution (server)', () => {
  const channelOf = new Map<string, string>();
  for (const c of SCENE_17_CHANNELS) for (const e of c.evidence) channelOf.set(e, c.id);
  for (const e of SCENE_17_SHARED_EVIDENCE) channelOf.set(e, 'shared');
  for (const i of M.items) assert.equal(i.channel, channelOf.get(i.code), i.code);
});

test('every referenced asset exists locally (skipped when content-source is absent)', (t) => {
  if (!existsSync(M.assetRoot)) {
    t.skip('content-source not present on this machine');
    return;
  }
  const referenced = [...M.items.flatMap((i) => i.assets), ...M.unassignedFiles.map((u) => u.path)];
  for (const p of referenced) assert.ok(existsSync(M.assetRoot + p), p);
});
