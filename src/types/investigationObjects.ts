// ============================================================
// src/types/investigationObjects.ts
// محرك التفاعل التحقيقي — أنواع الواجهة. مرآة لِـ
// investigation_object_index / execute_object_interaction
// (sql/019_investigation_objects.sql). لا حالة مخفية هون —
// كل شي بيرجع من السيرفر أصلاً مفلتر حسب صلاحية اللاعب.
// ============================================================

import type { Specialization } from "./database";

/** "archive" و"access" أدوات، مش أدلة — ما بيدخلوا ملف القضية بأنفسهم. */
export type ObjectCategory = "location" | "object" | "device" | "archive" | "access";

// ------------------------------------------------------------
// بيانات أداة العنصر لحالته الحالية (object_workspace، sql/025).
// آمنة للعرض: تصل فقط لعناصر مرئية لي، ولحالتها الحالية بس.
// ------------------------------------------------------------
export interface DeviceFile {
  id: string;
  name: string;
  type?: string;
  modified?: string;
  status?: string;
  /** إجراء تفاعل موجود أصلاً بقائمة إجراءات العنصر (مش إجراء مخفي). */
  action?: string;
}

export type AccessStatus = "LOCKED" | "ACCESS_METHOD_AVAILABLE" | "OPENED";

export type ObjectWorkspace =
  | { kind: "device"; device: string | null; files: DeviceFile[] }
  | { kind: "archive" }
  | { kind: "access"; lock: string | null; status: AccessStatus };

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** يحوّل jsonb غير موثوق الشكل لنوع مضبوط — أي شي غريب = null (بدون أداة). */
export function parseWorkspace(raw: unknown): ObjectWorkspace | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === "archive") return { kind: "archive" };
  if (r.kind === "access") {
    const s = r.status;
    const status: AccessStatus =
      s === "LOCKED" || s === "ACCESS_METHOD_AVAILABLE" || s === "OPENED" ? s : "LOCKED";
    return { kind: "access", lock: str(r.lock) ?? null, status };
  }
  if (r.kind === "device") {
    const files = Array.isArray(r.files)
      ? r.files.flatMap((f): DeviceFile[] => {
          if (!f || typeof f !== "object") return [];
          const o = f as Record<string, unknown>;
          const id = str(o.id);
          const name = str(o.name);
          if (!id || !name) return [];
          return [{ id, name, type: str(o.type), modified: str(o.modified), status: str(o.status), action: str(o.action) }];
        })
      : [];
    return { kind: "device", device: str(r.device) ?? null, files };
  }
  return null;
}

export interface ObjectAction {
  code: string;
  label: string;
  spec: Specialization;
}

export interface InvestigationObject {
  code: string;
  category: ObjectCategory;
  parent_code: string | null;
  title: string;
  description: string;
  state: string;
  discovered: boolean;
  is_shared: boolean;
  processing: boolean;
  actions: ObjectAction[];
}

// الأقسام اللي بتحدد "شكل محطة العمل" — مش نفس مفهوم owner_spec
// بالأدلة؛ هون بتنعرض حسب آخر إجراء متاح على العنصر.
export const WORKSTATION_LABEL: Record<Specialization, string> = {
  field: "ميداني",
  digital: "رقمي",
  forensics: "الطب الشرعي",
  records: "السجلات",
};

const INTERACTION_ERRORS: Record<string, string> = {
  NOT_A_MEMBER: "إنت مش من فريق هذا التحقيق.",
  OBJECT_NOT_FOUND: "ما في هذا العنصر.",
  INTERACTION_NOT_FOUND: "هذا الإجراء غير متاح.",
  WRONG_SPECIALIZATION: "هذا الإجراء خارج تخصصك.",
  NOT_SHARED: "هذا الاكتشاف لسا خاص — لازم يُشارك مع الفريق أولاً.",
  INVALID_STATE: "ما بتقدر تعمل هذا الإجراء هلأ.",
  NOT_DISCOVERED: "لسا ما اكتشفت هذا الشي.",
  NOT_YOUR_DISCOVERY: "بس اللي اكتشفها يقدر يشاركها.",
};

export function translateInteractionError(message: string): string {
  for (const key of Object.keys(INTERACTION_ERRORS)) {
    if (message.includes(key)) return INTERACTION_ERRORS[key] as string;
  }
  return "صار خطأ غير متوقع.";
}
