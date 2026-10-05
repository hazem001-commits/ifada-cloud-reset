// ============================================================
// src/app/case/[code]/investigation/scene/ObjectCloseUp.tsx
// لقطة قريبة لعنصر مفحوص: كأن اللاعب انحنى نحو الشيء. تظهر فوق
// الغرفة المعتّمة بالمساحة الحرة (يسار ملف الفحص)، والغرفة تبقى
// مرئية حولها. ليست بطاقة دليل ولا ورقة — صورة الشيء نفسه فقط.
// فشل الوسائط = تختفي بهدوء وتبقى الغرفة المقرّبة.
// ============================================================
'use client';

import { useState } from 'react';
import type { Rect } from './sceneGeometry';
import type { ObjectView } from './objectViews';
import { useObjectView } from './useSceneImage';
import r from './roomScene.module.css';

export default function ObjectCloseUp({
  sessionId,
  objectCode,
  views,
  frame,
  roomFirst = false,
}: {
  sessionId: string;
  objectCode: string;
  views: readonly ObjectView[];
  frame: Rect;
  /**
   * الهاتف: المساحة فوق ورقة الفحص ضيقة، واللقطة القريبة كانت تغطيها كلها
   * (ومعها نقاط الاكتشافات الفرعية مثل الجواز). هناك تبدأ الغرفة المقرّبة
   * ظاهرة، واللقطة خيار بلمسة واحدة.
   */
  roomFirst?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [showRoom, setShowRoom] = useState(roomFirst);
  const view = views[Math.min(index, views.length - 1)];
  const { state, onImageError } = useObjectView(sessionId, objectCode, view?.key ?? null);

  if (!view || state.status === 'failed' || state.status === 'none') return null;

  return (
    <figure
      className={r.closeUp}
      data-room={showRoom ? 'true' : 'false'}
      style={{ left: frame.x0, top: frame.y0, width: frame.x1 - frame.x0, height: frame.y1 - frame.y0 }}
    >
      {!showRoom && (
        <div className={r.closeUpPlate} key={view.key} data-loading={state.status === 'loading'}>
          {state.status === 'ready' && (
            // رابط موقّت قصير العمر من السيرفر — next/image ما بيناسبه.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={r.closeUpImage}
              src={state.url}
              alt={`لقطة قريبة — ${view.label}`}
              draggable={false}
              decoding="async"
              onError={onImageError}
            />
          )}
        </div>
      )}

      <figcaption className={r.closeUpBar}>
        {!showRoom && views.length > 1 && (
          <span className={r.closeUpViews} role="group" aria-label="لقطات قريبة">
            {views.map((v, i) => (
              <button
                key={v.key}
                type="button"
                className={r.closeUpView}
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
              >
                {v.label}
              </button>
            ))}
          </span>
        )}
        {!showRoom && views.length === 1 && <span className={r.closeUpLabel}>{view.label}</span>}
        <button type="button" className={r.closeUpToggle} onClick={() => setShowRoom((v) => !v)}>
          {showRoom ? 'اقترب من الشيء' : 'عودة للغرفة'}
        </button>
      </figcaption>
    </figure>
  );
}
