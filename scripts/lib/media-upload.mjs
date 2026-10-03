// ============================================================
// scripts/lib/media-upload.mjs
// كل ما يلمس Supabase فعلياً: فحص الـ bucket، رفع الملف،
// تحديث evidence.media_path. لا شي هون يشتغل بوضع --dry-run.
// ============================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fail } from './media-validation.mjs';

// ------------------------------------------------------------
// بدون هذا، رفع Buffer خام عبر supabase-js يسجّل الكائن كـ
// text/plain افتراضياً — وهذا بالضبط سبب ظهور بايتات PDF الخام
// بالمتصفح بدل عرضه. لازم Content-Type صريح وقت الرفع.
// ------------------------------------------------------------
const CONTENT_TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

export function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} bucket
 */
export async function verifyBucket(supabase, bucket) {
  const { data: bucketInfo, error } = await supabase.storage.getBucket(bucket);

  if (error || !bucketInfo) {
    fail(
      `Bucket "${bucket}" غير موجود. شغّل sql/014_storage.sql على ` +
        'Supabase أولاً قبل أي رفع.',
    );
    return;
  }

  if (bucketInfo.public) {
    fail(
      `Bucket "${bucket}" عام (public = true)! هذا غير آمن لأدلة ` +
        'حقيقية. صحّح إعداد الـ bucket قبل أي رفع.',
    );
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} bucket
 * @param {string} contentRoot
 * @param {import('./media-mapping.mjs').MediaMapping} mapping
 * @param {boolean} force
 */
export async function uploadOne(supabase, bucket, contentRoot, mapping, force) {
  const localPath = path.join(contentRoot, mapping.sourceFile);
  const fileBuffer = await readFile(localPath);
  const contentType = getContentType(mapping.sourceFile);

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(mapping.targetPath, fileBuffer, {
      upsert: force === true,
      contentType,
    });

  if (uploadError) {
    return { ok: false, stage: 'upload', message: uploadError.message };
  }

  const { data: existing, error: readError } = await supabase
    .from('evidence')
    .select('media_path')
    .eq('case_id', mapping.caseId)
    .eq('code', mapping.evidenceCode)
    .maybeSingle();

  if (readError) {
    return { ok: false, stage: 'read-evidence', message: readError.message };
  }

  if (!existing) {
    return {
      ok: false,
      stage: 'read-evidence',
      message: `لا يوجد دليل بكود ${mapping.evidenceCode} بقضية ${mapping.caseId}`,
    };
  }

  if (existing.media_path && existing.media_path !== mapping.targetPath && !force) {
    return {
      ok: false,
      stage: 'conflict',
      message:
        `evidence.media_path موجود مسبقاً بقيمة مختلفة ` +
        `(${existing.media_path}). استخدم --force للتجاوز الواعي.`,
    };
  }

  const { error: updateError } = await supabase
    .from('evidence')
    .update({ media_path: mapping.targetPath })
    .eq('case_id', mapping.caseId)
    .eq('code', mapping.evidenceCode);

  if (updateError) {
    return { ok: false, stage: 'update-evidence', message: updateError.message };
  }

  return { ok: true };
}
