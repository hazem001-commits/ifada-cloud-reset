// ============================================================
// src/app/case/[code]/play/Sheet.tsx
// ورقة تحقيق: تصعد من أسفل الشاشة على الهاتف، وتنزلق من الحافة على
// الشاشات العريضة (عمود رفيع بجانب المشهد، لا نافذة منبثقة بالوسط).
// حوار حقيقي: تركيز داخلها، Escape وخلفية تُغلق، يعود التركيز لمن فتحها،
// هوامش الآمن (safe-area) و100dvh، وحركة مختصرة مع reduced-motion.
// ============================================================
'use client';

import { useId, useRef, type ReactNode } from 'react';
import { useModalFocus } from './useModalFocus';
import s from './play.module.css';

export default function Sheet({
  open,
  title,
  kicker,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  kicker?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(panel, open, onClose);

  if (!open) return null;

  return (
    <div className={s.sheetLayer}>
      <div className={s.scrim} aria-hidden="true" onClick={onClose} />
      <div ref={panel} className={s.sheet} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} tabIndex={-1}>
        <span className={s.grip} aria-hidden="true" />
        <header className={s.sheetHead}>
          <div>
            {kicker && <p className={s.sheetKicker}>{kicker}</p>}
            <h2 id={`${id}-t`} className={s.sheetTitle}>
              {title}
            </h2>
          </div>
          <button type="button" className={s.sheetClose} onClick={onClose} aria-label="إغلاق">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className={s.sheetBody}>{children}</div>
      </div>
    </div>
  );
}
