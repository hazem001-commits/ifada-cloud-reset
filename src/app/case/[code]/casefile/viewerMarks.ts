// ============================================================
// src/app/case/[code]/casefile/viewerMarks.ts
// "فتحته أنا" — حالة محلية للّاعب نفسه فقط (localStorage)، نفس نمط
// evidence/reviewed.ts. مش حالة لعب ولا تُزامَن للفريق: هي بس اللي
// بتخلّي "جديد" تعني "جديد عليك" حتى بعد تبديل التبويب أو التحديث.
// ============================================================
'use client';

function storageKey(sessionId: string): string {
  return `ifada:casefile-opened:${sessionId}`;
}

export function readOpened(sessionId: string): Set<string> {
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

export function markOpened(sessionId: string, revisionKey: string): Set<string> {
  const set = readOpened(sessionId);
  set.add(revisionKey);
  try {
    window.localStorage.setItem(storageKey(sessionId), JSON.stringify(Array.from(set)));
  } catch {
    // تخزين محلي غير متاح — لا ضرر، فقط لا حفظ بين التحديثات.
  }
  return set;
}
