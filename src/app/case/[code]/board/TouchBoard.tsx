// ============================================================
// src/app/case/[code]/board/TouchBoard.tsx
// لوحة التحقيق على اللمس (هاتف / لوح): نفس السطح المكاني المشترك —
// ليست قائمة. "عالم" بحجم ثابت يحمل المواد بمواضعها المشتركة نفسها
// (نسب 0..1 كما على المكتب)، والكاميرا فوقه:
//
//   سحب على الفراغ  = تجوّل          قرصة بإصبعين = تكبير/تصغير
//   لمسة على مادة   = تركيز (ورقة)    ضغط مطوّل ثم سحب = نقل المادة
//
// لا التباس بين "أحرّك البطاقة" و"أربط": الربط وضع صريح من ورقة التركيز.
// هذا الملف عرض وإيماءات فقط؛ كل الأفعال والصلاحيات في InvestigationBoard
// (نفس boardStore ونفس visibleBoard — لا منطق لوحة جديد).
// ============================================================
'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import s from './board.module.css';

/** حجم العالم (px) — البطاقة ≈ 15٪ من العرض كما على المكتب. */
export const WORLD = { w: 1300, h: 820 } as const;
const MIN_SCALE = 0.22;
const MAX_SCALE = 1.6;
/** تحت هذا المقياس: نظرة عامة (شكل اللوحة)، لا قراءة. */
export const FAR_SCALE = 0.55;
/** مقياس القراءة المريح عند التركيز على مادة. */
const READ_SCALE = 0.9;
const HOLD_MS = 420;
const SLOP = 8;

export interface View {
  scale: number;
  tx: number;
  ty: number;
}

export interface TouchBoardHandle {
  /** يُظهر المادة وسط الجزء المكشوف من اللوحة (خارج ورقة التركيز). */
  reveal: (pos: { x: number; y: number }, cover: Cover) => void;
  /** مادتان معاً خارج الورقة (بعد اختيار الثانية في وضع الربط): الخيط بينهما ظاهر. */
  revealPair: (a: { x: number; y: number }, b: { x: number; y: number }, cover: Cover) => void;
  /** كل ما على اللوحة في الإطار. */
  overview: () => void;
}

/** ما تغطيه ورقة التركيز: أسفل (هاتف عمودي) أو يسار (لوح / هاتف أفقي، RTL). */
export type Cover = { bottom: number } | { left: number };

type Gesture =
  | { kind: 'idle' }
  | {
      kind: 'one';
      id: number;
      sx: number;
      sy: number;
      start: View;
      node: string | null;
      moved: boolean;
      lifted: boolean;
      origin: { x: number; y: number } | null;
      t0: number;
    }
  | { kind: 'pinch'; dist: number; mid: { x: number; y: number }; start: View };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** الجزء المكشوف من اللوحة (مركزه وحجمه) بعد اقتطاع ما تغطيه الورقة. */
function uncovered(cover: Cover, { w, h }: { w: number; h: number }) {
  if ('left' in cover) {
    const cw = Math.max(160, w - cover.left);
    return { w: cw, h, cx: cover.left + cw / 2, cy: h / 2 };
  }
  const ch = Math.max(120, h - cover.bottom);
  return { w, h: ch, cx: w / 2, cy: ch / 2 };
}

export default function TouchBoard({
  handleRef,
  items,
  lanes,
  threads,
  pieces,
  linking,
  onTapNode,
  onTapEmpty,
  onMove,
  controls,
  overlay,
}: {
  handleRef: Ref<TouchBoardHandle>;
  /** مواضع ما على لوحتي (للتأطير). */
  items: readonly { id: string; x: number; y: number }[];
  lanes: readonly { id: string; label: string }[];
  /** خيوط SVG (viewBox 0..100) — تُرسم داخل العالم نفسه. */
  threads: ReactNode;
  pieces: ReactNode;
  /** وضع الربط: المواد تصبح أهدافاً، والفراغ لا يُلغي الاختيار. */
  linking: boolean;
  onTapNode: (id: string) => void;
  onTapEmpty: () => void;
  /** نقل مادة (نسب العالم) — حيّ أثناء السحب ثم commit عند الإفلات. */
  onMove: (id: string, x: number, y: number, commit: boolean) => void;
  controls?: ReactNode;
  overlay?: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState<View>({ scale: 0.75, tx: 0, ty: 0 });
  const [animate, setAnimate] = useState(false);
  const [lifted, setLifted] = useState<string | null>(null);
  // آخر كاميرا للإيماءات (تُحدَّث مع الحالة نفسها، لا أثناء الرسم).
  const viewRef = useRef(view);
  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({ kind: 'idle' });
  const holdTimer = useRef<number | null>(null);
  const framed = useRef(false);
  // المواضع تتجدد مع كل رسم (مصفوفة جديدة) — الكاميرا تقرؤها من مرجع ثابت
  // حتى لا يُعاد ربط مراقب الحجم مع كل رسم.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const size = () => {
    const r = viewportRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0, left: r?.left ?? 0, top: r?.top ?? 0 };
  };

  /** يبقى جزء من العالم ظاهراً دائماً — لا تضيع اللوحة خارج الشاشة. */
  const bound = useCallback((v: View): View => {
    const { w, h } = size();
    const ww = WORLD.w * v.scale;
    const wh = WORLD.h * v.scale;
    const keep = 96;
    const tx = ww <= w ? clamp(v.tx, 0, w - ww) : clamp(v.tx, w - ww - keep, keep);
    const ty = wh <= h ? clamp(v.ty, 0, h - wh) : clamp(v.ty, h - wh - keep, keep);
    return { scale: v.scale, tx, ty };
  }, []);

  const go = useCallback(
    (v: View, smooth: boolean) => {
      setAnimate(smooth);
      setView(bound(v));
    },
    [bound, setView],
  );

  /** إطار حول المواد (لا حول العالم كله) — بمقياس قراءة إن أمكن. */
  const frame = useCallback(
    (minScale: number, smooth: boolean) => {
      const { w, h } = size();
      if (w === 0) return;
      const pad = 150;
      const items = itemsRef.current;
      const xs = items.map((i) => i.x * WORLD.w);
      const ys = items.map((i) => i.y * WORLD.h);
      const x0 = items.length ? Math.min(...xs) - pad : 0;
      const x1 = items.length ? Math.max(...xs) + pad : WORLD.w;
      const y0 = items.length ? Math.min(...ys) - pad * 0.7 : 0;
      const y1 = items.length ? Math.max(...ys) + pad * 0.7 : WORLD.h;
      const fit = Math.min(w / (x1 - x0), (h - 72) / (y1 - y0));
      const scale = clamp(Math.max(fit, minScale), MIN_SCALE, 1.05);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      go({ scale, tx: w / 2 - cx * scale, ty: (h - 72) / 2 - cy * scale + 8 }, smooth);
    },
    [go],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      reveal: (p, cover) => {
        const r = uncovered(cover, size());
        const v = viewRef.current;
        const scale = Math.max(v.scale, READ_SCALE);
        go({ scale, tx: r.cx - p.x * WORLD.w * scale, ty: r.cy - p.y * WORLD.h * scale }, true);
      },
      revealPair: (a, b, cover) => {
        const r = uncovered(cover, size());
        const dx = Math.abs(a.x - b.x) * WORLD.w + 260;
        const dy = Math.abs(a.y - b.y) * WORLD.h + 200;
        const scale = clamp(Math.min(r.w / dx, r.h / dy), MIN_SCALE, READ_SCALE);
        const cx = ((a.x + b.x) / 2) * WORLD.w;
        const cy = ((a.y + b.y) / 2) * WORLD.h;
        go({ scale, tx: r.cx - cx * scale, ty: r.cy - cy * scale }, true);
      },
      overview: () => frame(MIN_SCALE, true),
    }),
    [go, frame],
  );

  // أول قياس: المواد بمقياس قراءة (يمكن التجوّل/التصغير بعدها). بعده،
  // تغيّر حجم الشاشة (دوران الهاتف) = نفس الكاميرا ضمن الحدود الجديدة.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    // أمان: لا يُمرَّر الإطار نفسه أبداً (المتصفح يمرّره ليُظهر عنصراً مركَّزاً).
    const unscroll = () => {
      if (el.scrollLeft !== 0 || el.scrollTop !== 0) el.scrollTo(0, 0);
    };
    el.addEventListener('scroll', unscroll);
    const ro = new ResizeObserver(() => {
      if (size().w === 0) return;
      if (!framed.current) {
        framed.current = true;
        frame(0.72, false);
      } else setView(bound(viewRef.current));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', unscroll);
    };
  }, [bound, frame, setView]);

  /** لوحة مفاتيح: مادة مركَّزة خارج الإطار → الكاميرا تذهب إليها (بدل تمرير المتصفح). */
  function onFocusCapture(e: React.FocusEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-item-id]');
    const id = el?.dataset.itemId;
    const it = id ? itemsRef.current.find((i) => i.id === id) : undefined;
    if (!el || !it) return;
    const r = el.getBoundingClientRect();
    const { w, h, left, top } = size();
    if (r.left >= left && r.right <= left + w && r.top >= top && r.bottom <= top + h) return;
    const v = viewRef.current;
    go({ scale: v.scale, tx: w / 2 - it.x * WORLD.w * v.scale, ty: h / 2 - it.y * WORLD.h * v.scale }, true);
  }

  const toWorld = (clientX: number, clientY: number, v: View) => {
    const { left, top } = size();
    return { x: (clientX - left - v.tx) / v.scale, y: (clientY - top - v.ty) / v.scale };
  };

  const clearHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // أزرار/حقول داخل الطبقات فوق اللوحة تعمل كعادتها.
    if ((e.target as HTMLElement).closest('[data-board-ui]')) return;
    viewportRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setAnimate(false);
    if (pointers.current.size === 2) {
      clearHold();
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      gesture.current = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, start: viewRef.current };
      setLifted(null);
      return;
    }
    const node = (e.target as HTMLElement).closest<HTMLElement>('[data-item-id]')?.dataset.itemId ?? null;
    const it = node ? itemsRef.current.find((i) => i.id === node) : undefined;
    gesture.current = {
      kind: 'one',
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      start: viewRef.current,
      node,
      moved: false,
      lifted: false,
      origin: it ? { x: it.x, y: it.y } : null,
      t0: Date.now(),
    };
    // ضغط مطوّل على مادة = ارفعها (لا في وضع الربط: هناك اللمسة اختيار).
    if (node && !linking) {
      holdTimer.current = window.setTimeout(() => {
        const g = gesture.current;
        if (g.kind === 'one' && !g.moved && g.node === node) {
          g.lifted = true;
          setLifted(node);
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(12);
        }
      }, HOLD_MS);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = clamp(g.start.scale * (dist / Math.max(1, g.dist)), MIN_SCALE, MAX_SCALE);
      // النقطة تحت منتصف الإصبعين تبقى تحتهما.
      const anchor = toWorld(g.mid.x, g.mid.y, g.start);
      const { left, top } = size();
      go({ scale, tx: mid.x - left - anchor.x * scale, ty: mid.y - top - anchor.y * scale }, false);
      return;
    }
    if (g.kind !== 'one' || g.id !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < SLOP) return;
    if (!g.moved) {
      g.moved = true;
      if (!g.lifted) clearHold();
    }
    if (g.lifted && g.node && g.origin) {
      const v = viewRef.current;
      const x = clamp(g.origin.x + dx / v.scale / WORLD.w, 0.03, 0.97);
      const y = clamp(g.origin.y + dy / v.scale / WORLD.h, 0.05, 0.95);
      onMove(g.node, x, y, false);
      return;
    }
    go({ scale: g.start.scale, tx: g.start.tx + dx, ty: g.start.ty + dy }, false);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    clearHold();
    if (g.kind === 'pinch') {
      // إصبع واحد بقي: يكمل تجوّلاً من حيث هو، بلا لمسة عرضية.
      const rest = [...pointers.current.entries()][0];
      gesture.current = rest
        ? { kind: 'one', id: rest[0], sx: rest[1].x, sy: rest[1].y, start: viewRef.current, node: null, moved: true, lifted: false, origin: null, t0: 0 }
        : { kind: 'idle' };
      return;
    }
    if (g.kind !== 'one' || g.id !== e.pointerId) return;
    gesture.current = { kind: 'idle' };
    if (g.lifted && g.node && g.origin) {
      setLifted(null);
      if (g.moved) {
        const v = viewRef.current;
        const x = clamp(g.origin.x + (e.clientX - g.sx) / v.scale / WORLD.w, 0.03, 0.97);
        const y = clamp(g.origin.y + (e.clientY - g.sy) / v.scale / WORLD.h, 0.05, 0.95);
        onMove(g.node, x, y, true);
      }
      return;
    }
    if (g.moved || e.type === 'pointercancel') return;
    if (g.node) onTapNode(g.node);
    else onTapEmpty();
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    const v = viewRef.current;
    if (e.ctrlKey || e.metaKey) {
      const scale = clamp(v.scale * Math.exp(-e.deltaY * 0.01), MIN_SCALE, MAX_SCALE);
      const p = toWorld(e.clientX, e.clientY, v);
      const { left, top } = size();
      go({ scale, tx: e.clientX - left - p.x * scale, ty: e.clientY - top - p.y * scale }, false);
    } else {
      go({ scale: v.scale, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }, false);
    }
  }

  const zoomBy = (f: number) => {
    const { w, h } = size();
    const v = viewRef.current;
    const scale = clamp(v.scale * f, MIN_SCALE, MAX_SCALE);
    const cx = (w / 2 - v.tx) / v.scale;
    const cy = (h / 2 - v.ty) / v.scale;
    go({ scale, tx: w / 2 - cx * scale, ty: h / 2 - cy * scale }, true);
  };

  const far = view.scale < FAR_SCALE;

  return (
    <div
      ref={viewportRef}
      className={s.touchViewport}
      data-linking={linking ? 'true' : 'false'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onFocusCapture={onFocusCapture}
    >
      <div
        className={s.touchWorld}
        data-zoom={far ? 'far' : 'near'}
        data-animate={animate ? 'true' : 'false'}
        data-lifted={lifted ?? ''}
        style={
          {
            width: WORLD.w,
            height: WORLD.h,
            transform: `translate3d(${view.tx}px, ${view.ty}px, 0) scale(${view.scale})`,
            '--inv': (1 / view.scale).toFixed(4),
          } as CSSProperties
        }
      >
        {lanes.length > 0 && (
          <div className={s.lanes} aria-hidden="true">
            {lanes.map((l) => (
              <div key={l.id} className={s.lane}>
                <span className={s.laneLabel}>{l.label}</span>
              </div>
            ))}
          </div>
        )}
        {threads}
        {pieces}
      </div>

      <div className={s.zoomDock} data-board-ui="true" role="group" aria-label="عرض اللوحة">
        <button type="button" className={s.zoomBtn} onClick={() => zoomBy(1.3)} aria-label="قرّب">
          +
        </button>
        <button type="button" className={s.zoomBtn} onClick={() => zoomBy(1 / 1.3)} aria-label="بعّد">
          −
        </button>
        <button type="button" className={s.zoomBtn} onClick={() => frame(MIN_SCALE, true)} aria-label="اللوحة كاملة">
          <span aria-hidden="true">⤢</span>
        </button>
      </div>

      {controls}
      {overlay}
      {far && !linking && (
        <p className={s.touchHint} aria-hidden="true">
          نظرة عامة — المس مادة لتقترب منها
        </p>
      )}
    </div>
  );
}

export { READ_SCALE };
