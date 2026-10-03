// ============================================================
// src/app/case/[code]/investigation/scene/NeutralSurface.tsx
// موقع بلا صورة معتمدة (مكتب الأمن) — أو صورة تعذّر تحميلها.
// لا مشهد مختلق: سطح تحقيق هادئ وفهرس لما رجع من السيرفر لهذا
// الموقع فقط، بنفس لغة الحالة ونفس مسار الفحص.
// ============================================================
'use client';

import type { InvestigationObject } from '@/types/investigationObjects';
import { objectStatus } from '../labels';
import { CategoryIcon } from '../icons';
import r from './roomScene.module.css';

export default function NeutralSurface({
  location,
  roots,
  childrenOf,
  focusedCode,
  readyCodes,
  imageFailed,
  onFocus,
}: {
  location: InvestigationObject | undefined;
  roots: InvestigationObject[];
  childrenOf: (code: string) => InvestigationObject[];
  focusedCode: string | null;
  readyCodes: ReadonlySet<string>;
  imageFailed: boolean;
  onFocus: (code: string) => void;
}) {
  const rows = roots.flatMap((root) => [
    { object: root, depth: 0 },
    ...childrenOf(root.code).map((kid) => ({ object: kid, depth: 1 })),
  ]);

  return (
    <div className={r.surface}>
      <div className={r.surfaceBody}>
        <p className={r.surfaceKicker}>موقع تحقيق</p>
        <h1 className={r.surfaceTitle}>{location?.title ?? 'موقع التحقيق'}</h1>
        {location?.description && <p className={r.surfaceNote}>{location.description}</p>}
        {imageFailed && (
          <p className={r.surfaceNote} role="status">
            تعذّر عرض صورة المشهد الآن. كل ما يمكن فحصه هنا متاح أدناه.
          </p>
        )}

        {rows.length === 0 ? (
          <p className={r.surfaceEmpty}>لا يوجد ما يمكن فحصه هنا حالياً.</p>
        ) : (
          <ul className={r.index} aria-label="ما يمكن فحصه هنا">
            {rows.map(({ object, depth }) => {
              const status = objectStatus(object, readyCodes.has(object.code));
              return (
                <li key={object.code} data-depth={depth}>
                  <button
                    type="button"
                    className={r.indexRow}
                    data-tone={status.tone}
                    aria-current={focusedCode === object.code ? 'true' : undefined}
                    onClick={() => onFocus(object.code)}
                  >
                    <span className={r.indexIcon}>
                      <CategoryIcon category={object.category} size={16} />
                    </span>
                    <span className={r.indexTitle}>{object.title}</span>
                    <span className={r.indexMeta}>{status.label}</span>
                    <span className={r.indexGo} aria-hidden="true">
                      ←
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
