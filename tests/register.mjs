// ============================================================
// tests/register.mjs
// مشغّل اختبارات Node المدمج (node --test) يشغّل TypeScript مباشرة
// (type stripping). هذا الخطاف يحلّ فقط ما يعتمد عليه كود المشروع:
//   '@/…'          → src/…
//   './x' بلا امتداد → './x.ts' (أو .tsx / index.ts)
// بلا أي حزمة إضافية.
// ============================================================
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;
    if (specifier.startsWith('@/')) {
      base = path.join(SRC, specifier.slice(2));
    } else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
      // new URL يحترم كون الأصل ملفاً أو مجلداً (--import يمرّر مجلد العمل).
      base = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (base && !/\.[cm]?[jt]sx?$/.test(base)) {
      for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
        if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    if (base) return nextResolve(pathToFileURL(base).href, context);
    return nextResolve(specifier, context);
  },
});
