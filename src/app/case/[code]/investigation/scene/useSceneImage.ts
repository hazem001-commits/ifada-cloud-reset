// ============================================================
// src/app/case/[code]/investigation/scene/useSceneImage.ts
// روابط وسائط المشهد من /api/scene-media. المتصفح يرسل رموزاً آمنة
// فقط: كود موقع (صورة المشهد)، أو كود عنصر + مفتاح لقطة قريبة.
// الرابط يُحفظ بالذاكرة ضمن عمره الفعلي فقط (بهامش أمان) حتى ما
// نطلب رابطاً جديداً مع كل تبديل تبويب — ولا يُحفظ بعد انتهائه.
// فشل تحميل الصورة (رابط انتهى) → طلب رابط جديد مرة واحدة فقط.
// ============================================================
'use client';

import { useCallback, useEffect, useState } from 'react';

interface Cached {
  url: string;
  expiresAt: number;
}

type Target = { location: string } | { object: string; view: string };

const cache = new Map<string, Cached>();
const SAFETY_MS = 10_000;

function keyOf(sessionId: string, target: Target): string {
  return 'location' in target
    ? `${sessionId}:loc:${target.location}`
    : `${sessionId}:obj:${target.object}:${target.view}`;
}

async function fetchSignedUrl(sessionId: string, target: Target, key: string): Promise<string | null> {
  try {
    const res = await fetch('/api/scene-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, ...target }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { url?: unknown; expiresIn?: unknown };
    if (typeof body.url !== 'string') return null;
    const ttl = typeof body.expiresIn === 'number' ? body.expiresIn * 1000 : 60_000;
    cache.set(key, { url: body.url, expiresAt: Date.now() + ttl - SAFETY_MS });
    return body.url;
  } catch {
    return null;
  }
}

export type SceneImageState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'failed' };

function useSignedSceneMedia(sessionId: string, target: Target | null) {
  const key = target ? keyOf(sessionId, target) : null;
  // الهدف نفسه يتغيّر مرجعياً مع كل رسم — المفتاح النصي هو المعتمد.
  const targetJson = target ? JSON.stringify(target) : null;
  const [result, setResult] = useState<{ key: string; url: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [retried, setRetried] = useState<string | null>(null);

  useEffect(() => {
    if (!key || !targetJson) return;
    let cancelled = false;
    const hit = cache.get(key);
    void (async () => {
      const url =
        hit && hit.expiresAt > Date.now() ? hit.url : await fetchSignedUrl(sessionId, JSON.parse(targetJson) as Target, key);
      if (!cancelled) setResult({ key, url });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, targetJson, sessionId, attempt]);

  /** الصورة فشلت بالتحميل: رابط جديد مرة وحدة، بعدها نعتبرها غير متاحة. */
  const onImageError = useCallback(() => {
    if (!key) return;
    cache.delete(key);
    if (retried === key) {
      setResult({ key, url: null });
      return;
    }
    setRetried(key);
    setAttempt((n) => n + 1);
  }, [key, retried]);

  let state: SceneImageState;
  if (!key) state = { status: 'none' };
  else if (!result || result.key !== key) state = { status: 'loading' };
  else state = result.url ? { status: 'ready', url: result.url } : { status: 'failed' };

  return { state, onImageError };
}

/** location = null → هذا الموقع بلا صورة معتمدة (لا طلب إطلاقاً). */
export function useSceneImage(sessionId: string, location: string | null) {
  return useSignedSceneMedia(sessionId, location ? { location } : null);
}

/** لقطة قريبة لعنصر معروف للاعب. null → لا طلب إطلاقاً. */
export function useObjectView(sessionId: string, object: string | null, view: string | null) {
  return useSignedSceneMedia(sessionId, object && view ? { object, view } : null);
}
