// ============================================================
// scripts/lib/media-mapping.mjs
// الربط الصريح بين ملفات content-source/ وأكواد الأدلة الحالية.
//
// MAPPINGS فاضية عمداً بعد تدقيق كامل لكل أكواد room-714
// الحالية (F-01..F-07, D-01..D-08, V-01..V-09, R-01..R-10) مقابل
// أسماء الملفات بـ content-source/ ووثيقة السيناريو. ولا ملف
// واحد يذكر كوده الصريح بالمصدر — التشابه الموجود موضوعي/سياقي
// فقط، وهذا بالضبط نوع "التخمين" الممنوع. إضافة سطر هنا قرار
// بشري صريح لاحقاً، مو استنتاج آلي من اسم الملف أو محتواه.
// ============================================================

// ------------------------------------------------------------
// ملفات ممنوع ربطها الآن — قيد موافقة صريحة منفصلة. أي وجود لها
// بـ MAPPINGS (حتى لو أُضيفت بالغلط لاحقاً) يوقف التنفيذ فوراً.
// ------------------------------------------------------------
export const PENDING_APPROVAL_FILES = [
  'public/cases/room-714/statements/e30-karim-handwritten-confession.png',
  'public/cases/room-714/communications/kareem-interview-02.mp3',
  'public/cases/room-714/communications/nabil-interview-01.mp3',
  'public/cases/room-714/communications/rami-icu-statement-01.mp3',
  'public/cases/room-714/video/e29-service-corridor-search.mp4',
];

export function isPendingApproval(sourceFile) {
  if (sourceFile.includes('/visual-bible/')) return true;
  return PENDING_APPROVAL_FILES.includes(sourceFile);
}

/**
 * @typedef {Object} MediaMapping
 * @property {string} caseId       كود القضية بجدول cases
 * @property {string} evidenceCode كود الدليل بجدول evidence
 * @property {string} sourceFile   نسبي لمجلد content-source/
 * @property {string} targetPath   المسار داخل bucket case-media
 */

// ------------------------------------------------------------
// الربط المعتمد فعلياً — 9 عناصر HIGH confidence، معتمدة صراحةً
// من تقرير المراجعة البشرية (Group A: SAFE TO MAP). كل سطر كود
// دليل فريد، ونوع الملف متوافق مع kind الدليل.
// ------------------------------------------------------------
/** @type {MediaMapping[]} */
export const MAPPINGS = [
  {
    caseId: 'room-714',
    evidenceCode: 'D-03',
    sourceFile: 'public/cases/room-714/surveillance/camera-outage-report.pdf',
    targetPath: 'room-714/D-03.pdf',
  },
  {
    caseId: 'room-714',
    evidenceCode: 'V-03',
    sourceFile: 'public/cases/room-714/surveillance/cctv-1154-frame-01.png',
    targetPath: 'room-714/V-03.png',
  },
  {
    caseId: 'room-714',
    evidenceCode: 'V-08',
    sourceFile: 'public/cases/room-714/surveillance/service-elevator-1208-frame-01.jpeg',
    targetPath: 'room-714/V-08.jpeg',
  },
  {
    caseId: 'room-714',
    evidenceCode: 'D-05',
    sourceFile: 'public/cases/room-714/digital/usb-transfer-log.pdf',
    targetPath: 'room-714/D-05.pdf',
  },
  {
    caseId: 'room-714',
    evidenceCode: 'D-04',
    sourceFile: 'public/cases/room-714/forensics/security-console-login.pdf',
    targetPath: 'room-714/D-04.pdf',
  },
  {
    caseId: 'room-714',
    evidenceCode: 'R-05',
    sourceFile: 'public/cases/room-714/finance/n17-company-registry.pdf',
    targetPath: 'room-714/R-05.pdf',
  },
  {
    caseId: 'room-714',
    evidenceCode: 'R-04',
    sourceFile: 'public/cases/room-714/finance/n17-payment-record.pdf',
    targetPath: 'room-714/R-04.pdf',
  },
  {
    caseId: 'room-714',
    evidenceCode: 'R-10',
    sourceFile: 'public/cases/room-714/security/nabil-vehicle-registry-01.png',
    targetPath: 'room-714/R-10.png',
  },
  {
    caseId: 'room-714',
    evidenceCode: 'D-08',
    sourceFile: 'public/cases/room-714/communications/voice-note-1118.mp3',
    targetPath: 'room-714/D-08.mp3',
  },
  // ------------------------------------------------------------
  // Batch 1A — F-06 فقط، بموافقة صريحة بعد تدقيق الأصول. صورة الحاجز
  // المنهار بمستوى M1 لا تناقض نص F-06؛ النص المكتوب نفسه يبقى متاحاً
  // بـ"تفاصيل الدليل" بجانب الصورة (evidence/authoredContext.ts).
  // ------------------------------------------------------------
  {
    caseId: 'room-714',
    evidenceCode: 'F-06',
    sourceFile: 'public/cases/room-714/forensics/m1-railing-damage-01.png',
    targetPath: 'room-714/F-06.png',
  },
  // ------------------------------------------------------------
  // Batch 1D — R-08 فقط، بموافقة صريحة بعد فرز الأصول: سجل الاتصالات
  // يطابق مكالمات R-08 الأربع حرفياً (الأوقات، المُدد، الجهات). اسم
  // العائلة الظاهر على الأصل لا يُنقل لأي دليل آخر؛ نص R-08 المكتوب
  // يبقى متاحاً بـ"تفاصيل الدليل".
  // ------------------------------------------------------------
  {
    caseId: 'room-714',
    evidenceCode: 'R-08',
    sourceFile: 'public/cases/room-714/evidence/samer/e36-samer-call-log.png',
    targetPath: 'room-714/R-08.png',
  },
  // ------------------------------------------------------------
  // المشهد 17 — شريحة التطوير (sql/036، قيد المراجعة). ثلاثة أصول فقط
  // اجتازت بوابة القانون (CONFIRMED، ملف واحد، بلا تاريخ متعارض ولا تلوث
  // من غرفة 714 ولا علامة IFADA داخل القصة). E10 سجل نصي: نصّه هو الدليل
  // بلا ملف. لا يُشغَّل الرفع إلا بعد تطبيق 036 وموافقة Hazem الصريحة.
  // ------------------------------------------------------------
  {
    caseId: 'scene-17',
    evidenceCode: 'E05',
    sourceFile: 'private-evidence/scene-17/shared/profiles/e05-suspect-list.pdf',
    targetPath: 'scene-17/E05.pdf',
  },
  {
    caseId: 'scene-17',
    evidenceCode: 'E06',
    sourceFile: 'private-evidence/scene-17/channel-a/e06-original-rehearsal-page.pdf',
    targetPath: 'scene-17/E06.pdf',
  },
  {
    caseId: 'scene-17',
    evidenceCode: 'E07',
    sourceFile: 'private-evidence/scene-17/channel-a/e07-salma-modified-script-page.png',
    targetPath: 'scene-17/E07.png',
  },
];
