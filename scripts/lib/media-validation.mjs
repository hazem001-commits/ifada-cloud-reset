// ============================================================
// scripts/lib/media-validation.mjs
// فحوصات محلية فقط — بدون أي اتصال بالشبكة. تشتغل قبل أي رفع
// حقيقي، وأيضاً بوضع --dry-run.
// ============================================================

import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { isPendingApproval } from './media-mapping.mjs';

export function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/**
 * @param {import('./media-mapping.mjs').MediaMapping[]} mappings
 * @param {string} contentRoot
 */
export function validateMappingsLocally(mappings, contentRoot) {
  const seenCodes = new Set();
  const seenTargets = new Set();

  for (const m of mappings) {
    if (isPendingApproval(m.sourceFile)) {
      fail(
        `الملف "${m.sourceFile}" ضمن قائمة قيد الموافقة الصريحة — ` +
          'ممنوع ربطه قبل موافقة منفصلة صريحة.',
      );
    }

    const codeKey = `${m.caseId}:${m.evidenceCode}`;
    if (seenCodes.has(codeKey)) {
      fail(`ربط مكرر لنفس الدليل: ${codeKey}. لكل دليل ربط واحد فقط.`);
    }
    seenCodes.add(codeKey);

    if (seenTargets.has(m.targetPath)) {
      fail(`مسار مكرر داخل الـ bucket: ${m.targetPath}.`);
    }
    seenTargets.add(m.targetPath);

    const localPath = path.join(contentRoot, m.sourceFile);
    if (!existsSync(localPath)) {
      fail(`الملف المحلي غير موجود: ${m.sourceFile}`);
    }
  }
}
