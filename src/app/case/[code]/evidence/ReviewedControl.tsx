// ============================================================
// src/app/case/[code]/evidence/ReviewedControl.tsx
// "تمت المراجعة" — تفاعل لاعب محلي بحت (localStorage)، منفصل
// تماماً عن منطق الفتح/القفل الحقيقي. لا يغيّر أي صلاحية.
// ============================================================
'use client';

import { useReviewed } from './reviewed';
import { playBlip } from './sound';

export default function ReviewedControl({
  sessionId,
  code,
}: {
  sessionId: string;
  code: string;
}) {
  const [reviewed, markAsReviewed] = useReviewed(sessionId, code);

  if (reviewed) {
    return (
      <span
        className="mono"
        style={{
          fontSize: 'var(--t-xs)',
          color: 'var(--signal)',
          border: '1px solid var(--signal)',
          borderRadius: '2px',
          padding: '0.3rem 0.6rem',
        }}
      >
        ✓ تمت المراجعة
      </span>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-quiet"
      style={{ fontSize: 'var(--t-xs)', padding: '0.4rem 0.8rem' }}
      onClick={() => {
        markAsReviewed();
        playBlip('stamp');
      }}
    >
      تمت المراجعة
    </button>
  );
}
