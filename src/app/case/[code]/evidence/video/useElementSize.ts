// ============================================================
// src/app/case/[code]/evidence/video/useElementSize.ts
// حجم عنصر عبر callback ref — يشتغل حتى لو العنصر انرسم متأخّراً
// (شاشة الإطار بتظهر بس بعد ما يجهز المصدر)، بعكس RefObject ثابت
// بيتقرا مرة وحدة عند التركيب.
// ============================================================
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

export function useElementSize<T extends HTMLElement>() {
  const nodeRef = useRef<T | null>(null);
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  const ref = useCallback((el: T | null) => {
    nodeRef.current = el;
    setNode(el);
  }, []);

  useEffect(() => {
    if (!node) return;
    const measure = () => {
      const width = Math.floor(node.clientWidth);
      const height = Math.floor(node.clientHeight);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [node]);

  return { ref, nodeRef, size };
}
