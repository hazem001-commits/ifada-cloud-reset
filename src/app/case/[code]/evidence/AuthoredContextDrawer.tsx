// ============================================================
// src/app/case/[code]/evidence/AuthoredContextDrawer.tsx
// درج "تفاصيل الدليل" داخل غلاف الفحص: نص الدليل المكتوب حرفياً
// بجانب الوسائط (من اليسار — شريط البيانات على اليمين). الوسائط تبقى
// العرض الأساسي؛ هذا سياق يُفتح عند الحاجة، لا ورقة فوق الدليل.
// ============================================================
'use client';

import { forwardRef } from 'react';

const AuthoredContextDrawer = forwardRef<
  HTMLDivElement,
  { id: string; text: string; open: boolean; onClose: () => void }
>(function AuthoredContextDrawer({ id, text, open, onClose }, bodyRef) {
  return (
    <aside id={id} className="evidence-context" hidden={!open} aria-label="تفاصيل الدليل">
      <div className="evidence-context-head">
        <h3 className="evidence-context-title">تفاصيل الدليل</h3>
        <button type="button" className="evidence-context-close" aria-label="إغلاق تفاصيل الدليل" onClick={onClose}>
          ×
        </button>
      </div>
      {/* قابل للتركيز والتمرير بلوحة المفاتيح؛ الأسطر كما كُتبت. */}
      <div ref={bodyRef} className="evidence-context-body" tabIndex={0}>
        {text}
      </div>
    </aside>
  );
});

export default AuthoredContextDrawer;
