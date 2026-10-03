// ============================================================
// src/app/case/[code]/investigation/inquiry/CaseInquiry.tsx
// "اسأل التحقيق" — سطر استعلام تحقيقي مقيّد، مش شات.
// المتصفح يرسل { sessionId, text } فقط لـ /api/case-inquiry، ويعرض
// الرد كما هو. فتح أي مصدر يمر عبر المسارات الموجودة نفسها (عارض
// الدليل الآمن، ملف الفحص، تبويب الاستجواب) — وكلها تعيد التحقق.
// لا تنفيذ أداة تلقائياً: اللاعب يفتح المصدر أو الأداة بنفسه.
// ============================================================
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { InquiryResponse, OpenTarget } from '@/lib/inquiry/types';
import InquiryResults from './InquiryResults';
import q from './inquiry.module.css';

const ERRORS: Record<string, string> = {
  AUTH_REQUIRED: 'لازم تسجّل دخول أولاً.',
  NOT_A_MEMBER: 'إنت مش من فريق هذا التحقيق.',
  TEXT_TOO_LONG: 'السؤال طويل — اختصره لسطر واحد.',
  TOO_MANY_REQUESTS: 'أسئلة كثيرة بوقت قصير. استنّى لحظة وجرّب.',
};

export default function CaseInquiry({
  sessionId,
  onOpen,
}: {
  sessionId: string;
  onOpen: (target: OpenTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<InquiryResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // "/" يفتح الاستعلام من أي مكان بالتحقيق (إلا أثناء الكتابة بحقل).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.defaultPrevented) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // عارض الدليل مفتوح فوق كل شي — لا نفتح الاستعلام خلفه.
      if (document.querySelector('.evidence-backdrop')) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // الإغلاق الصريح (Escape / ×) يرجّع التركيز للزر؛ فتح مصدر يتركه للمصدر نفسه.
  const returnFocus = useRef(false);
  useEffect(() => {
    if (open) {
      inputRef.current?.focus({ preventScroll: true });
    } else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  function close() {
    returnFocus.current = true;
    setOpen(false);
  }

  async function ask(value: string) {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setAsked(trimmed);
    try {
      const res = await fetch('/api/case-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, text: trimmed }),
        cache: 'no-store',
      });
      const body = (await res.json()) as InquiryResponse | { error?: string };
      if (!res.ok || !('kind' in body)) {
        const code = 'error' in body ? body.error : undefined;
        setResponse(null);
        setError((code && ERRORS[code]) ?? 'ما وصل رد. جرّب مرة ثانية.');
      } else {
        setResponse(body);
      }
    } catch {
      setResponse(null);
      setError('ما وصل رد. جرّب مرة ثانية.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        ref={triggerRef}
        type="button"
        className={q.trigger}
        aria-expanded={false}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
      >
        <SearchGlyph />
        اسأل التحقيق
        <kbd className={q.kbd} aria-hidden="true">
          /
        </kbd>
      </button>
    );
  }

  return (
    <section
      id={panelId}
      className={q.panel}
      aria-label="اسأل التحقيق"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      }}
    >
      <form
        role="search"
        className={q.form}
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <SearchGlyph />
        <label className="sr-only" htmlFor={`${panelId}-q`}>
          اسأل التحقيق
        </label>
        <input
          id={`${panelId}-q`}
          ref={inputRef}
          className={q.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="مثال: شو عنا عن اللابتوب؟"
          maxLength={300}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className={q.ask} disabled={busy || text.trim() === ''}>
          اسأل
        </button>
        <button type="button" className={q.close} onClick={close} aria-label="إغلاق">
          ×
        </button>
      </form>

      <div className={q.status} aria-live="polite">
        {busy && (
          <div className={q.working} role="status">
            <span>جارٍ البحث في مواد القضية المتاحة لك…</span>
            <span className={q.line} aria-hidden="true" />
          </div>
        )}
        {!busy && error && <p className={q.error}>{error}</p>}
        {!busy && !error && response && (
          <>
            <p className={q.asked}>
              سؤالك: <bdi>{asked}</bdi>
            </p>
            <InquiryResults
              response={response}
              onOpen={(target) => {
                onOpen(target);
                setOpen(false);
              }}
              onExample={(ex) => {
                setText(ex);
                void ask(ex);
              }}
            />
          </>
        )}
      </div>
    </section>
  );
}

function SearchGlyph() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" strokeLinecap="round" />
    </svg>
  );
}
