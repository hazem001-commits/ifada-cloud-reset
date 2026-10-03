// ============================================================
// src/app/case/[code]/evidence/document/useStageSize.ts
// المساحة الفعلية المتاحة للورقة داخل سطح الفحص (بدون الحواف
// الداخلية) — تتحدث مع تغيير حجم الشاشة/الدوران.
// ============================================================
'use client';

import { useEffect, useState, type RefObject } from 'react';

export interface StageSize {
  width: number;
  height: number;
}

export function useStageSize(ref: RefObject<HTMLElement | null>): StageSize {
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function measure(target: HTMLElement) {
      const cs = getComputedStyle(target);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const width = Math.max(0, Math.floor(target.clientWidth - padX));
      const height = Math.max(0, Math.floor(target.clientHeight - padY));
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    }

    const observer = new ResizeObserver(() => measure(el));
    observer.observe(el);
    measure(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
