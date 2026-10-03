// ============================================================
// src/app/case/[code]/evidence/reviewed.ts
// حالة "تمت المراجعة" محلية فقط (localStorage)، مفتاحها الجلسة +
// كود الدليل. لا مزامنة جماعية — ما في backend لهذا حالياً، وهذا
// موثّق بوضوح بالتقرير النهائي. لا تعديل على منطق فتح الأدلة.
// ============================================================

'use client';

import { useCallback, useState } from 'react';

function storageKey(sessionId: string): string {
  return `ifada:reviewed:${sessionId}`;
}

function readSet(sessionId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

function writeSet(sessionId: string, set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      storageKey(sessionId),
      JSON.stringify(Array.from(set)),
    );
  } catch {
    // تخزين محلي غير متاح (وضع خاص، إلخ) — لا ضرر، فقط لا حفظ.
  }
}

export function isReviewed(sessionId: string, code: string): boolean {
  return readSet(sessionId).has(code);
}

export function markReviewed(sessionId: string, code: string): void {
  const set = readSet(sessionId);
  set.add(code);
  writeSet(sessionId, set);
}

/**
 * يرجع حالة المراجعة لدليل معيّن + دالة لتحديدها. القيمة الابتدائية
 * تُقرأ مرّة وحدة عبر lazy initializer — آمن هون لأن هذا الهوك
 * يُستخدم فقط داخل ReviewedControl، اللي ما بيتركّب إلا بعد فتح
 * غرفة الفحص (تفاعل مستخدم صرف)، فما في أي render على السيرفر
 * لهذا المكوّن يتعارض مع قيمة localStorage الحقيقية.
 */
export function useReviewed(
  sessionId: string,
  code: string,
): [boolean, () => void] {
  const [reviewed, setReviewedState] = useState(() => isReviewed(sessionId, code));

  const markAsReviewed = useCallback(() => {
    markReviewed(sessionId, code);
    setReviewedState(true);
  }, [sessionId, code]);

  return [reviewed, markAsReviewed];
}
