// ============================================================
// tests/evidence/classify.test.ts
// توجيه عارض الأدلة: نوع الملف الفعلي يحدد عائلة العارض أولاً،
// ومعنى الدليل يحدد الشكل ثانياً. الحالات من أدلة ROOM 714 الحقيقية
// (sql/005 + scripts/lib/media-mapping.mjs) — لا وسائط جديدة هنا.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvidence } from '../../src/app/case/[code]/evidence/classify';
import { entryFromEvidence } from '../../src/app/case/[code]/casefile/caseFileModel';
import type { EvidenceItem, EvidenceKind } from '../../src/types/case';
import type { Specialization } from '../../src/types/database';

const PNG = 'image/png';
const JPEG = 'image/jpeg';
const MP3 = 'audio/mpeg';
const PDF = 'application/pdf';
const MP4 = 'video/mp4';

function item(code: string, title: string, kind: EvidenceKind, owner: Specialization, hasMedia = true): EvidenceItem {
  return {
    code,
    title,
    kind,
    owner_spec: owner,
    clock_label: null,
    body: 'نص',
    has_media: hasMedia,
    readable: true,
    unlocked_at: '2026-08-23T23:00:00Z',
  };
}

const D06 = item('D-06', 'محتوى الملف المنسوخ', 'video', 'digital');
const V02 = item('V-02', 'إفادة مدير الأمن — كريم', 'testimony', 'field');
const R10 = item('R-10', 'سجل مركبات — بوابة الفندق', 'record', 'records');

// ------------------------------------------------------------
// 1. D-06: إطار ثابت لا يصل لمحطة الفيديو أبداً
// ------------------------------------------------------------
test('D-06 style: kind=video + png → still image, never the Video Station', () => {
  assert.equal(classifyEvidence(D06, PNG), 'surveillance-image');
  assert.equal(classifyEvidence(D06, JPEG), 'surveillance-image');
});

test('D-06 style: while the file type is still unknown it does not open the Video Station', () => {
  // غرفة الفحص تصنّف قبل وصول الوسائط (contentType = null)، وملف القضية لا يعرفه أبداً.
  assert.notEqual(classifyEvidence(D06, null), 'video');
  assert.notEqual(classifyEvidence(D06), 'video');
});

test('D-06 style: the Case File shows a still (cctv), not a video tape', () => {
  assert.equal(entryFromEvidence(D06).identity, 'cctv');
  // اليوم D-06 بلا وسائط: يبقى أثراً رقمياً نصياً كما كان.
  assert.equal(entryFromEvidence({ ...D06, has_media: false }).identity, 'digital');
});

test('the Video Station is chosen only by an actual video file', () => {
  assert.equal(classifyEvidence(D06, MP4), 'video');
  assert.equal(classifyEvidence(item('X-1', 'تسجيل', 'record', 'field'), MP4), 'video');
});

// ------------------------------------------------------------
// 2. إفادة صوتية → محطة الصوت
// ------------------------------------------------------------
test('V-02 style: kind=testimony + mp3 → Audio Station', () => {
  assert.equal(classifyEvidence(V02, MP3), 'audio');
  assert.equal(classifyEvidence(V02, 'audio/wav'), 'audio');
});

test('a testimony without a known audio file keeps its document presentation', () => {
  assert.equal(classifyEvidence(V02, null), 'document');
  assert.equal(entryFromEvidence({ ...V02, has_media: false }).identity, 'testimony');
});

// ------------------------------------------------------------
// 3. سجل مصوّر → سجل رسمي، لا صورة اجتماعية
// ------------------------------------------------------------
test('R-10 style: kind=record + scanned png → official record scan, not a social photo', () => {
  assert.equal(classifyEvidence(R10, PNG), 'official-record');
  assert.notEqual(classifyEvidence(R10, PNG), 'social-image');
  assert.equal(entryFromEvidence(R10).identity, 'record');
});

test('record/document/testimony images are document scans; real photos stay photos', () => {
  const recordNoKeyword = item('X-2', 'خروج مسجّل', 'record', 'field');
  assert.equal(classifyEvidence(recordNoKeyword, PNG), 'official-record');
  const report = item('F-04', 'تقرير طبي أولي — الطوارئ', 'document', 'forensics');
  assert.equal(classifyEvidence(report, PNG), 'document');
  const statement = item('X-3', 'إفادة شاهد', 'testimony', 'field');
  assert.equal(classifyEvidence(statement, PNG), 'document');
  const post = item('X-4', 'صورة من الأرشيف', 'photo', 'records');
  assert.equal(classifyEvidence(post, PNG), 'social-image');
});

test('explicit phone/chat and surveillance titles still win for images', () => {
  assert.equal(classifyEvidence(item('X-5', 'محادثة واتساب', 'record', 'digital'), PNG), 'phone');
  assert.equal(classifyEvidence(item('X-6', 'لقطة كاميرا الممر', 'record', 'field'), PNG), 'surveillance-image');
});

test('a PDF is always a document, even for photo-kind or chat-titled evidence', () => {
  assert.equal(classifyEvidence(item('X-7', 'محادثة', 'record', 'digital'), PDF), 'document');
  assert.equal(classifyEvidence(item('X-8', 'صورة', 'photo', 'field'), PDF), 'document');
});

// ------------------------------------------------------------
// 4. الربط المعتمد الحالي (media-mapping.mjs) — نفس التصنيف تماماً
// ------------------------------------------------------------
test('existing approved media mappings classify exactly as before', () => {
  const approved: [EvidenceItem, string, string][] = [
    [item('D-03', 'فجوة في تسجيلات المراقبة', 'record', 'digital'), PDF, 'document'],
    [item('D-04', 'سجل الدخول لنظام الأمن', 'record', 'digital'), PDF, 'official-record'],
    [item('D-05', 'نقل ملف إلى ذاكرة خارجية', 'record', 'digital'), PDF, 'document'],
    [item('D-08', 'رسالة صوتية صادرة', 'audio', 'digital'), MP3, 'audio'],
    [item('R-04', 'تحويلات مالية متكررة', 'record', 'records'), PDF, 'official-record'],
    [item('R-05', 'عقد تأسيس N17 CONSULTING', 'document', 'records'), PDF, 'official-record'],
    [item('V-03', 'لقطة كاميرا — الضحية مع مدير الأمن', 'photo', 'field'), PNG, 'surveillance-image'],
    [item('V-08', 'دخول عبر المصعد الخدمي', 'photo', 'field'), JPEG, 'surveillance-image'],
  ];
  for (const [ev, type, expected] of approved) {
    assert.equal(classifyEvidence(ev, type), expected, `${ev.code} with ${type}`);
    // قبل وصول الوسائط: نفس عائلة العارض (لا وميض عارض آخر).
    assert.equal(classifyEvidence(ev, null), expected, `${ev.code} before media arrives`);
  }
});

test('Case File identities for the approved mappings are unchanged', () => {
  const expected: [EvidenceItem, string][] = [
    [item('D-03', 'فجوة في تسجيلات المراقبة', 'record', 'digital'), 'document'],
    [item('D-04', 'سجل الدخول لنظام الأمن', 'record', 'digital'), 'record'],
    [item('D-08', 'رسالة صوتية صادرة', 'audio', 'digital'), 'audio'],
    [item('R-04', 'تحويلات مالية متكررة', 'record', 'records'), 'record'],
    [item('R-10', 'سجل مركبات — بوابة الفندق', 'record', 'records'), 'record'],
    [item('V-03', 'لقطة كاميرا — الضحية مع مدير الأمن', 'photo', 'field'), 'cctv'],
    [item('V-08', 'دخول عبر المصعد الخدمي', 'photo', 'field'), 'cctv'],
  ];
  for (const [ev, identity] of expected) {
    assert.equal(entryFromEvidence(ev).identity, identity, ev.code);
  }
});

test('evidence without media keeps its text identity (no viewer change)', () => {
  assert.equal(entryFromEvidence(item('F-01', 'تقرير مسرح الغرفة 714', 'document', 'forensics', false)).identity, 'lab');
  assert.equal(entryFromEvidence(item('V-01', 'بلاغ الاختفاء', 'record', 'field', false)).identity, 'record');
});
