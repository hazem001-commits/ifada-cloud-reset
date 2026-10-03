// ============================================================
// src/app/case/[code]/investigation/scene/SceneHotspot.tsx
// نقطة اهتمام: زر حقيقي فوق الجسم الفيزيائي، يعيش داخل المسرح
// (إحداثيات المصدر) فيتحرك مع الصورة بنفس التحويل — بلا انزياح.
// شبه غير مرئية افتراضياً: لمعة خافتة فقط. التمرير والتركيز بلوحة
// المفاتيح يكشفان نفس المعلومات (إطار + تسمية + ما يمكن فعله).
// لا أرقام، لا دبابيس، لا دوائر نابضة، لا تسميات دائمة.
// ============================================================
'use client';

import type { InvestigationObject } from '@/types/investigationObjects';
import { AFFORDANCE, CATEGORY_LABEL, objectStatus } from '../labels';
import { hitBox, toScreen, type SceneAnchor, type Size, type StageTransform } from './sceneGeometry';
import r from './roomScene.module.css';

export default function SceneHotspot({
  object,
  anchor,
  transform,
  view,
  ready,
  refCallback,
  onHover,
  onOpen,
}: {
  object: InvestigationObject;
  anchor: SceneAnchor;
  transform: StageTransform;
  view: Size;
  ready: boolean;
  refCallback: (el: HTMLButtonElement | null) => void;
  onHover: (code: string | null) => void;
  onOpen: () => void;
}) {
  const status = objectStatus(object, ready);
  // حدود النقر ≥ 44px على الشاشة حتى لو الجسم صغير؛ الإطار البصري = الجسم نفسه.
  const hit = hitBox(anchor.box, transform.scale);

  // التسمية فوق الجسم إن اتسع المكان وإلا تحته؛ ومحاذاة أفقية لا تخرج عن الإطار.
  const top = toScreen({ x: 0, y: anchor.box.y }, transform).y;
  const center = toScreen({ x: anchor.box.x + anchor.box.w / 2, y: 0 }, transform).x;
  const place = top > 84 ? 'above' : 'below';
  const align = center < 150 ? 'left' : center > view.width - 150 ? 'right' : 'center';

  return (
    <button
      ref={refCallback}
      type="button"
      className={r.hotspot}
      data-tone={status.tone}
      aria-label={`${object.title} — ${status.label}. ${AFFORDANCE[status.tone]}`}
      style={{ left: hit.x, top: hit.y, width: hit.w, height: hit.h }}
      onPointerEnter={() => onHover(object.code)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(object.code)}
      onBlur={() => onHover(null)}
      onClick={() => {
        onHover(null);
        onOpen();
      }}
    >
      <span className={r.glint} aria-hidden="true" style={{ left: anchor.glint.x - hit.x, top: anchor.glint.y - hit.y }} />
      <span
        className={r.bracket}
        aria-hidden="true"
        style={{ left: anchor.box.x - hit.x, top: anchor.box.y - hit.y, width: anchor.box.w, height: anchor.box.h }}
      />
      <span className={r.label} data-place={place} data-align={align} aria-hidden="true">
        <span className={r.labelKind}>{CATEGORY_LABEL[object.category] ?? CATEGORY_LABEL.object}</span>
        <span className={r.labelTitle}>{object.title}</span>
        <span className={r.labelMeta} data-tone={status.tone}>
          {status.label} · {AFFORDANCE[status.tone]}
        </span>
      </span>
    </button>
  );
}
