#!/usr/bin/env node
// ============================================================
// scripts/upload-content.mjs
// يرفع وسائط أدلة معتمدة صراحةً من content-source/ إلى bucket
// case-media الخاص، ويحدّث evidence.media_path للسجل المطابق.
// منطق الربط/الفحص/الرفع بـ scripts/lib/*.mjs — هذا الملف
// تنسيق سطر الأوامر فقط.
//
// الاستخدام (لاحقاً، بعد الموافقة — هذا السكربت ما تم تشغيله بعد):
//   node scripts/upload-content.mjs --dry-run   فحص محلي فقط، بدون شبكة
//   node scripts/upload-content.mjs             رفع فعلي + تحديث DB
//   node scripts/upload-content.mjs --force     يسمح بتحديث media_path
//                                                موجود مسبقاً بقيمة مختلفة
//
// متغيرات البيئة المطلوبة وقت التشغيل — لا تُقرأ من أي ملف هنا،
// فقط من process.env:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================

import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { MAPPINGS } from './lib/media-mapping.mjs';
import { fail, validateMappingsLocally } from './lib/media-validation.mjs';
import { verifyBucket, uploadOne } from './lib/media-upload.mjs';

const BUCKET = 'case-media';
const CONTENT_ROOT = path.resolve(process.cwd(), 'content-source');

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const force = args.has('--force');

  console.log(`— IFADA upload-content — ${dryRun ? 'فحص فقط (dry-run)' : 'رفع فعلي'} —`);

  validateMappingsLocally(MAPPINGS, CONTENT_ROOT);

  if (MAPPINGS.length === 0) {
    console.log('لا يوجد أي ربط معتمد بقائمة MAPPINGS حالياً. لا شي للرفع.');
    return;
  }

  if (dryRun) {
    console.log(`${MAPPINGS.length} ربط صالح محلياً. لا اتصال بـ Supabase بوضع --dry-run.`);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    fail(
      'متغيرات البيئة الناقصة: NEXT_PUBLIC_SUPABASE_URL و/أو ' +
        'SUPABASE_SERVICE_ROLE_KEY. لازم تكون موجودة بالبيئة وقت ' +
        'التشغيل — هذا السكربت ما بيقرأها من أي ملف.',
    );
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  await verifyBucket(supabase, BUCKET);

  const results = [];
  for (const mapping of MAPPINGS) {
    const result = await uploadOne(supabase, BUCKET, CONTENT_ROOT, mapping, force);
    results.push(result);

    if (result.ok) {
      console.log(`✓ ${mapping.evidenceCode} ← ${mapping.sourceFile}`);
    } else {
      console.error(`✗ ${mapping.evidenceCode} (${result.stage}): ${result.message}`);
    }
  }

  const failedCount = results.filter((r) => !r.ok).length;
  console.log(`\nالنتيجة: ${results.length - failedCount}/${results.length} نجح.`);

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('✗ خطأ غير متوقع:', err instanceof Error ? err.message : err);
  process.exit(1);
});
