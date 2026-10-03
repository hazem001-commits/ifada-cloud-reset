// ============================================================
// tests/evidence/batch1d-r08.test.ts
// Batch 1D: ربط R-08 بصورة سجل الاتصالات المدققة عبر نفس ربط
// الوسائط الآمن. سجل + صورة → مسح سجل رسمي (لا صورة اجتماعية ولا
// عارض هاتف)، وهوية ملف القضية "سجل رسمي"، ونصه المكتوب محفوظ.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyEvidence } from '../../src/app/case/[code]/evidence/classify';
import { authoredContextFor } from '../../src/app/case/[code]/evidence/authoredContext';
import { entryFromEvidence } from '../../src/app/case/[code]/casefile/caseFileModel';
import type { EvidenceItem } from '../../src/types/case';

// نص R-08 حرفياً من sql/005 — لا يتغيّر بهذه الدفعة.
const R08_BODY =
  'سجل مكالمات — الشريك المؤسس (سامر)\n23/08/2026\n\n22:40 — صادرة (4 دقائق) — "مستثمر — جولة التمويل"\n23:05 — واردة — مرفوضة (0 ثانية) — "مستثمر — جولة التمويل"\n23:07 — صادرة (22 دقيقة) — رقم غير مسجل\n01:38 — صادرة (3 دقائق) — "استقبال فندق فيسبر"';

const R08: EvidenceItem = {
  code: 'R-08',
  title: 'سجل مكالمات الشريك المؤسس',
  kind: 'record',
  owner_spec: 'records',
  clock_label: null,
  body: R08_BODY,
  has_media: true,
  readable: true,
  unlocked_at: '2026-08-24T01:00:00Z',
};

test('R-08 + png routes to the official-record scan, not phone/social/CCTV', () => {
  assert.equal(classifyEvidence(R08, 'image/png'), 'official-record');
  assert.equal(classifyEvidence(R08, null), 'official-record');
});

test('R-08 keeps its Case File identity (official record) with or without media', () => {
  assert.equal(entryFromEvidence(R08).identity, 'record');
  assert.equal(entryFromEvidence({ ...R08, has_media: false }).identity, 'record');
});

test('R-08 authored body stays available verbatim through "تفاصيل الدليل"', () => {
  assert.equal(authoredContextFor(R08), R08_BODY);
  assert.equal(authoredContextFor({ ...R08, readable: false, body: null }), null);
});

test('media mapping: R-08 added once from the audited asset; held items stay unmapped', () => {
  const src = readFileSync('scripts/lib/media-mapping.mjs', 'utf8');
  const codes = [...src.matchAll(/evidenceCode:\s*'([A-Z]-\d+)'/g)].map((m) => m[1]);
  assert.equal(codes.filter((c) => c === 'R-08').length, 1);
  assert.match(
    src,
    /evidenceCode: 'R-08',\s*sourceFile: 'public\/cases\/room-714\/evidence\/samer\/e36-samer-call-log\.png',\s*targetPath: 'room-714\/R-08\.png',/,
  );
  for (const held of ['D-06', 'D-02', 'D-07', 'D-01', 'R-02', 'R-06', 'R-07', 'R-09', 'F-03', 'F-04', 'F-07', 'V-02', 'V-04', 'V-05', 'V-06', 'V-09']) {
    assert.ok(!codes.includes(held), `${held} must stay unmapped`);
  }
  // الشاهد الآخر "سامر" (m1-witness-statement) لا يُربط.
  assert.ok(!src.includes('m1-witness-statement'));
});
