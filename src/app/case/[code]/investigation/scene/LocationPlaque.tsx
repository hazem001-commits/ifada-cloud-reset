// ============================================================
// src/app/case/[code]/investigation/scene/LocationPlaque.tsx
// لوحة الموقع: مثل لافتة إرشاد بممر فندق — الموقع الحالي بارز،
// والمواقع الأخرى بخط أهدأ تحته. ليست تبويبات متصفح.
// ملاحظة الموقع (نص القضية نفسه من السيرفر) سطر هادئ تحتها.
// ============================================================
'use client';

import type { InvestigationObject } from '@/types/investigationObjects';
import r from './roomScene.module.css';

export default function LocationPlaque({
  locations,
  location,
  photographic,
  hidden,
  onSelect,
  measureRef,
}: {
  locations: InvestigationObject[];
  location: InvestigationObject | undefined;
  photographic: boolean;
  hidden: boolean;
  onSelect: (code: string) => void;
  /** المشهد يقيس أسفل اللوحة ليبدأ الصورة تحتها مباشرة (تكوين الهاتف). */
  measureRef?: (el: HTMLElement | null) => void;
}) {
  if (!location) return null;
  const others = locations.filter((l) => l.code !== location.code);

  return (
    <nav ref={measureRef} className={r.plaque} data-hidden={hidden} aria-label="مواقع التحقيق" inert={hidden}>
      {/* بالسطح المحايد اسم الموقع عنوانُ السطح نفسه — ما نكرره هون. */}
      {photographic && (
        <>
          <p className={r.plaqueHere}>
            <span className={r.plaqueTick} aria-hidden="true" />
            <span className="sr-only">الموقع الحالي: </span>
            {location.title}
          </p>
          {location.description && <p className={r.plaqueNote}>{location.description}</p>}
        </>
      )}
      {others.length > 0 && (
        <ul className={r.plaqueRoutes}>
          {others.map((l) => (
            <li key={l.code}>
              <button type="button" className={r.plaqueRoute} onClick={() => onSelect(l.code)}>
                <span className={r.plaqueArrow} aria-hidden="true">
                  ←
                </span>
                انتقل إلى {l.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
