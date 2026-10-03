// ============================================================
// src/types/case.ts
// أنواع المرحلة 2 — الأدلة واللوحة.
// ============================================================

import type { Specialization } from "./database";

export type EvidenceKind =
  | "document"
  | "photo"
  | "audio"
  | "video"
  | "record"
  | "testimony";

export interface EvidenceItem {
  code: string;
  title: string;
  kind: EvidenceKind;
  /** المالك القدراتي (تخصص) — لقضايا التوزيع بالتخصص فقط. null = لا مالك قدراتي (مثل أدلة القنوات). ليس مصدر صلاحية بالقنوات أبداً. */
  owner_spec: Specialization | null;
  clock_label: string | null;
  /** يرجع null إذا التخصص مش مطابق — الواجهة بتعرضه محجوب */
  body: string | null;
  /** لا مسار Storage هون أبداً — بس علم إذا في وسائط. المسار الفعلي يُجلب من /api/evidence-media بعد فحص صلاحية بالسيرفر. */
  has_media: boolean;
  readable: boolean;
  unlocked_at: string;
}

export interface UnlockableItem {
  code: string;
  title: string;
  kind: EvidenceKind;
}

export const KIND_LABEL: Record<EvidenceKind, string> = {
  document: "وثيقة",
  photo: "صورة",
  audio: "تسجيل صوتي",
  video: "تسجيل مصوّر",
  record: "سجل",
  testimony: "إفادة",
};

const CASE_ERRORS: Record<string, string> = {
  NOT_A_MEMBER: "إنت مش من فريق هذا التحقيق.",
  EVIDENCE_NOT_FOUND: "ما في دليل بهذا الرمز.",
  WRONG_SPECIALIZATION: "هذا الدليل خارج تخصصك.",
  REQUIREMENTS_NOT_MET: "لسا ما وصلت لهذا الدليل. في شي لازم تكتشفه قبله.",
  // فرصة مؤقتة لم تُفتح قبل وقت إغلاقها (expires_ck) — المادة لم تُؤمَّن أصلاً.
  EVIDENCE_EXPIRED: "انقضت فرصة فتح هذه المادة — لم تعد متاحة.",
};

export function translateCaseError(message: string): string {
  for (const key of Object.keys(CASE_ERRORS)) {
    if (message.includes(key)) return CASE_ERRORS[key] as string;
  }
  return "صار خطأ غير متوقع.";
}
