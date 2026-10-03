// ============================================================
// src/app/case/[code]/evidence/types.ts
// أنواع طبقة عرض الأدلة السينمائية. لا any. لا بيانات مُختلقة —
// segments/markers اختيارية وتبقى فاضية لحد ما مصدر حقيقي يوفرها.
// ============================================================

import type { EvidenceItem } from '@/types/case';

export interface TranscriptSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface AudioMarker {
  startSeconds: number;
  endSeconds: number;
  label?: string;
}

/** يوصف مصدر transcript/markers الحقيقي لدليل صوتي معيّن — فاضي حالياً لأي دليل لعدم وجود بيانات توقيت حقيقية بعد. */
export interface AudioAnnotations {
  transcript?: TranscriptSegment[];
  markers?: AudioMarker[];
}

export interface EvidenceMediaResponse {
  url: string;
  kind: EvidenceItem['kind'];
  contentType: string;
  expiresIn: number;
}

export type EvidencePresentation =
  | 'document'
  | 'official-record'
  | 'surveillance-image'
  | 'social-image'
  | 'phone'
  | 'audio'
  | 'video';
