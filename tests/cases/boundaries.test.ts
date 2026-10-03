// ============================================================
// tests/cases/boundaries.test.ts
// حدود السيرفر/العميل: الحقيقة المكتوبة للقضايا (src/server/**) ومسارات
// الوسائط (src/lib/sceneMedia.ts) لا تُستورد أبداً من ملف عميل ولا من
// src/cases (الآمن للمتصفح). لا حزمة server-only مثبتة، فهذا الاختبار
// هو الحارس.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p.replaceAll('\\', '/')] : [];
  });
}

const FILES = walk('src');
const SERVER_ONLY = [/@\/server\//, /\/server\/cases\//, /@\/lib\/sceneMedia/, /lib\/sceneMedia['"]/];
// من يحق له استيراد حقيقة السيرفر: مكوّنات صفحات السيرفر، مسارات API، وحدات السيرفر، وsceneMedia نفسها.
const ALLOWED_IMPORTERS = [/^src\/app\/(.+\/)?page\.tsx$/, /^src\/app\/api\//, /^src\/server\//, /^src\/lib\/sceneMedia\.ts$/];

test('no client component or browser-safe module imports server-only case truth', () => {
  for (const f of FILES) {
    const src = readFileSync(f, 'utf8');
    const imports = [...src.matchAll(/(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    const serverImports = imports.filter((i) => SERVER_ONLY.some((re) => re.test(i)));
    if (serverImports.length === 0) continue;
    assert.ok(!/^\s*['"]use client['"]/m.test(src), `${f} is a client module importing ${serverImports.join(', ')}`);
    assert.ok(ALLOWED_IMPORTERS.some((re) => re.test(f)), `${f} may not import ${serverImports.join(', ')}`);
  }
});

test('browser-safe case modules never contain storage paths', () => {
  for (const f of FILES.filter((x) => x.startsWith('src/cases/'))) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/\.(png|jpe?g|webp|mp3|mp4|wav|pdf)['"]/.test(src), `${f} contains a media path`);
    assert.ok(!/media_path/.test(src), f);
  }
});
