// ============================================================
// src/app/case/[code]/play/useModalFocus.ts
// حوار حقيقي (aria-modal): التركيز يدخل الحوار ويبقى فيه (Tab/Shift+Tab
// تدور داخله)، Escape يغلق (إن أُعطي)، الصفحة خلفه لا تتمرّر، والتركيز
// يعود لمن فتحه عند الإغلاق.
// ============================================================
'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalFocus(panel: RefObject<HTMLElement | null>, open: boolean, onClose?: () => void, initial?: RefObject<HTMLElement | null>) {
  // آخر onClose دون إعادة تشغيل الأثر (المستدعون يمرّرون دوالاً جديدة كل عرض —
  // إعادة التشغيل كانت ستسحب التركيز من داخل الحوار مع كل تحديث).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    (initial?.current ?? panel.current)?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeRef.current) {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, [open, panel, initial]);
}
