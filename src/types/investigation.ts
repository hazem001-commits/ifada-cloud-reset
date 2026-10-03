// ============================================================
// src/types/investigation.ts
// أنواع المرحلة 3: محرك الاتساق + الاستجواب.
// ============================================================

export interface LocationItem {
  code: string;
  name: string;
}

export interface PersonItem {
  code: string;
  name: string;
}

export interface TheoryPlacement {
  id: string;
  session_id: string;
  author_id: string;
  person_code: string;
  location_code: string;
  start_ck: number;
  end_ck: number;
  note: string;
  created_at: string;
}

export type IssueKind = 'impossible' | 'contradiction' | 'gap';

export interface TheoryIssue {
  kind: IssueKind;
  person: string;
  detail: string;
}

export interface TheoryEvaluation {
  status: 'consistent' | 'consistent_with_gaps' | 'inconsistent';
  issues: TheoryIssue[];
}

export interface InterrogationSubject {
  code: string;
  name: string;
  role: string;
  current_layer: number;
}

export interface InterrogationEntry {
  id: string;
  speaker: 'player' | 'character';
  content: string;
  evidence_code: string | null;
  created_at: string;
}

// ------------------------------------------------------------
// دقائق منذ منتصف ليل بداية اليوم (23:00 = 1380)
// ------------------------------------------------------------
export function clockToMinutes(hh: number, mm: number, afterMidnight: boolean): number {
  const base = hh * 60 + mm;
  return afterMidnight ? base + 1440 : base;
}

export function minutesToClock(ck: number): string {
  const m = ((ck % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const INTERROGATE_ERRORS: Record<string, string> = {
  ONLY_FIELD_SPECIALIST_CAN_INTERROGATE: 'بس المحقق الميداني يقدر يستجوب.',
  INTERROGATION_LIMIT_REACHED: 'وصلتوا الحد الأقصى للأسئلة مع هالشخص بهالجلسة.',
  CHARACTER_NOT_FOUND: 'ما في شخص بهذا الرمز.',
  QUESTION_TOO_LONG: 'السؤال طويل كتير. اختصره.',
  AI_REQUEST_FAILED: 'ما وصل جواب. جرّب مرة ثانية.',
};

export function translateInterrogateError(code: string): string {
  return INTERROGATE_ERRORS[code] ?? 'صار خطأ غير متوقع.';
}
