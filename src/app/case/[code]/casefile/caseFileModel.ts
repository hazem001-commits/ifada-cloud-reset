// ============================================================
// src/app/case/[code]/casefile/caseFileModel.ts
// نموذج عرض ملف القضية. تصنيف بصري فقط — لا يغيّر أي صلاحية.
// كل مدخل مبني من بيانات وصلت أصلاً مصرّحاً فيها من
// evidence_index أو investigation_object_index.
//
// "هوية الأثر" (identity) تحدد شكله: ورق، عيّنة، شاشة، شريط...
// قاعدة صارمة: هوية وسائط (مراقبة/صوت/فيديو/جهاز) فقط لو في وسائط
// حقيقية (has_media) — نفس قاعدة EvidenceExaminationRoom. دليل
// نوعه video بدون وسائط (مثل الإطار المستعاد D-06) يبقى أثراً نصياً،
// ما بينعرض كشريط فيديو قابل للتشغيل.
// ============================================================

import type { EvidenceItem } from '@/types/case';
import { specLabel } from '@/types/database';
import type { InvestigationObject } from '@/types/investigationObjects';
import { classifyEvidence } from '../evidence/classify';
import { isMineOrShared } from '../investigation/labels';
import { own, type CasePresentation } from '@/cases/presentation';

type CaseProfiles = CasePresentation['objectProfiles'];

export type ArtifactIdentity =
  | 'physical'
  | 'lab'
  | 'digital'
  | 'document'
  | 'record'
  | 'testimony'
  | 'cctv'
  | 'photo'
  | 'video'
  | 'audio'
  | 'phone';

export type CaseFileSection = 'physical' | 'lab' | 'digital' | 'records' | 'testimony' | 'media';

export const SECTION_ORDER: CaseFileSection[] = [
  'physical',
  'lab',
  'digital',
  'records',
  'testimony',
  'media',
];

export const SECTION_META: Record<CaseFileSection, { title: string; note: string }> = {
  physical: { title: 'أدلة مادية', note: 'ما عُثر عليه في المكان نفسه' },
  lab: { title: 'نتائج مخبرية', note: 'عيّنات وتقارير الطب الشرعي' },
  digital: { title: 'مواد رقمية', note: 'أجهزة وملفات وسجلات إلكترونية' },
  records: { title: 'سجلات ووثائق', note: 'أوراق رسمية وتقارير وملفات' },
  testimony: { title: 'إفادات', note: 'ما قاله الأشخاص' },
  media: { title: 'صوت وصورة', note: 'لقطات وتسجيلات' },
};

export const IDENTITY_LABEL: Record<ArtifactIdentity, string> = {
  physical: 'دليل مادي',
  lab: 'نتيجة مخبرية',
  digital: 'مادة رقمية',
  document: 'وثيقة',
  record: 'سجل رسمي',
  testimony: 'إفادة',
  cctv: 'لقطة مراقبة',
  photo: 'صورة',
  video: 'تسجيل مصوّر',
  audio: 'تسجيل صوتي',
  phone: 'لقطة جهاز',
};

const IDENTITY_SECTION: Record<ArtifactIdentity, CaseFileSection> = {
  physical: 'physical',
  lab: 'lab',
  digital: 'digital',
  phone: 'digital',
  document: 'records',
  record: 'records',
  testimony: 'testimony',
  cctv: 'media',
  photo: 'media',
  video: 'media',
  audio: 'media',
};

/** هويات بصرية بتعرض صورة حقيقية لو توفّرت (عبر /api/evidence-media نفسه). */
export const IMAGE_IDENTITIES: ReadonlySet<ArtifactIdentity> = new Set(['cctv', 'photo', 'phone']);

export interface CaseFileEntry {
  /** مفتاح ثابت للبطاقة نفسها. */
  key: string;
  /** يتغيّر لما تتغيّر حالة المادة (نتيجة مخبر وصلت مثلاً) — "جديد" و"وصل" يتتبّعوه هو. */
  revisionKey: string;
  code: string;
  title: string;
  identity: ArtifactIdentity;
  section: CaseFileSection;
  body: string;
  provenance: string | null;
  origin: string | null;
  clock: string | null;
  hasMedia: boolean;
  processing: boolean;
  privateToMe: boolean;
  sharedObject: boolean;
  /** دليل أقرؤه خاص بقناتي (إرشاد السيرفر): يُساهَم به في ربط مشترك، لا يُثبَّت على اللوحة. */
  channelPrivate: boolean;
  source: { kind: 'evidence'; item: EvidenceItem } | { kind: 'object'; item: InvestigationObject };
}

export function excerptLines(text: string, max: number): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, max);
}

function identityForEvidence(item: EvidenceItem): ArtifactIdentity {
  if (item.has_media) {
    // ملف القضية لا يعرف نوع الملف الفعلي (evidence_index يرجع has_media فقط)،
    // فيصنّف بنفس قاعدة classifyEvidence بدون contentType: kind='video' يصير
    // لقطة (cctv) لا شريط فيديو، وسجل مصوّر يبقى سجلاً — مثل غرفة الفحص.
    switch (classifyEvidence(item)) {
      case 'surveillance-image':
        return 'cctv';
      case 'social-image':
        return 'photo';
      case 'phone':
        return 'phone';
      case 'audio':
        return 'audio';
      case 'video':
        return 'video';
      case 'official-record':
        return 'record';
      case 'document':
        if (item.kind === 'testimony') return 'testimony';
        return item.owner_spec === 'forensics' ? 'lab' : 'document';
    }
  }
  if (item.kind === 'testimony') return 'testimony';
  if (item.owner_spec === 'forensics') return 'lab';
  if (item.owner_spec === 'digital') return 'digital';
  if (item.kind === 'record' || classifyEvidence(item) === 'official-record') return 'record';
  return 'document';
}

/** مصدر دليل مستخرج من أداة/عنصر (evidence_provenance، sql/025). */
export interface EvidenceSource {
  evidence_code: string;
  object_code: string;
  object_title: string;
  object_category: string;
}

const SOURCE_VERB: Record<string, string> = {
  archive: 'مُستخرجة من',
  access: 'من سجل',
  device: 'مُستخرجة من',
};

export function entryFromEvidence(item: EvidenceItem, source?: EvidenceSource, channelPrivate = false): CaseFileEntry {
  const identity = identityForEvidence(item);
  return {
    key: `e:${item.code}`,
    revisionKey: `e:${item.code}`,
    code: item.code,
    title: item.title,
    identity,
    section: IDENTITY_SECTION[identity],
    body: item.body ?? '',
    provenance: source
      ? `${SOURCE_VERB[source.object_category] ?? 'مصدرها'}: ${source.object_title}`
      : null,
    origin: item.owner_spec ? `ضمن اختصاص ${specLabel(item.owner_spec)}` : null,
    clock: item.clock_label,
    hasMedia: item.has_media,
    processing: false,
    privateToMe: false,
    sharedObject: false,
    channelPrivate,
    source: { kind: 'evidence', item },
  };
}

// ------------------------------------------------------------
// هوية ومصدر كل حالة عنصر تأتي من عرض القضية الحالية
// (src/cases/<case>/presentation.ts → objectProfiles)، ضمن نطاق
// caseId — لا خريطة عامة مفاتيحها أكواد عناصر فقط. غياب ملف تعريف
// = هوية افتراضية بلا عبارة مصدر (لا نص قضية أخرى أبداً).
// ------------------------------------------------------------
export function entryFromObject(object: InvestigationObject, profiles: CaseProfiles): CaseFileEntry {
  const profile = own(own(profiles, object.code) ?? {}, object.state);
  const identity: ArtifactIdentity = profile?.identity ?? (object.category === 'device' ? 'digital' : 'physical');
  return {
    key: `o:${object.code}`,
    revisionKey: `o:${object.code}@${object.state}`,
    code: object.code,
    title: object.title,
    identity,
    section: IDENTITY_SECTION[identity],
    body: object.description,
    provenance: profile?.provenance ?? null,
    origin: null,
    clock: null,
    hasMedia: false,
    processing: object.processing,
    // يوصل لملف القضية فقط لو مرئي لي: غير مشارك = اكتشافي أنا.
    privateToMe: !object.is_shared,
    sharedObject: object.is_shared,
    channelPrivate: false,
    source: { kind: 'object', item: object },
  };
}

// الأدوات (أرشيف/نظام دخول) والأماكن مش مواد — ما بتدخل الملف بنفسها؛
// اللي بتستخرجه (إطار، سجل) هو اللي بيدخل كدليل.
const NOT_MATERIAL = new Set(['location', 'archive', 'access']);

export function buildEntries(
  evidence: EvidenceItem[],
  objects: InvestigationObject[],
  sources: EvidenceSource[],
  profiles: CaseProfiles,
  privateEvidence: readonly string[] = [],
): CaseFileEntry[] {
  const readable = evidence.filter((e) => e.readable);
  const readableCodes = new Set(readable.map((e) => e.code));
  const sourceOf = new Map(sources.map((src) => [src.evidence_code, src]));
  // مدخل واحد: لو نتيجة العنصر صارت دليلاً حقيقياً أقدر أقرأه، الدليل هو المدخل.
  const realizedObjects = new Set(
    sources.filter((src) => readableCodes.has(src.evidence_code)).map((src) => src.object_code),
  );
  return [
    ...readable.map((e) => entryFromEvidence(e, sourceOf.get(e.code), privateEvidence.includes(e.code))),
    ...objects
      .filter((o) => !NOT_MATERIAL.has(o.category) && isMineOrShared(o) && !realizedObjects.has(o.code))
      .map((o) => entryFromObject(o, profiles)),
  ];
}
