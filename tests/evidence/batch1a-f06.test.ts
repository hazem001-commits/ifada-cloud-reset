// ============================================================
// tests/evidence/batch1a-f06.test.ts
// Batch 1A: ربط F-06 بصورته المدققة عبر نفس ربط الوسائط الآمن.
// F-06 (وثيقة طب شرعي) + صورة PNG → عارض الوثائق (مسح)، هوية ملف
// القضية تبقى "نتيجة مخبرية"، و"تفاصيل الدليل" تحفظ نصه المكتوب.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyEvidence } from '../../src/app/case/[code]/evidence/classify';
import { authoredContextFor } from '../../src/app/case/[code]/evidence/authoredContext';
import { entryFromEvidence } from '../../src/app/case/[code]/casefile/caseFileModel';
import type { EvidenceItem } from '../../src/types/case';

// نص F-06 حرفياً من sql/005 — لا يتغيّر بهذه الدفعة.
const F06_BODY =
  'حاجز الحماية الشرقي، مستوى الخدمات M1\n\nالبراغي السفلية منزوعة جزئياً — تآكل قديم، لا كسر حديث.\nنمط الانهيار يتوافق مع ضغط جانبي (اتكاء أو ارتداد للخلف).\nلا توجد آثار أداة أو تدخل خارجي على الحاجز.\n\nالخلاصة: الحاجز فشل من تلقاء نفسه تحت وزن.';

const F06: EvidenceItem = {
  code: 'F-06',
  title: 'فحص الحاجز المتضرر — M1',
  kind: 'document',
  owner_spec: 'forensics',
  clock_label: null,
  body: F06_BODY,
  has_media: true,
  readable: true,
  unlocked_at: '2026-08-24T00:30:00Z',
};

test('F-06 + png routes to the document viewer (scan), never an image/social or video station', () => {
  assert.equal(classifyEvidence(F06, 'image/png'), 'document');
  // قبل وصول الوسائط: نفس عائلة العارض (لا وميض).
  assert.equal(classifyEvidence(F06, null), 'document');
});

test('F-06 keeps its Case File identity (lab result) with or without media', () => {
  assert.equal(entryFromEvidence(F06).identity, 'lab');
  assert.equal(entryFromEvidence({ ...F06, has_media: false }).identity, 'lab');
});

test('F-06 authored body stays available verbatim through "تفاصيل الدليل"', () => {
  assert.equal(authoredContextFor(F06), F06_BODY);
  // غير صاحب التخصص (evidence_index يرجع body = null): لا درج.
  assert.equal(authoredContextFor({ ...F06, readable: false, body: null }), null);
});

test('media mapping: F-06 added once, via the secure bucket path; excluded items untouched', () => {
  const src = readFileSync('scripts/lib/media-mapping.mjs', 'utf8');
  const codes = [...src.matchAll(/evidenceCode:\s*'([A-Z]-\d+)'/g)].map((m) => m[1]);
  assert.equal(codes.filter((c) => c === 'F-06').length, 1);
  assert.match(
    src,
    /evidenceCode: 'F-06',\s*sourceFile: 'public\/cases\/room-714\/forensics\/m1-railing-damage-01\.png',\s*targetPath: 'room-714\/F-06\.png',/,
  );
  for (const excluded of ['D-06', 'R-02', 'F-04', 'F-07', 'D-02', 'D-07', 'R-06', 'D-01', 'R-07', 'V-02', 'V-05', 'F-03', 'V-09']) {
    assert.ok(!codes.includes(excluded), `${excluded} must not be mapped in Batch 1A`);
  }
  // لا روابط عامة: المسار داخل الـ bucket الخاص فقط.
  assert.ok(!/https?:\/\//.test(src));
});
