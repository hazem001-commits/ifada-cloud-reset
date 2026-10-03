// ============================================================
// src/app/case/[code]/evidence/EvidenceOverlay.tsx
// غلاف فحص الدليل. يفتح فوق شاشة التحقيق (بدون تنقّل) — الشاشة
// تبقى خلفه معتّمة ومغبّشة. شكلان:
//   workstation — طاولة فحص بملء الشاشة (الوثائق).
//   panel       — لوحة مركزية (صوت/صورة/فيديو/هاتف) كما كانت.
// الإغلاق: زر ×، Escape، سحبة لأسفل على شريط العنوان (موبايل)،
// وضغطة الخلفية بشكل panel فقط. الإغلاق يعكس حركة الفتح ("رجوع
// الملف للأرشيف"). فخ تركيز داخل الحوار وإرجاع التركيز لما يسكّر.
// "تفاصيل الدليل" (context): نص الدليل المكتوب بدرج من اليسار حين
// تكون له وسائط — Escape يغلق الدرج أولاً ثم الفحص.
// ============================================================
'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ReviewedControl from './ReviewedControl';
import AuthoredContextDrawer from './AuthoredContextDrawer';
import { playBlip } from './sound';

const SWIPE_CLOSE_THRESHOLD = 110;
const CLOSE_ANIMATION_MS = 260;

export type EvidenceLayout = 'workstation' | 'panel';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function EvidenceOverlay({
  sessionId,
  code,
  title,
  eyebrow,
  layout = 'panel',
  context = null,
  onClose,
  children,
}: {
  sessionId: string;
  /** للمراجعة المحلية فقط — ما بينعرض للاعب (الأكواد الداخلية مش جزء من تجربة اللعب). */
  code: string;
  title: string;
  /** وصف نوع المادة بالعربي (اختياري) — بدل الكود بشريط العنوان. */
  eyebrow?: string;
  layout?: EvidenceLayout;
  /** نص الدليل المكتوب (authoredContextFor) — null = لا زر ولا درج. */
  context?: string | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dragStartY = useRef<number | null>(null);
  const closingRef = useRef(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const contextId = useId();
  const contextToggleRef = useRef<HTMLButtonElement>(null);
  const contextBodyRef = useRef<HTMLDivElement>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const contextWasOpen = useRef(false);

  // فتح الدرج ينقل التركيز لنصّه؛ إغلاقه يرجّع التركيز لزرّه.
  useEffect(() => {
    if (contextOpen) {
      contextWasOpen.current = true;
      contextBodyRef.current?.focus();
    } else if (contextWasOpen.current) {
      contextWasOpen.current = false;
      contextToggleRef.current?.focus();
    }
  }, [contextOpen]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    playBlip('close');
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, CLOSE_ANIMATION_MS);
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    playBlip('open');

    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        // الدرج مفتوح: Escape يغلقه هو فقط، والفحص يبقى.
        if (contextOpen) {
          setContextOpen(false);
          return;
        }
        requestClose();
        return;
      }
      if (e.key !== 'Tab' || !surfaceRef.current) return;

      const nodes = Array.from(surfaceRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (nodes.length === 0) return;
      const first = nodes[0] as HTMLElement;
      const last = nodes[nodes.length - 1] as HTMLElement;
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !surfaceRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !surfaceRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestClose, contextOpen]);

  // السحب لأسفل على شريط العنوان فقط — ما بيتعارض مع تمرير الوثيقة.
  function onTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0]?.clientY ?? null;
    setDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return;
    const current = e.touches[0]?.clientY ?? dragStartY.current;
    setDragY(Math.max(0, current - dragStartY.current));
  }

  function onTouchEnd() {
    setDragging(false);
    dragStartY.current = null;
    if (dragY > SWIPE_CLOSE_THRESHOLD) {
      requestClose();
      return;
    }
    setDragY(0);
  }

  const isWorkstation = layout === 'workstation';

  return (
    <div
      className={`evidence-backdrop${isWorkstation ? ' is-workstation' : ''}${closing ? ' is-closing' : ''}`}
      onClick={(e) => {
        if (!isWorkstation && e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={surfaceRef}
        className={`evidence-surface${isWorkstation ? ' is-workstation' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 0.2s ease',
        }}
      >
        <div
          className="evidence-topbar"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="evidence-topbar-title">
            {eyebrow && <span className="evidence-topbar-eyebrow">{eyebrow}</span>}
            <strong id={titleId}>{title}</strong>
          </div>

          <div className="evidence-topbar-actions">
            {context && (
              <button
                ref={contextToggleRef}
                type="button"
                className="evidence-context-toggle"
                aria-expanded={contextOpen}
                aria-controls={contextId}
                onClick={() => setContextOpen((v) => !v)}
              >
                تفاصيل الدليل
              </button>
            )}
            <ReviewedControl sessionId={sessionId} code={code} />
            <button
              ref={closeBtnRef}
              type="button"
              className="evidence-close"
              aria-label="إغلاق فحص الدليل"
              onClick={requestClose}
            >
              ×
            </button>
          </div>
        </div>

        {isWorkstation ? (
          <div className="evidence-workstation-body">
            {children}
            {context && (
              <AuthoredContextDrawer
                ref={contextBodyRef}
                id={contextId}
                text={context}
                open={contextOpen}
                onClose={() => setContextOpen(false)}
              />
            )}
          </div>
        ) : (
          <div style={{ position: 'relative', padding: 'clamp(1rem, 4vw, 2rem)' }}>
            {children}
            {context && (
              <AuthoredContextDrawer
                ref={contextBodyRef}
                id={contextId}
                text={context}
                open={contextOpen}
                onClose={() => setContextOpen(false)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
