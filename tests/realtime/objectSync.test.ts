// ============================================================
// tests/realtime/objectSync.test.ts
// مزامنة عناصر التحقيق: REALTIME → إشارة فقط → جلب موثوق.
// ⚠ TEST ONLY · NON-CANON. "الخادم" هنا محاكٍ صغير لإسقاط
// investigation_object_index (026: صف زميل خاص = HIDDEN، بلا وصف ولا
// إجراءات) — والواجهة تُبنى منه فقط، تماماً كما في InvestigationEngine.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OBJECT_SIGNAL_EVENT,
  configureObjectSync,
  createRefetchGate,
  objectSignalMessage,
  objectSyncTopic,
  signalObjectsChanged,
  type SignalChannel,
} from '../../src/lib/realtime/objectSync';
import { objectStatus } from '../../src/app/case/[code]/investigation/labels';
import type { InvestigationObject } from '../../src/types/investigationObjects';

const S = '00000000-0000-4000-8000-000000000714';
const OTHER = '00000000-0000-4000-8000-000000000017';
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';

// ------------------------------------------------------------
// Fake realtime channel: records handlers, lets the test fire events.
// ------------------------------------------------------------
type Handler = { type: string; filter: Record<string, string>; cb: (p: unknown) => void };
function fakeChannel() {
  const handlers: Handler[] = [];
  const sent: unknown[] = [];
  const ch = {
    on(type: 'postgres_changes' | 'broadcast', filter: Record<string, string>, cb: (p: unknown) => void) {
      handlers.push({ type, filter, cb });
      return ch as SignalChannel;
    },
    send(message: unknown) {
      sent.push(message);
      return Promise.resolve('ok');
    },
  };
  const fire = (type: 'postgres_changes' | 'broadcast', payload: unknown) => handlers.filter((h) => h.type === type).forEach((h) => h.cb(payload));
  return { ch, handlers, sent, fire };
}

// ------------------------------------------------------------
// Authoritative store + investigation_object_index projection (026 rules).
// ------------------------------------------------------------
interface Row { state: string; discovered: boolean; discoveredBy: string | null; shared: boolean; description: string }
function server() {
  const rows = new Map<string, Row>([
    ['ROOM', { state: 'KNOWN', discovered: true, discoveredBy: null, shared: true, description: 'room' }],
    ['LAPTOP', { state: 'UNKNOWN', discovered: false, discoveredBy: null, shared: false, description: 'PRIVATE LAPTOP CONTENT' }],
  ]);
  let calls = 0;
  const index = (viewer: string): InvestigationObject[] => {
    calls += 1;
    return [...rows].map(([code, r]) => {
      const visible = r.shared || r.discoveredBy === viewer || !r.discovered;
      return {
        code,
        category: code === 'ROOM' ? 'location' : 'device',
        parent_code: code === 'ROOM' ? null : 'ROOM',
        title: code,
        description: visible ? r.description : '',
        state: visible ? r.state : 'HIDDEN',
        discovered: r.discovered,
        is_shared: r.shared,
        processing: false,
        actions: visible && r.state === 'UNKNOWN' ? [{ code: 'INSPECT', label: 'افحص', spec: 'digital' }] : [],
      } as InvestigationObject;
    });
  };
  return { rows, index, calls: () => calls };
}

/** The engine's wiring, minus React: signal → gate → authoritative refetch → UI state. */
function playerUi(srv: ReturnType<typeof server>, viewer: string, sessionId = S) {
  let ui: InvestigationObject[] = [];
  const gate = createRefetchGate(async () => {
    ui = srv.index(viewer);
  });
  const chan = fakeChannel();
  configureObjectSync(chan.ch, sessionId, () => void gate.trigger());
  return { chan, gate, ui: () => ui, find: (code: string) => ui.find((o) => o.code === code)! };
}

const tick = () => new Promise((r) => setImmediate(r));

test('subscription: session-scoped postgres_changes on session_object_state (all events) + the broadcast signal, one topic per session', () => {
  const { handlers } = fakeChannel();
  const chan = fakeChannel();
  configureObjectSync(chan.ch, S, () => {});
  assert.equal(handlers.length, 0);
  assert.deepEqual(chan.handlers.map((h) => [h.type, h.filter]), [
    ['postgres_changes', { event: '*', schema: 'public', table: 'session_object_state', filter: `session_id=eq.${S}` }],
    ['broadcast', { event: OBJECT_SIGNAL_EVENT }],
  ]);
  assert.equal(objectSyncTopic(S), `investigation:${S}`);
  assert.notEqual(objectSyncTopic(S), objectSyncTopic(OTHER));
});

test('a session_object_state realtime signal triggers an authoritative refetch (INSERT, UPDATE, DELETE)', async () => {
  const srv = server();
  const b = playerUi(srv, B);
  for (const eventType of ['INSERT', 'UPDATE', 'DELETE']) {
    const before = srv.calls();
    b.chan.fire('postgres_changes', { eventType, new: eventType === 'DELETE' ? {} : { session_id: S }, old: { session_id: S } });
    await tick();
    assert.equal(srv.calls(), before + 1, eventType);
  }
  b.chan.fire('broadcast', { event: OBJECT_SIGNAL_EVENT, payload: { session: S } });
  await tick();
  assert.equal(srv.calls(), 4, 'broadcast signal refetches too');
});

test('wrong-session events never touch the current session', async () => {
  const srv = server();
  const b = playerUi(srv, B);
  b.chan.fire('postgres_changes', { eventType: 'UPDATE', new: { session_id: OTHER }, old: { session_id: OTHER } });
  b.chan.fire('postgres_changes', { eventType: 'DELETE', new: {}, old: { session_id: OTHER } });
  b.chan.fire('broadcast', { event: OBJECT_SIGNAL_EVENT, payload: { session: OTHER } });
  await tick();
  assert.equal(srv.calls(), 0);
  assert.deepEqual(b.ui(), []);
});

test('cleanup: after dispose no signal refetches', async () => {
  const srv = server();
  const b = playerUi(srv, B);
  b.gate.dispose();
  b.chan.fire('postgres_changes', { new: { session_id: S } });
  b.chan.fire('broadcast', { payload: { session: S } });
  await tick();
  assert.equal(srv.calls(), 0);
});

test('A privately inspects LAPTOP → B (no row event, RLS) gets the broadcast → refetch shows "لدى زميل", redacted, no actions', async () => {
  const srv = server();
  const a = playerUi(srv, A);
  const b = playerUi(srv, B);
  await b.gate.trigger();
  assert.equal(objectStatus(b.find('LAPTOP')).label, 'متاح للتحقيق');
  // A's action (server), then A's engine signals the team
  Object.assign(srv.rows.get('LAPTOP')!, { state: 'DISCOVERED', discovered: true, discoveredBy: A });
  await a.gate.trigger();
  signalObjectsChanged(a.chan.ch, S);
  assert.deepEqual(a.chan.sent, [objectSignalMessage(S)]);
  // the realtime transport delivers A's broadcast to B
  b.chan.fire('broadcast', (a.chan.sent[0] as { payload: unknown }));
  await tick();
  const laptop = b.find('LAPTOP');
  assert.equal(objectStatus(laptop).label, 'لدى زميل');
  assert.equal(laptop.state, 'HIDDEN');
  assert.equal(laptop.description, '');
  assert.deepEqual(laptop.actions, []);
  assert.ok(!JSON.stringify(b.ui()).includes('PRIVATE LAPTOP CONTENT'));
  assert.ok(!JSON.stringify(b.ui()).includes('DISCOVERED'));
  // A sees their own private discovery
  assert.equal(objectStatus(a.find('LAPTOP')).label, 'اكتشاف خاص');
});

test('realtime payload content never becomes UI state — only the refetch result does', async () => {
  const srv = server();
  Object.assign(srv.rows.get('LAPTOP')!, { state: 'ANALYZED', discovered: true, discoveredBy: A });
  const b = playerUi(srv, B);
  const leak = { session_id: S, object_code: 'LAPTOP', state: 'ANALYZED', description: 'PRIVATE LAPTOP CONTENT', discovered_by: A, is_shared: true };
  b.chan.fire('postgres_changes', { eventType: 'UPDATE', new: leak, old: leak });
  b.chan.fire('broadcast', { event: OBJECT_SIGNAL_EVENT, payload: { session: S, ...leak } });
  await tick();
  const laptop = b.find('LAPTOP');
  assert.equal(laptop.state, 'HIDDEN');
  assert.equal(laptop.is_shared, false, 'payload is_shared ignored');
  assert.ok(!/ANALYZED|PRIVATE LAPTOP CONTENT/.test(JSON.stringify(b.ui())));
});

test('private → shared becomes visible to B after the refetch; own state transitions too', async () => {
  const srv = server();
  const b = playerUi(srv, B);
  Object.assign(srv.rows.get('LAPTOP')!, { state: 'DISCOVERED', discovered: true, discoveredBy: A });
  b.chan.fire('broadcast', { payload: { session: S } });
  await tick();
  assert.equal(objectStatus(b.find('LAPTOP')).label, 'لدى زميل');
  srv.rows.get('LAPTOP')!.shared = true; // share_object_discovery: a SHARED row passes B's RLS → row event
  b.chan.fire('postgres_changes', { eventType: 'UPDATE', new: { session_id: S } });
  await tick();
  assert.equal(b.find('LAPTOP').state, 'DISCOVERED');
  assert.equal(b.find('LAPTOP').description, 'PRIVATE LAPTOP CONTENT');
  assert.equal(objectStatus(b.find('LAPTOP')).label, 'مشترك مع الفريق');
  srv.rows.get('LAPTOP')!.state = 'EXTRACTED'; // later transition on the shared object (incl. processing completion)
  b.chan.fire('postgres_changes', { eventType: 'UPDATE', new: { session_id: S } });
  await tick();
  assert.equal(b.find('LAPTOP').state, 'EXTRACTED');
});

test('no refetch storm: signals during an in-flight refetch coalesce into ONE more; the latest result wins', async () => {
  let calls = 0;
  let release: (() => void) | null = null;
  let value = 0;
  let shown = -1;
  const gate = createRefetchGate(async () => {
    calls += 1;
    const snapshot = ++value;
    if (calls === 1) await new Promise<void>((r) => (release = r));
    shown = snapshot;
  });
  const first = gate.trigger();
  for (let i = 0; i < 6; i += 1) gate.trigger();
  assert.equal(calls, 1, 'no overlapping refetch');
  release!();
  await first;
  assert.equal(calls, 2, 'six signals → one follow-up refetch');
  assert.equal(shown, 2, 'newest authoritative result shown last');
});

test('a failing refetch never breaks later signals', async () => {
  let calls = 0;
  const gate = createRefetchGate(async () => {
    calls += 1;
    if (calls === 1) throw new Error('network');
  });
  await gate.trigger();
  await gate.trigger();
  assert.equal(calls, 2);
});

test('the team signal carries only the session id; sending is best-effort', () => {
  assert.deepEqual(objectSignalMessage(S), { type: 'broadcast', event: OBJECT_SIGNAL_EVENT, payload: { session: S } });
  assert.doesNotThrow(() => signalObjectsChanged(null, S));
  assert.doesNotThrow(() => signalObjectsChanged({ send: () => { throw new Error('closed'); } }, S));
  assert.doesNotThrow(() => signalObjectsChanged({ send: () => Promise.reject(new Error('closed')) }, S));
});

// ------------------------------------------------------------
// The engine actually uses this wiring (structural — no React runtime here).
// ------------------------------------------------------------
const ENGINE = readFileSync('src/app/case/[code]/investigation/InvestigationEngine.tsx', 'utf8');

test('InvestigationEngine: one session channel, signal → gate → investigation_object_index, cleanup on unmount/session change', () => {
  assert.equal((ENGINE.match(/subscribeAuthenticated\(/g) ?? []).length, 1, 'exactly one channel');
  assert.match(ENGINE, /subscribeAuthenticated\(\s*createClient\(\),\s*objectSyncTopic\(sessionId\),/);
  assert.match(ENGINE, /configureObjectSync\(channel, sessionId, \(\) => void gate\.trigger\(\)\)/);
  assert.match(ENGINE, /const gate = createRefetchGate\(load\);/);
  assert.match(ENGINE, /return \(\) => \{\s*gate\.dispose\(\);\s*unsubscribe\(\);\s*channelRef\.current = null;/);
  assert.match(ENGINE, /\}, \[sessionId, load\]\);/);
  assert.match(ENGINE, /supabase\.rpc\('investigation_object_index', \{ p_session: sessionId \}\)/, 'authoritative source unchanged');
  assert.ok(!/payload\.(new|old)/.test(ENGINE), 'engine never reads a realtime payload');
  assert.ok(!/setInterval\([^)]*,\s*(?!PROCESSING_REFRESH_MS)/.test(ENGINE), 'no new polling');
});

test('InvestigationEngine: existing interaction behaviour unchanged; the team signal only follows a SUCCESSFUL action', () => {
  assert.match(ENGINE, /rpc\('execute_object_interaction', \{\s*p_session: sessionId,\s*p_object_code: objectCode,\s*p_interaction: interactionCode,\s*\}\);\s*if \(rpcError\) flashError\(translateInteractionError\(rpcError\.message\)\);\s*else await reloadAndSignal\(\);/);
  assert.match(ENGINE, /rpc\('share_object_discovery', \{\s*p_session: sessionId,\s*p_object_code: objectCode,\s*\}\);\s*if \(rpcError\) flashError\(translateInteractionError\(rpcError\.message\)\);\s*else await reloadAndSignal\(\);/);
  assert.match(ENGINE, /onChallengeSolved=\{\(\) => void reloadAndSignal\(\)\}/);
  assert.match(ENGINE, /await supabase\.rpc\('open_investigation', \{ p_session: sessionId \}\);\s*await load\(\);/);
  assert.match(ENGINE, /signalObjectsChanged\(channelRef\.current, sessionId\)/);
});
