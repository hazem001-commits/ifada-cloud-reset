// ============================================================
// tests/evidence/authoredContext.test.ts
// "تفاصيل الدليل": ربط الوسائط لا يُخفي نص الدليل المكتوب، والمصدر
// هو نص الدليل المصرّح به فقط — بلا تكرار حين لا وسائط، وبلا اختلاق
// تفريغ زمني بمحطة الصوت.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authoredContextFor, transcriptEmptyMessage } from '../../src/app/case/[code]/evidence/authoredContext';
import type { EvidenceItem } from '../../src/types/case';

// نص D-08 كما في sql/005 (دليل صوتي مربوط فعلاً).
const D08_BODY =
  'رسالة صوتية أرسلها الضحية — 23:18\nالمستلم: رقم غير مسجل بجهات الاتصال\nالمدة: 0:07\n\nالنص المفرّغ:\n"بعرف إنك كنت هناك... الفيديو عندي."';

function item(over: Partial<EvidenceItem>): EvidenceItem {
  return {
    code: 'D-08',
    title: 'رسالة صوتية صادرة',
    kind: 'audio',
    owner_spec: 'digital',
    clock_label: '23:18',
    body: D08_BODY,
    has_media: true,
    readable: true,
    unlocked_at: '2026-08-23T23:00:00Z',
    ...over,
  };
}

// 1
test('media + player-visible authored text → context available, verbatim', () => {
  const ctx = authoredContextFor(item({}));
  assert.equal(ctx, D08_BODY);
  // الأسطر والفقرات كما كُتبت — لا تلخيص ولا إعادة صياغة.
  assert.ok(ctx?.includes('\n\nالنص المفرّغ:\n'));
});

// 2
test('media + no authored text → no context control', () => {
  assert.equal(authoredContextFor(item({ body: null })), null);
  assert.equal(authoredContextFor(item({ body: '' })), null);
  assert.equal(authoredContextFor(item({ body: '   \n  ' })), null);
});

// 3
test('no media + authored text → the text viewer stays the source; no duplicate drawer', () => {
  assert.equal(authoredContextFor(item({ has_media: false })), null);
});

// 4
test('context comes only from the player-visible body — nothing else can enter', () => {
  // دليل غير مقروء لهذا اللاعب: حتى لو وصل body بالخطأ، لا سياق.
  assert.equal(authoredContextFor(item({ readable: false })), null);
  assert.equal(authoredContextFor(item({ readable: false, body: 'نص مسرّب' })), null);

  // حقول إضافية غير مصرّح بها على الكائن لا تدخل الدرج أبداً.
  const polluted = {
    ...item({}),
    media_path: 'room-714/D-08.mp3',
    solution: 'SECRET',
    notes: 'internal',
  } as EvidenceItem;
  const ctx = authoredContextFor(polluted);
  assert.equal(ctx, D08_BODY);
  for (const leak of ['room-714/D-08.mp3', 'SECRET', 'internal']) {
    assert.ok(!ctx?.includes(leak), `leaked ${leak}`);
  }
});

// 5
test('audio without timed transcript + authored context → honest message, no "no text" claim', () => {
  const withContext = transcriptEmptyMessage(true);
  assert.equal(withContext, 'لا يوجد تفريغ زمني لهذا التسجيل. تفاصيل الدليل متاحة من «تفاصيل الدليل».');
  assert.ok(!withContext.includes('لا يوجد تفريغ نصي'));
  // بلا نص مكتوب: الرسالة القديمة نفسها (صادقة).
  assert.equal(transcriptEmptyMessage(false), 'لا يوجد تفريغ نصي مرفق بهذا التسجيل.');
});

test('audio: the timed transcript still comes only from annotations — authored text is never turned into segments', () => {
  const root = 'src/app/case/[code]/evidence/audio/';
  const station = readFileSync(`${root}AudioStation.tsx`, 'utf8');
  const panel = readFileSync(`${root}TranscriptPanel.tsx`, 'utf8');
  assert.match(station, /segments=\{annotations\?\.transcript \?\? \[\]\}/);
  // لا مصدر آخر للمقاطع، ولا نص الدليل داخل لوحة التفريغ.
  assert.equal((station.match(/segments=/g) ?? []).length, 1);
  assert.ok(!/\.body\b/.test(panel), 'TranscriptPanel must not read the evidence body');
  assert.ok(!/startSeconds\s*:/.test(station), 'no synthesized timed segments');
});
