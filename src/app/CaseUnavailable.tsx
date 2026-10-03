// ============================================================
// src/app/CaseUnavailable.tsx
// قضية غير متاحة للعب بعد (قيد الإعداد) — بدل فتح تحقيق فارغ.
// ============================================================
import Link from 'next/link';

export default function CaseUnavailable({ title }: { title: string }) {
  return (
    <main className="shell" style={{ maxWidth: '32rem' }}>
      <h1 style={{ fontSize: 'var(--t-xl)' }}>{title}</h1>
      <p className="muted">ملف هذه القضية قيد الإعداد، وغير متاح للتحقيق بعد.</p>
      <hr className="rule" />
      <Link className="btn" href="/">
        رجوع للأرشيف
      </Link>
    </main>
  );
}
