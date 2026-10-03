// ============================================================
// src/lib/runtime/devGate.ts
// بوابة مفتش المحرك (DEV ONLY): يظهر فقط تحت next dev أو
// NEXT_PUBLIC_IFADA_RUNTIME_INSPECTOR=1، ولقضية يفعّل عقدها المحرك.
// ============================================================
import type { CaseContract } from '@/cases/contract';

export function runtimeInspectorEnabled(
  contract: CaseContract | null,
  env: Record<string, string | undefined> = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_IFADA_RUNTIME_INSPECTOR: process.env.NEXT_PUBLIC_IFADA_RUNTIME_INSPECTOR,
  },
): boolean {
  if (!contract?.runtime.engine) return false;
  return env.NODE_ENV === 'development' || env.NEXT_PUBLIC_IFADA_RUNTIME_INSPECTOR === '1';
}
