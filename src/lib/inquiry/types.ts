// ============================================================
// src/lib/inquiry/types.ts
// "اسأل التحقيق" — شكل الرد بين /api/case-inquiry والواجهة.
// أنواع فقط (بلا منطق) — آمنة للاستيراد من المتصفح.
//
// قاعدة: كل نتيجة بحث مرجعها مصدر حقيقي من المواد المصرّح بها
// للاعب نفسه (evidence_index / investigation_object_index /
// محضر الاستجواب). لا نتيجة يكتبها نموذج لغوي، ولا استنتاج.
// ============================================================

import type { Specialization } from '@/types/database';

/** أدوات حقيقية موجودة بالمشروع — ولا أداة غيرها يقبلها الموجّه. */
export type InquiryTool =
  | 'CASE_SEARCH'
  | 'ACCESS_LOG'
  | 'CCTV'
  | 'RECORDS'
  | 'DEVICE_INVESTIGATION'
  | 'INTERROGATION';

export type SourceType = 'evidence' | 'object' | 'subject' | 'interrogation';

/**
 * الحد الأدنى من التمييز المعرفي:
 *   source — نص مصدر كما هو (سجل، وثيقة، ملاحظة فحص)
 *   claim  — كلام قاله شخص (إفادة، محضر استجواب): ادعاء غير متحقق
 * تفسير البحث نفسه (أي كلمات بحثنا عنها) يُعرض منفصلاً كتفسير.
 */
export type Epistemic = 'source' | 'claim';

export interface SourceRef {
  type: SourceType;
  code: string;
}

export type OpenTarget =
  | { kind: 'evidence'; code: string }
  | { kind: 'object'; code: string; location: string | null }
  | { kind: 'tab'; tab: 'interrogation' };

export interface SearchResult {
  ref: SourceRef;
  title: string;
  /** وصف نوع المصدر بلغة القضية (سجل، إفادة، أثر بالغرفة…). */
  sourceLabel: string;
  epistemic: Epistemic;
  /** مقتطف حرفي من المادة المصرّح بها — أو null لو المحتوى ليس لك. */
  excerpt: string | null;
  /** وقت القضية فقط لو موجود فعلاً بالمصدر. */
  clock: string | null;
  /** full = قرأت المحتوى؛ title = العنوان فقط (المحتوى لتخصص آخر). */
  access: 'full' | 'title';
  /** تخصص صاحب المحتوى حين access = title. */
  ownerSpec: Specialization | null;
  open: OpenTarget | null;
}

export interface QueryInterpretation {
  /** الكلمات اللي بحثنا عنها فعلاً. */
  terms: string[];
  /** rules = استخراج ثابت من السؤال؛ model = إعادة صياغة آلية للبحث. */
  by: 'rules' | 'model';
}

export type ToolStatus = 'ready' | 'needs_share' | 'needs_specialist' | 'start_with_object' | 'unavailable';

export type InquiryResponse =
  | { kind: 'search'; interpretation: QueryInterpretation; results: SearchResult[] }
  | {
      kind: 'tool';
      tool: Exclude<InquiryTool, 'CASE_SEARCH'>;
      status: ToolStatus;
      message: string;
      open: OpenTarget | null;
      openLabel: string | null;
    }
  | { kind: 'unsupported'; message: string }
  | { kind: 'guard'; message: string }
  | { kind: 'fallback'; message: string; examples: string[] };
