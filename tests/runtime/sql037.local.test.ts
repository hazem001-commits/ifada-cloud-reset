// ============================================================
// tests/runtime/sql037.local.test.ts
// Opt-in: executes 037 against a LOCAL THROWAWAY Postgres (never Supabase).
// Skipped unless IFADA_LOCAL_PG_HOST points at a disposable local cluster.
// See tests/sql-local/run-local.mjs.
// ============================================================
import { test } from 'node:test';

const HOST = process.env.IFADA_LOCAL_PG_HOST;

test('037 on a real local Postgres: verifiers, behaviour scenario, concurrency', { skip: HOST ? false : 'IFADA_LOCAL_PG_HOST not set (local throwaway cluster only)', timeout: 300_000 }, async () => {
  const { runLocal } = await import('../sql-local/run-local.mjs');
  await runLocal(() => {});
});
