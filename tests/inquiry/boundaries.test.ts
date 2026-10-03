// ============================================================
// tests/inquiry/boundaries.test.ts
// حدود الصلاحية والخصوصية لـ "اسأل التحقيق" (بحث + توجيه).
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInquiry } from '../../src/lib/inquiry/runInquiry';
import { buildCorpus, searchCorpus, verifyResults } from '../../src/lib/inquiry/search';
import type { InquiryResponse, SearchResult } from '../../src/lib/inquiry/types';
import { SESSION, SUBJECTS, ask, evidenceFor, fakeDeps, objectsFor } from './fixtures';

type Search = Extract<InquiryResponse, { kind: 'search' }>;

function asSearch(body: unknown): Search {
  assert.equal((body as { kind?: string }).kind, 'search');
  return body as Search;
}

const codes = (body: unknown) => asSearch(body).results.map((r) => `${r.ref.type}:${r.ref.code}`);

// ------------------------------------------------------------
// 1. حد الهوية
// ------------------------------------------------------------
test('unauthenticated request is rejected before any case material is read', async () => {
  const deps = fakeDeps({ userId: null });
  const out = await runInquiry(ask('وين انذكر كريم؟'), deps);
  assert.equal(out.status, 401);
  assert.deepEqual(out.body, { error: 'AUTH_REQUIRED' });
  assert.deepEqual(deps.reads, []);
  assert.equal(out.modelCalls, 0);
});

// ------------------------------------------------------------
// 2. حد الجلسة
// ------------------------------------------------------------
test('non-member cannot search the session and nothing is read', async () => {
  const deps = fakeDeps({ member: false });
  const out = await runInquiry(ask('وين انذكر كريم؟'), deps);
  assert.equal(out.status, 403);
  assert.deepEqual(out.body, { error: 'NOT_A_MEMBER' });
  assert.deepEqual(deps.reads, []);
});

test('malformed input is rejected', async () => {
  assert.equal((await runInquiry({ sessionId: 'not-a-uuid', text: 'x' }, fakeDeps())).status, 400);
  assert.equal((await runInquiry({ sessionId: SESSION, text: '   ' }, fakeDeps())).status, 400);
  assert.equal((await runInquiry({ sessionId: SESSION, text: 'ا'.repeat(301) }, fakeDeps())).status, 400);
});

// ------------------------------------------------------------
// 3. حد الاكتشاف الخاص: لا أي إشارة للاعب B
// ------------------------------------------------------------
test("player B's search is identical whether A holds a private laptop discovery or nobody found it", async () => {
  for (const query of ['شو عنا عن اللابتوب؟', 'وين شفنا الشاشة؟', 'لابتوب']) {
    const privateToA = await runInquiry(ask(query), fakeDeps({ world: { laptop: 'hidden' } }));
    const nobody = await runInquiry(ask(query), fakeDeps({ world: { laptop: 'unknown' } }));
    assert.equal(privateToA.status, 200);
    assert.deepEqual(privateToA.body, nobody.body, `leak for query: ${query}`);
    assert.deepEqual(codes(privateToA.body), []);
  }
});

test('a child exposed only by a teammate\'s private parent never reaches B\'s search', async () => {
  // A اكتشف أغراض الطاولة سراً: الفهرس يظهر "جواز السفر" (UNKNOWN) لـ B — البحث لا.
  const leaky = await runInquiry(ask('جواز السفر'), fakeDeps({ world: { victimItems: 'hidden' } }));
  const nobody = await runInquiry(ask('جواز السفر'), fakeDeps({ world: {} }));
  assert.deepEqual(leaky.body, nobody.body);
  assert.deepEqual(codes(leaky.body), []);
});

test("tool routing for B is identical whether the door is A's private discovery or undiscovered", async () => {
  const privateToA = await runInquiry(ask('بدي أعرف مين دخل بعد رامي'), fakeDeps({ world: { door: 'hidden' } }));
  const nobody = await runInquiry(ask('بدي أعرف مين دخل بعد رامي'), fakeDeps({ world: { door: 'unknown' } }));
  assert.deepEqual(privateToA.body, nobody.body);
});

test('the discoverer finds their own private discovery', async () => {
  const out = await runInquiry(ask('شو عنا عن اللابتوب؟'), fakeDeps({ specs: ['field', 'records'], world: { laptop: 'mine' } }));
  const s = asSearch(out.body);
  assert.deepEqual(codes(s), ['object:LAPTOP']);
  assert.equal(s.results[0]?.excerpt, 'لابتوب مفتوح، الشاشة مطفأة.');
});

// ------------------------------------------------------------
// 4. انتقال المشاركة
// ------------------------------------------------------------
test('after the existing share flow, B finds the grounded laptop result', async () => {
  const before = await runInquiry(ask('شو عنا عن اللابتوب؟'), fakeDeps({ world: { laptop: 'hidden' } }));
  const after = await runInquiry(ask('شو عنا عن اللابتوب؟'), fakeDeps({ world: { laptop: 'shared' } }));
  assert.deepEqual(codes(before.body), []);
  const s = asSearch(after.body);
  assert.deepEqual(codes(s), ['object:LAPTOP']);
  const hit = s.results[0] as SearchResult;
  assert.equal(hit.excerpt, 'لابتوب مفتوح، الشاشة مطفأة.');
  assert.deepEqual(hit.open, { kind: 'object', code: 'LAPTOP', location: 'ROOM_714' });
  assert.equal(hit.epistemic, 'source');
});

// ------------------------------------------------------------
// 5. حد التخصص
// ------------------------------------------------------------
test('body text of evidence outside my specializations is never searched or returned', async () => {
  // B = رقمي + طب شرعي. V-06 (ميداني): "معدني" بالنص فقط.
  const bodyOnly = await runInquiry(ask('وين انذكر معدني؟'), fakeDeps({ specs: ['digital', 'forensics'] }));
  assert.deepEqual(codes(bodyOnly.body), []);

  // العنوان ظاهر لكل الأعضاء أصلاً (evidence_index) — بلا مقتطف وبلا فتح.
  const title = asSearch((await runInquiry(ask('وين شفنا اسم آدم؟'), fakeDeps({ specs: ['digital', 'forensics'] }))).body);
  assert.deepEqual(codes(title), ['evidence:V-06']);
  const r = title.results[0] as SearchResult;
  assert.equal(r.excerpt, null);
  assert.equal(r.access, 'title');
  assert.equal(r.ownerSpec, 'field');
  assert.equal(r.open, null);
});

test('Master Key is found only by a player who can read the door-card log', async () => {
  const digital = asSearch((await runInquiry(ask('شو عنا عن Master Key؟'), fakeDeps({ specs: ['digital', 'forensics'] }))).body);
  assert.deepEqual(codes(digital), ['evidence:D-02']);
  assert.match(digital.results[0]?.excerpt ?? '', /Staff Master Key/);

  const field = await runInquiry(ask('شو عنا عن Master Key؟'), fakeDeps({ specs: ['field', 'records'] }));
  assert.deepEqual(codes(field.body), []);
});

test('buildCorpus ignores a body that arrives on an unreadable row (defence in depth)', () => {
  const rows = evidenceFor(['digital']).map((e) => (e.code === 'V-06' ? { ...e, body: 'سمعت صوت معدني' } : e));
  const corpus = buildCorpus({ evidence: rows, objects: [], subjects: [], log: [] }, 'title');
  assert.deepEqual(searchCorpus(corpus, ['معدني']), []);
});

test('testimony and interrogation lines are labelled as claims, not sources', async () => {
  const out = asSearch(
    (
      await runInquiry(
        ask('وين انذكر كريم؟'),
        fakeDeps({
          specs: ['field', 'records'],
          log: [
            { id: 'log-1', character_code: 'KAREEM', speaker: 'character', content: 'كنت بمكتب الأمن معظم الليلة.' },
            { id: 'log-2', character_code: 'KAREEM', speaker: 'player', content: 'كريم وين كنت؟' },
          ],
        }),
      )
    ).body,
  );
  const byRef = new Map(out.results.map((r) => [`${r.ref.type}:${r.ref.code}`, r]));
  assert.equal(byRef.get('evidence:V-02')?.epistemic, 'claim');
  assert.equal(byRef.get('subject:KAREEM')?.epistemic, 'source');
  assert.equal(byRef.get('interrogation:log-1')?.epistemic, 'claim');
  assert.equal(byRef.has('interrogation:log-2'), false, 'player questions are not case material');
});

// ------------------------------------------------------------
// 6. التحقق من المراجع
// ------------------------------------------------------------
test('fabricated or stale source references are dropped by the citation gate', () => {
  const corpus = buildCorpus({
    evidence: evidenceFor(['digital']),
    objects: objectsFor({ laptop: 'shared' }),
    subjects: SUBJECTS,
    log: [],
  }, 'title');
  const real = searchCorpus(corpus, ['لابتوب']);
  assert.equal(real.length, 1);

  const fabricated: SearchResult = { ...(real[0] as SearchResult), ref: { type: 'evidence', code: 'Z-99' }, open: { kind: 'evidence', code: 'Z-99' } };
  const forgedAccess: SearchResult = {
    ...(real[0] as SearchResult),
    ref: { type: 'evidence', code: 'V-06' },
    access: 'full',
    excerpt: 'سمعت صوت معدني',
    open: { kind: 'evidence', code: 'V-06' },
  };
  assert.deepEqual(verifyResults([...real, fabricated, forgedAccess], corpus), real);

  // مرجع صار قديماً: نفس النتيجة لم تعد ضمن مواد اللاعب (المصدر لم يعد ظاهراً).
  const later = buildCorpus({ evidence: [], objects: objectsFor({ laptop: 'hidden' }), subjects: [], log: [] }, 'title');
  assert.deepEqual(verifyResults(real, later), []);
});

test('model output cannot inject sources: results always come from the authorized corpus', async () => {
  const deps = fakeDeps({
    model: () =>
      JSON.stringify({
        intent: 'search',
        tool: 'CASE_SEARCH',
        query: 'Z-99 اعتراف',
        confidence: 0.9,
        sources: [{ type: 'evidence', code: 'Z-99' }],
        answer: 'كريم هو المسؤول',
      }),
  });
  const out = asSearch((await runInquiry(ask('في حدا شاف شي غريب بالممر بعد نص الليل؟'), deps)).body);
  assert.deepEqual(out.results, []);
  assert.ok(!JSON.stringify(out).includes('كريم هو المسؤول'));
});
