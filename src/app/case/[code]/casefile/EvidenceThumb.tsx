// ============================================================
// src/app/case/[code]/casefile/EvidenceThumb.tsx
// صورة حقيقية داخل الأثر — عبر /api/evidence-media نفسه (السيرفر
// يعيد فحص العضوية/التخصص/الفتح كل مرة؛ لا مسار Storage يوصل هون).
// يُطلب فقط لما يصير الأثر ظاهر على الشاشة، ومرة وحدة لكل تركيب.
// أي فشل أو نوع غير صورة → المعالجة البصرية البديلة، مش صندوق فاضي.
// ============================================================
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EvidenceMediaResponse } from '../evidence/types';

export default function EvidenceThumb({
  sessionId,
  code,
  className,
  imageClassName,
  fallback,
}: {
  sessionId: string;
  code: string;
  className?: string;
  imageClassName?: string;
  fallback: (state: 'loading' | 'unavailable') => ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const io = new IntersectionObserver(
      (records) => {
        if (records.some((r) => r.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '240px' },
    );
    io.observe(host);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/evidence-media', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, code }),
        });
        if (cancelled) return;
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const data = (await res.json()) as EvidenceMediaResponse;
        if (cancelled) return;
        if (data.contentType.startsWith('image/')) setSrc(data.url);
        else setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, sessionId, code]);

  return (
    <div ref={hostRef} className={className}>
      {src && !failed ? (
        // رابط موقّت قصير العمر من السيرفر — next/image ما بيناسبه (نفس قرار العارضات).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className={imageClassName} draggable={false} onError={() => setFailed(true)} />
      ) : (
        fallback(failed ? 'unavailable' : 'loading')
      )}
    </div>
  );
}
