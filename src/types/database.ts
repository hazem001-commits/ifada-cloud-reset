// ============================================================
// src/types/database.ts
// الأنواع المشتركة. لا يوجد any في هذا المشروع.
// ============================================================

export type Specialization = 'forensics' | 'digital' | 'field' | 'records';

export type SessionStatus = 'lobby' | 'active' | 'hearing' | 'closed' | 'abandoned';

export interface CaseSummary {
  id: string;
  title: string;
  victim_name: string;
  incident_date: string;
  classification: string;
  difficulty: number;
  duration_minutes: number;
  min_players: number;
  max_players: number;
  cover_path: string | null;
  price_cents: number;
}

export interface LobbyRow {
  session_id: string;
  case_id: string;
  case_title: string;
  status: SessionStatus;
  min_players: number;
  max_players: number;
  member_user_id: string;
  display_name: string;
  spec: Specialization;
  is_host: boolean;
}

export interface LobbyMember {
  userId: string;
  displayName: string;
  specialization: Specialization;
  isHost: boolean;
}

export interface LobbyView {
  sessionId: string;
  caseId: string;
  caseTitle: string;
  status: SessionStatus;
  minPlayers: number;
  maxPlayers: number;
  members: LobbyMember[];
}

// ------------------------------------------------------------
// وصف التخصصات — مصدر واحد للحقيقة، يُستخدم بكل الواجهات
// ------------------------------------------------------------
export interface SpecializationInfo {
  id: Specialization;
  label: string;
  canDo: string;
  cannotDo: string;
}

export const SPECIALIZATIONS: readonly SpecializationInfo[] = [
  {
    id: 'forensics',
    label: 'الطب الشرعي',
    canDo: 'تحليل الدم والأنسجة والتقارير الطبية، وطلب الفحوصات المخبرية',
    cannotDo: 'لا ترى السجلات الرقمية',
  },
  {
    id: 'digital',
    label: 'الأدلة الرقمية',
    canDo: 'فك تشفير الأجهزة، تحليل سجلات الشبكة، استعادة الملفات المحذوفة',
    cannotDo: 'لا تستجوب أحداً',
  },
  {
    id: 'field',
    label: 'التحقيق الميداني',
    canDo: 'استجواب الشهود والمشتبه فيهم، وفحص المواقع',
    cannotDo: 'لا ترى أي تحليل مخبري',
  },
  {
    id: 'records',
    label: 'السجلات والأرشيف',
    canDo: 'الوصول للأرشيف والقضايا القديمة والسجلات المالية والحكومية',
    cannotDo: 'لا تدخل مسرح الجريمة',
  },
] as const;

export function specLabel(id: Specialization): string {
  return SPECIALIZATIONS.find((s) => s.id === id)?.label ?? id;
}

// ------------------------------------------------------------
// أخطاء قاعدة البيانات مترجمة للمستخدم
// ------------------------------------------------------------
const DB_ERRORS: Record<string, string> = {
  AUTH_REQUIRED: 'لازم تسجّل دخول أولاً.',
  CASE_NOT_FOUND: 'هذه القضية غير متاحة.',
  NOT_ENTITLED: 'ما عندك صلاحية على هذه القضية.',
  SESSION_NOT_FOUND: 'ما في تحقيق بهذا الكود.',
  SESSION_ALREADY_STARTED: 'هذا التحقيق بدأ. ما بتقدر تنضم له الآن.',
  SESSION_FULL: 'الفريق مكتمل.',
  SPECIALIZATION_TAKEN: 'هذا التخصص مأخوذ. اختر غيره.',
  CODE_GENERATION_FAILED: 'صار خلل بإنشاء الكود. جرّب مرة ثانية.',
};

export function translateDbError(message: string): string {
  for (const key of Object.keys(DB_ERRORS)) {
    if (message.includes(key)) return DB_ERRORS[key] as string;
  }
  return 'صار خطأ غير متوقع. جرّب مرة ثانية.';
}

// ------------------------------------------------------------
// تحويل صفوف RPC إلى شكل الواجهة
// ------------------------------------------------------------
export function buildLobbyView(rows: LobbyRow[]): LobbyView | null {
  const first = rows[0];
  if (!first) return null;

  return {
    sessionId: first.session_id,
    caseId: first.case_id,
    caseTitle: first.case_title,
    status: first.status,
    minPlayers: first.min_players,
    maxPlayers: first.max_players,
    members: rows.map((r) => ({
      userId: r.member_user_id,
      displayName: r.display_name,
      specialization: r.spec,
      isHost: r.is_host,
    })),
  };
}
