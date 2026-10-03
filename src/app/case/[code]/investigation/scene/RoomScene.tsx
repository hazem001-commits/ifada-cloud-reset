// ============================================================
// src/app/case/[code]/investigation/scene/RoomScene.tsx
// "الغرفة تتكلم — الواجهة تُصغي."
//
// المشهد هو الصورة الحقيقية للموقع. فوقها طبقة رقيقة فقط:
//   مسرح (صورة + نقاط اهتمام بإحداثيات المصدر، تحويل واحد مشترك)
//   حجاب تركيز (يعزل الجسم الملموس/المفحوص)
//   لوحة الموقع (تنقّل مكاني مضغوط)
//   منفذ ملف الفحص (يمرّره المحرك)
//
// الموقع بلا صورة معتمدة → سطح تحقيق محايد (لا مشهد مختلق).
// لا حالة لعب هنا: كل ما يُعرض رجع من investigation_object_index،
// والمحرك يملك الاختيار والتركيز وكل الإجراءات.
// ============================================================
'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { InvestigationObject } from '@/types/investigationObjects';
import { useElementSize } from '../../evidence/video/useElementSize';
import { AFFORDANCE, objectStatus } from '../labels';
import { CategoryIcon } from '../icons';
import {
  fitScene,
  frameObject,
  stageCss,
  type Rect,
  type SceneAnchor,
  type SceneDefinition,
  type Size,
  type StageTransform,
} from './sceneGeometry';
import { useSceneImage } from './useSceneImage';
import SceneHotspot from './SceneHotspot';
import NeutralSurface from './NeutralSurface';
import ObjectCloseUp from './ObjectCloseUp';
import { closeUpViewsFor } from './objectViews';
import { own } from '@/cases/presentation';
import { useCasePresentation } from '@/cases/CaseContext';
import LocationPlaque from './LocationPlaque';
import r from './roomScene.module.css';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

interface DossierLayout {
  mode: 'side' | 'sheet';
  size: number;
  /** الجزء غير المغطّى من المشهد. */
  visible: Rect;
  /** حيث يُوضع الجسم المفحوص (المكشوف ناقص هامش). */
  free: Rect;
}

/** ملف الفحص: عمود جانبي من بداية السطر (اليمين)، أو ورقة سفلية بالشاشات الضيقة. */
function dossierLayout(view: Size, wide: boolean): DossierLayout {
  if (view.width < 760) {
    const size = Math.round(view.height * 0.58);
    const visible: Rect = { x0: 0, x1: view.width, y0: 0, y1: view.height - size };
    return { mode: 'sheet', size, visible, free: { x0: 16, x1: view.width - 16, y0: 16, y1: visible.y1 - 16 } };
  }
  const size = wide
    ? Math.round(clamp(view.width * 0.4, 384, 544))
    : Math.round(clamp(view.width * 0.3, 352, 424));
  const visible: Rect = { x0: 0, x1: view.width - size, y0: 0, y1: view.height };
  return { mode: 'side', size, visible, free: { x0: 32, x1: visible.x1 - 32, y0: 40, y1: view.height - 40 } };
}

export default function RoomScene({
  sessionId,
  locations,
  location,
  roots,
  childrenOf,
  byCode,
  focused,
  readyCodes,
  error,
  escapeEnabled,
  dossier,
  onSelectLocation,
  onFocus,
}: {
  sessionId: string;
  locations: InvestigationObject[];
  location: InvestigationObject | undefined;
  roots: InvestigationObject[];
  childrenOf: (code: string) => InvestigationObject[];
  byCode: ReadonlyMap<string, InvestigationObject>;
  focused: InvestigationObject | undefined;
  readyCodes: ReadonlySet<string>;
  error: string | null;
  /** Escape يغلق التركيز — إلا إذا فوقه طبقة أخرى (عارض دليل مثلاً). */
  escapeEnabled: boolean;
  dossier: ReactNode;
  onSelectLocation: (code: string) => void;
  onFocus: (code: string | null) => void;
}) {
  // مشهد هذا الموقع ضمن القضية الحالية فقط (caseId → عرض → كود الموقع).
  const { scenes } = useCasePresentation();
  const scene = own(scenes, location?.code);
  const { state: image, onImageError } = useSceneImage(sessionId, scene && location ? location.code : null);
  const { ref, size } = useElementSize<HTMLDivElement>();

  // إغلاق التركيز بـ Escape (خارج حقول الإدخال).
  useEffect(() => {
    if (!focused || !escapeEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      onFocus(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, escapeEnabled, onFocus]);

  const photographic = scene !== undefined && image.status !== 'failed';
  const layout = size.width > 0 ? dossierLayout(size, !photographic) : null;

  return (
    <div
      ref={ref}
      className={r.viewport}
      data-focus={focused ? 'true' : 'false'}
      data-layout={layout?.mode ?? 'side'}
      style={{ '--dossier-size': `${layout?.size ?? 400}px` } as CSSProperties}
    >
      {photographic && scene ? (
        <PhotoScene
          key={location?.code}
          sessionId={sessionId}
          scene={scene}
          imageUrl={image.status === 'ready' ? image.url : null}
          onImageError={onImageError}
          view={size}
          layout={layout}
          roots={roots}
          childrenOf={childrenOf}
          byCode={byCode}
          focused={focused}
          readyCodes={readyCodes}
          onFocus={onFocus}
        />
      ) : (
        <NeutralSurface
          key={location?.code}
          location={location}
          roots={roots}
          childrenOf={childrenOf}
          focusedCode={focused?.code ?? null}
          readyCodes={readyCodes}
          imageFailed={scene !== undefined}
          onFocus={onFocus}
        />
      )}

      <LocationPlaque
        locations={locations}
        location={location}
        photographic={photographic}
        hidden={!!focused && layout?.mode === 'side'}
        onSelect={(code) => {
          onFocus(null);
          onSelectLocation(code);
        }}
      />

      {error && (
        <p className={r.toast} role="alert">
          {error}
        </p>
      )}

      {dossier && (
        <div className={r.dossierSlot} data-layout={layout?.mode ?? 'side'}>
          {dossier}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// المشهد الفوتوغرافي
// ------------------------------------------------------------
function PhotoScene({
  sessionId,
  scene,
  imageUrl,
  onImageError,
  view,
  layout,
  roots,
  childrenOf,
  byCode,
  focused,
  readyCodes,
  onFocus,
}: {
  sessionId: string;
  scene: SceneDefinition;
  imageUrl: string | null;
  onImageError: () => void;
  view: Size;
  layout: DossierLayout | null;
  roots: InvestigationObject[];
  childrenOf: (code: string) => InvestigationObject[];
  byCode: ReadonlyMap<string, InvestigationObject>;
  focused: InvestigationObject | undefined;
  readyCodes: ReadonlySet<string>;
  onFocus: (code: string | null) => void;
}) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // آخر جسم لمسه المؤشر: الحجاب يبقى عنده أثناء التلاشي، وينزلق منه للتالي.
  const [veilCode, setVeilCode] = useState<string | null>(null);
  const [explored, setExplored] = useState(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const lastFocused = useRef<string | null>(null);

  // رجوع تركيز لوحة المفاتيح لنقطة الاهتمام بالغرفة اللي بدأ منها الفحص
  // (حتى لو تنقّل اللاعب بعدها لاكتشاف فرعي داخله).
  const focusedCode = focused?.code ?? null;
  useEffect(() => {
    if (focusedCode) {
      if (!lastFocused.current) lastFocused.current = focusedCode;
      return;
    }
    const code = lastFocused.current;
    lastFocused.current = null;
    if (code) buttons.current.get(code)?.focus({ preventScroll: true });
  }, [focusedCode]);

  // "جاهز" = الصورة الحالية انرسمت فعلاً. رابط جديد (تجديد) يبقى جاهزاً بصرياً.
  const ready = imageUrl !== null && loadedUrl !== null;
  const base = view.width > 0 ? fitScene(view, scene) : null;

  // الجسم المفحوص: موضعه الخاص، أو موضع أصله لو كان فرعياً بلا موضع.
  const focusAnchor: SceneAnchor | undefined = focused
    ? (scene.anchors[focused.code] ?? (focused.parent_code ? scene.anchors[focused.parent_code] : undefined))
    : undefined;

  let transform: StageTransform | null = base;
  if (base && focusAnchor && layout) {
    transform = frameObject(scene, base, focusAnchor.frame ?? focusAnchor.box, layout.free, layout.visible);
  }

  // الظاهر: الجذور بالعرض العام؛ وبالفحص الاكتشافات الفرعية فقط (أبناء
  // المفحوص، وإخوته لو كان فرعياً) — بالضبط كما رجعت من السيرفر.
  let spots: InvestigationObject[];
  if (!focused) {
    spots = roots;
  } else {
    const parent = focused.parent_code ? byCode.get(focused.parent_code) : undefined;
    const siblings = parent && parent.category !== 'location' ? childrenOf(parent.code) : [];
    spots = [...childrenOf(focused.code), ...siblings].filter((o) => o.code !== focused.code);
  }
  spots = spots.filter((o) => scene.anchors[o.code]);

  // جذور جسمها غير ظاهر بالصورة (مثل باب مدخل الغرفة): لا موضع مختلق —
  // مدخل هادئ "خارج إطار الصورة" على حافة المشهد، بنفس مسار الفحص.
  const unplaced = focused ? [] : roots.filter((o) => !scene.anchors[o.code]);

  const veilOn = focusAnchor ? 'focus' : hovered && scene.anchors[hovered] ? 'hover' : 'off';
  const veilBox = focusAnchor ? (focusAnchor.frame ?? focusAnchor.box) : veilCode ? scene.anchors[veilCode]?.box : undefined;
  const veilStyle = veilBox
    ? ({
        '--vx': `${veilBox.x + veilBox.w / 2}px`,
        '--vy': `${veilBox.y + veilBox.h / 2}px`,
        '--vrx': `${veilBox.w * 0.75 + 90}px`,
        '--vry': `${veilBox.h * 0.75 + 90}px`,
      } as CSSProperties)
    : undefined;

  const privateFocus = focused ? objectStatus(focused).tone === 'private' : false;

  // لقطة قريبة للعنصر المفحوص — فقط بعد أن يعرفه اللاعب (نفس شرط السيرفر).
  const { objectViews } = useCasePresentation();
  const closeUpViews = closeUpViewsFor(focused, objectViews);

  return (
    <>
      <div className={r.photo} data-ready={ready} data-private={privateFocus}>
        {transform && (
          <div
            className={r.stage}
            style={
              {
                width: scene.width,
                height: scene.height,
                transform: stageCss(transform),
                '--inv': (1 / transform.scale).toFixed(5),
              } as CSSProperties
            }
          >
            {imageUrl && (
              // رابط موقّت قصير العمر من السيرفر — next/image ما بيناسبه (نفس قرار العارضات).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={r.image}
                src={imageUrl}
                alt={scene.alt}
                width={scene.width}
                height={scene.height}
                draggable={false}
                decoding="async"
                fetchPriority="high"
                onLoad={() => setLoadedUrl(imageUrl)}
                onError={onImageError}
              />
            )}

            {focused && <div className={r.dismiss} aria-hidden="true" onClick={() => onFocus(null)} />}

            <div
              className={r.veil}
              data-on={veilOn}
              style={veilStyle}
              aria-hidden="true"
            />

            {focused && focusAnchor && (
              <span
                className={r.focusFrame}
                aria-hidden="true"
                style={{
                  left: focusAnchor.box.x,
                  top: focusAnchor.box.y,
                  width: focusAnchor.box.w,
                  height: focusAnchor.box.h,
                }}
              />
            )}

            {ready &&
              transform &&
              spots.map((o) => (
                <SceneHotspot
                  key={o.code}
                  object={o}
                  anchor={scene.anchors[o.code] as SceneAnchor}
                  transform={transform}
                  view={view}
                  ready={readyCodes.has(o.code)}
                  refCallback={(el) => {
                    if (el) buttons.current.set(o.code, el);
                    else buttons.current.delete(o.code);
                  }}
                  onHover={(code) => {
                    setHovered(code);
                    if (code) {
                      setVeilCode(code);
                      setExplored(true);
                    }
                  }}
                  onOpen={() => onFocus(o.code)}
                />
              ))}
          </div>
        )}
      </div>

      <div className={r.atmosphere} aria-hidden="true" />

      {ready && focused && layout && closeUpViews.length > 0 && (
        <ObjectCloseUp
          key={focused.code}
          sessionId={sessionId}
          objectCode={focused.code}
          views={closeUpViews}
          frame={layout.free}
        />
      )}

      {!ready && (
        <p className={r.loading} role="status">
          جارٍ فتح موقع التحقيق…
        </p>
      )}

      {ready && !focused && (unplaced.length > 0 || !explored) && (
        <div className={r.margin}>
          {unplaced.length > 0 && (
            <section className={r.offFrame} aria-labelledby="off-frame-title">
              <h2 id="off-frame-title" className={r.offFrameTitle}>
                خارج إطار الصورة
              </h2>
              <ul className={r.unplaced}>
                {unplaced.map((o) => {
                  const status = objectStatus(o, readyCodes.has(o.code));
                  return (
                    <li key={o.code}>
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) buttons.current.set(o.code, el);
                          else buttons.current.delete(o.code);
                        }}
                        className={r.unplacedItem}
                        data-tone={status.tone}
                        aria-label={`${o.title} — ${status.label}. ${AFFORDANCE[status.tone]}`}
                        onClick={() => onFocus(o.code)}
                      >
                        <span className={r.unplacedIcon} aria-hidden="true">
                          <CategoryIcon category={o.category} size={15} />
                        </span>
                        <span className={r.unplacedTitle}>{o.title}</span>
                        <span className={r.unplacedMeta}>{status.label}</span>
                        <span className={r.unplacedGo} aria-hidden="true">
                          ←
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {!explored && (
            <p className={r.hint}>مرّر المؤشر على الغرفة، أو تنقّل بمفتاح Tab، لتلاحظ ما يستحق الفحص.</p>
          )}
        </div>
      )}
    </>
  );
}
