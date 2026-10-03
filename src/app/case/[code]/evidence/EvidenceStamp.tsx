// ============================================================
// src/app/case/[code]/evidence/EvidenceStamp.tsx
// ختم فيزيائي متحرك — يُستخدم لختم "سري"/كود الدليل عند فتح
// وثيقة لأول مرة، ولختم "تمت المراجعة". CSS keyframe واحد
// (stamp-hit) بـ globals.css، يُعطَّل تلقائياً بوضع تقليل الحركة.
// className اختياري لتموضع الختم داخل تخطيط معيّن (طاولة الوثيقة).
// ============================================================
'use client';

export default function EvidenceStamp({
  text,
  tone = 'seal',
  className,
}: {
  text: string;
  tone?: 'seal' | 'muted';
  className?: string;
}) {
  return (
    <span
      className={className ? `doc-stamp ${className}` : 'doc-stamp'}
      style={tone === 'muted' ? { color: 'var(--steel)', borderColor: 'var(--steel)' } : undefined}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}
