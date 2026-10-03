// ============================================================
// tests/inquiry/router.test.ts
// موجّه النية: قائمة سماح صارمة، رد آمن لغير المعروف، وحد نداء
// نموذج واحد لكل طلب — وأمثلة المنتج الحقيقية.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInquiry } from '../../src/lib/inquiry/runInquiry';
import { routeByRules, validateModelDecision, extractJson } from '../../src/lib/inquiry/router';
import { allowedTools } from '../../src/lib/inquiry/tools';
import type { InquiryResponse } from '../../src/lib/inquiry/types';
import { CATALOG, ask, fakeDeps } from './fixtures';

const kindOf = (body: unknown) => (body as InquiryResponse).kind;

// ------------------------------------------------------------
// أمثلة المنتج: قواعد ثابتة، صفر نداء نموذج
// ------------------------------------------------------------
test('product examples route deterministically', () => {
  assert.deepEqual(routeByRules('وين انذكر كريم؟'), { kind: 'search', terms: ['كريم'], by: 'rules' });
  assert.deepEqual(routeByRules('شو عنا عن Master Key؟'), { kind: 'search', terms: ['master', 'key'], by: 'rules' });
  assert.deepEqual(routeByRules('وين شفنا اسم آدم؟'), { kind: 'search', terms: ['ادم'], by: 'rules' });
  assert.deepEqual(routeByRules('شو عنا عن اللابتوب؟'), { kind: 'search', terms: ['اللابتوب'], by: 'rules' });
  assert.deepEqual(routeByRules('بدي أعرف مين دخل بعد رامي'), { kind: 'tool', tool: 'ACCESS_LOG' });
  assert.deepEqual(routeByRules('قارنلي كلام كريم مع الكاميرا'), { kind: 'compare' });
  assert.deepEqual(routeByRules('مين القاتل؟'), { kind: 'solve' });
});

test('"who entered after Rami" points to the real access tool and never answers', async () => {
  const deps = fakeDeps({ specs: ['digital', 'forensics'], world: { door: 'shared' } });
  const out = await runInquiry(ask('بدي أعرف مين دخل بعد رامي'), deps);
  const body = out.body as Extract<InquiryResponse, { kind: 'tool' }>;
  assert.equal(body.kind, 'tool');
  assert.equal(body.tool, 'ACCESS_LOG');
  assert.match(body.message, /^سجل الدخول ممكن يساعدك/);
  assert.deepEqual(body.open, { kind: 'object', code: 'DOOR_714', location: 'ROOM_714' });
  assert.ok(!/كريم|00:06|Master/i.test(JSON.stringify(body)), 'the router must not state case facts');
  assert.equal(out.modelCalls, 0);
});

test('tool readiness reflects the real challenge_index, sharing and specialization', async () => {
  const ready = await runInquiry(
    ask('بدي أعرف مين دخل بعد رامي'),
    fakeDeps({
      specs: ['digital', 'forensics'],
      world: { door: 'shared' },
      challenges: [{ code: 'DOOR_LOG_QUERY', object_code: 'DOOR_714', input_config: { tool: 'access_log' } }],
    }),
  );
  assert.equal((ready.body as { status: string }).status, 'ready');

  const mustShare = await runInquiry(ask('بدي أعرف مين دخل بعد رامي'), fakeDeps({ specs: ['field', 'records'], world: { door: 'mine' } }));
  assert.equal((mustShare.body as { status: string }).status, 'needs_share');

  const otherSpecialist = await runInquiry(ask('بدي أعرف مين دخل بعد رامي'), fakeDeps({ specs: ['field', 'records'], world: { door: 'shared' } }));
  assert.equal((otherSpecialist.body as { status: string }).status, 'needs_specialist');
});

test('comparison is not improvised', async () => {
  const deps = fakeDeps({ model: () => '{"intent":"search","tool":"CASE_SEARCH","query":"كريم","confidence":1}' });
  const out = await runInquiry(ask('قارنلي كلام كريم مع الكاميرا'), deps);
  assert.equal(kindOf(out.body), 'unsupported');
  assert.equal(out.modelCalls, 0);
  assert.deepEqual(deps.reads, [], 'no material is read for an unsupported mechanic');
});

test('requests to solve the case get a guard, not an answer', async () => {
  const out = await runInquiry(ask('مين القاتل؟'), fakeDeps());
  assert.equal(kindOf(out.body), 'guard');
});

// ------------------------------------------------------------
// 7. قائمة السماح
// ------------------------------------------------------------
test('model cannot invoke a tool outside the server allowlist', () => {
  const allowed = allowedTools(CATALOG);
  for (const tool of ['EVALUATE_THEORY', 'DELETE_EVIDENCE', 'run_challenge', 'SQL', 'case_search']) {
    assert.deepEqual(validateModelDecision({ intent: 'tool', tool, query: null, confidence: 0.99 }, allowed), { kind: 'unknown' });
  }
  // أداة حقيقية بالنظام لكنها غير موجودة بهذه القضية → مرفوضة أيضاً.
  const noInterrogation = allowedTools({ ...CATALOG, interrogation: false });
  assert.deepEqual(
    validateModelDecision({ intent: 'tool', tool: 'INTERROGATION', query: null, confidence: 0.9 }, noInterrogation),
    { kind: 'unknown' },
  );
  assert.deepEqual(validateModelDecision({ intent: 'tool', tool: 'CCTV', query: null, confidence: 0.9 }, allowed), { kind: 'tool', tool: 'CCTV' });
});

test('model output with wrong shape, low confidence or prose is rejected', () => {
  const allowed = allowedTools(CATALOG);
  assert.deepEqual(validateModelDecision(null, allowed), { kind: 'unknown' });
  assert.deepEqual(validateModelDecision('CCTV', allowed), { kind: 'unknown' });
  assert.deepEqual(validateModelDecision({ intent: 'tool', tool: 'CCTV', confidence: 0.2 }, allowed), { kind: 'unknown' });
  assert.deepEqual(validateModelDecision({ intent: 'tool', tool: 'CCTV', confidence: '0.9' }, allowed), { kind: 'unknown' });
  assert.deepEqual(validateModelDecision({ intent: 'answer', tool: null, confidence: 0.9 }, allowed), { kind: 'unknown' });
  assert.deepEqual(validateModelDecision({ intent: 'search', tool: 'CCTV', query: 'x', confidence: 0.9 }, allowed), { kind: 'unknown' });
  assert.equal(extractJson('Kareem entered at 00:06.'), null);
  assert.deepEqual(extractJson('<think>hmm</think>\n{"intent":"unknown","tool":null,"query":null,"confidence":0.6}'), {
    intent: 'unknown',
    tool: null,
    query: null,
    confidence: 0.6,
  });
});

test('an out-of-allowlist tool from the model becomes a safe fallback end-to-end', async () => {
  const deps = fakeDeps({ model: () => '{"intent":"tool","tool":"EVALUATE_THEORY","query":null,"confidence":0.97}' });
  const out = await runInquiry(ask('في حدا شاف شي غريب بالممر بعد نص الليل؟'), deps);
  assert.equal(kindOf(out.body), 'fallback');
  assert.equal(out.modelCalls, 1);
});

// ------------------------------------------------------------
// 8. نية غير معروفة
// ------------------------------------------------------------
test('unknown intent returns a safe fallback instead of an answer', async () => {
  const prose = fakeDeps({ model: () => 'The killer is probably the security manager because he lied.' });
  const out = await runInquiry(ask('في حدا شاف شي غريب بالممر بعد نص الليل؟'), prose);
  assert.equal(kindOf(out.body), 'fallback');
  assert.ok(!JSON.stringify(out.body).includes('killer'));

  const noModel = await runInquiry(ask('في حدا شاف شي غريب بالممر بعد نص الليل؟'), fakeDeps({ model: null }));
  assert.equal(kindOf(noModel.body), 'fallback');
  assert.equal(noModel.modelCalls, 0);
});

test('the model never receives case material — only the request, tool menu and specializations', async () => {
  const deps = fakeDeps({ model: () => null });
  await runInquiry(ask('في حدا شاف شي غريب بالممر بعد نص الليل؟'), deps);
  assert.equal(deps.prompts.length, 1);
  const prompt = deps.prompts[0] ?? '';
  for (const secret of ['Staff Master Key', 'سمعت صوت', 'لابتوب مفتوح', 'مدير أمن الفندق']) {
    assert.ok(!prompt.includes(secret), `prompt leaked: ${secret}`);
  }
  assert.ok(!deps.reads.includes('evidence_index'), 'routing does not read evidence');
});

test('at most one model call per submission, even when search finds nothing', async () => {
  let calls = 0;
  const deps = fakeDeps({
    model: () => {
      calls += 1;
      return '{"intent":"search","tool":"CASE_SEARCH","query":"شي مش موجود","confidence":0.9}';
    },
  });
  const out = await runInquiry(ask('وين انذكر زمرد؟'), deps);
  assert.equal(kindOf(out.body), 'search');
  assert.equal(calls, 1);
  assert.equal(out.modelCalls, 1);
});

test('a model-normalized query is marked as interpretation, results still grounded', async () => {
  const deps = fakeDeps({
    specs: ['digital', 'forensics'],
    model: () => '{"intent":"search","tool":"CASE_SEARCH","query":"Master Key","confidence":0.9}',
  });
  const out = await runInquiry(ask('وين انذكر المفتاح الرئيسي؟'), deps);
  const body = out.body as Extract<InquiryResponse, { kind: 'search' }>;
  assert.equal(body.interpretation.by, 'model');
  assert.deepEqual(body.results.map((r) => r.ref.code), ['D-02']);
});
