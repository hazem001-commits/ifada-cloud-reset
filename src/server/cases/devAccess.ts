// ============================================================
// src/server/cases/devAccess.ts
// سيرفر فقط. من يقدر يفتح قضية "قيد التطوير"؟
//   • بيئة التطوير المحلية (next dev): كل القضايا قيد التطوير.
//   • غير ذلك: فقط القضايا المذكورة صراحةً بـ IFADA_DEV_CASES
//     (قائمة معرّفات مفصولة بفواصل) — للمطوّرين على نشر تجريبي.
// الإنتاج بلا متغير = لا وصول. لا يُقرأ أي سر، والقيمة لا تُطبع.
// ============================================================
import type { DevCaseAccess } from '@/cases/registry';

export function devCaseAccess(env: Record<string, string | undefined> = process.env): DevCaseAccess {
  const cases = new Set(
    (env.IFADA_DEV_CASES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return { all: env.NODE_ENV === 'development', cases };
}
