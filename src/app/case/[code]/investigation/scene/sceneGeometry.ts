// ============================================================
// src/app/case/[code]/investigation/scene/sceneGeometry.ts
// نظام إحداثيات المشهد. كل نقطة اهتمام مكتوبة بإحداثيات الصورة
// الأصلية (بكسل مصدر 1536×1024)، مش نسب من الحاوية.
//
// الرسم: "مسرح" بحجم الصورة الأصلي بالضبط يحمل الصورة ونقاط
// الاهتمام معاً، ويتحوّل كقطعة وحدة بـ translate + scale محسوبين
// هون. لأن الصورة والنقاط يشتركون بنفس التحويل، ما في انزياح
// بأي عرض — المحاذاة مضمونة رياضياً، مش بالتجربة.
//
// الملاءمة = cover (بلا فراغات) مع قيد "منطقة آمنة": لو cover بيقص
// أي نقطة اهتمام، المقياس ينزل لحد ما تتسع المنطقة الآمنة كاملة،
// والإزاحة تُقيَّد بحيث تبقى كلها ظاهرة.
//
// هذا ملف عرض فقط: مواضع فيزيائية لعناصر موجودة أصلاً بـ
// investigation_object_index. ما في حالة ولا صلاحية ولا حقائق قضية.
// ============================================================

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** تحويل المسرح: نقطة مصدر (x,y) → شاشة (tx + x·scale, ty + y·scale). */
export interface StageTransform {
  scale: number;
  tx: number;
  ty: number;
}

export interface SceneAnchor {
  /** حدود الجسم الفيزيائي بالصورة. */
  box: Box;
  /** نقطة التقاط الضوء — أثر بصري خافت جداً على الجسم نفسه. */
  glint: Point;
  /** إطار الاقتراب عند الفحص (افتراضياً = box). يشمل ما يلزم رؤيته حوله. */
  frame?: Box;
}

export interface SceneDefinition {
  width: number;
  height: number;
  /** مركز التكوين المفضّل عند القص. */
  focal: Point;
  /** يجب أن تبقى ظاهرة دائماً بالعرض العام (اتحاد نقاط الاهتمام تقريباً). */
  safe: Box;
  alt: string;
  anchors: Record<string, SceneAnchor>;
}

// المشاهد المعتمدة تعيش بعرض كل قضية (src/cases/<case>/presentation.ts
// → scenes، مفاتيحها أكواد مواقع ضمن تلك القضية وحدها). هذا الملف
// أنواع وهندسة عامة فقط — لا بيانات قضية.

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * مجال الإزاحة المسموح على محور واحد (t = موضع حافة الصورة على الشاشة).
 *   بلا فراغ:            view − len·s ≤ t ≤ 0
 *   الآمنة بعد الغطاء:     t + safeStart·s ≥ insetStart
 *   الآمنة قبل الغطاء:     t + safeEnd·s ≤ view − insetEnd
 * الصورة أصغر من المساحة (حالة احتواء) → توسيط ضمن المساحة غير المغطاة.
 */
function axisRange(
  view: number,
  len: number,
  s: number,
  safeStart: number,
  safeEnd: number,
  insetStart = 0,
  insetEnd = 0,
) {
  const scaled = len * s;
  if (scaled <= view) {
    const centered = insetStart + (view - insetStart - insetEnd - scaled) / 2;
    const t = clamp(centered, 0, view - scaled);
    return { lo: t, hi: t };
  }
  const lo = Math.max(view - scaled, insetStart - safeStart * s);
  const hi = Math.min(0, view - insetEnd - safeEnd * s);
  if (lo <= hi) return { lo, hi };
  // الآمنة أكبر من المتاح (أو تساويه بفرق تقريب عشري): توسيطها بدل التخلي عنها.
  const mid = clamp((lo + hi) / 2, view - scaled, 0);
  return { lo: mid, hi: mid };
}

/**
 * التأطير العام للغرفة داخل مساحة العرض.
 * insets: شرائط واجهة ثابتة فوق/تحت المشهد لا يجوز أن تقع تحتها المنطقة الآمنة.
 */
export function fitScene(view: Size, scene: SceneDefinition, insets = { top: 0, bottom: 0 }): StageTransform {
  const { width: vw, height: vh } = view;
  if (vw <= 0 || vh <= 0) return { scale: 1, tx: 0, ty: 0 };

  const cover = Math.max(vw / scene.width, vh / scene.height);
  const usableH = Math.max(1, vh - insets.top - insets.bottom);
  const fitsSafe = Math.min(vw / scene.safe.w, usableH / scene.safe.h);
  const scale = Math.min(cover, fitsSafe);

  const xr = axisRange(vw, scene.width, scale, scene.safe.x, scene.safe.x + scene.safe.w);
  const yr = axisRange(vh, scene.height, scale, scene.safe.y, scene.safe.y + scene.safe.h, insets.top, insets.bottom);

  const tx = clamp(vw / 2 - scene.focal.x * scale, xr.lo, xr.hi);
  const ty = clamp(vh / 2 - scene.focal.y * scale, yr.lo, yr.hi);
  return { scale, tx, ty };
}

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * الاقتراب من جسم: تكبير يضع إطاره وسط المساحة الحرة (خارج لوحة الفحص).
 * قيد "بلا فراغ" يُطبَّق على الجزء المكشوف فقط (visible) — ما خلف لوحة
 * الفحص مغطّى أصلاً، فيجوز أن تتجاوزه الصورة لتصل الأجسام القريبة من
 * حافة اللوحة لمنتصف المساحة الحرة. سقف التكبير يحفظ وضوح الصورة.
 */
export function frameObject(
  scene: SceneDefinition,
  base: StageTransform,
  target: Box,
  free: Rect,
  visible: Rect,
): StageTransform {
  const freeW = Math.max(1, free.x1 - free.x0);
  const freeH = Math.max(1, free.y1 - free.y0);
  const visW = Math.max(1, visible.x1 - visible.x0);
  const visH = Math.max(1, visible.y1 - visible.y0);
  const minCover = Math.max(visW / scene.width, visH / scene.height);

  const want = Math.min((freeW * 0.55) / target.w, (freeH * 0.55) / target.h);
  const lo = Math.max(base.scale * 1.12, minCover);
  const scale = clamp(want, lo, Math.max(base.scale * 1.85, lo));

  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  const idealX = (free.x0 + free.x1) / 2 - cx * scale;
  const idealY = (free.y0 + free.y1) / 2 - cy * scale;

  const tx = clamp(idealX, visible.x1 - scene.width * scale, visible.x0);
  const ty = clamp(idealY, visible.y1 - scene.height * scale, visible.y0);
  return { scale, tx, ty };
}

export interface DossierLayout {
  mode: 'side' | 'sheet';
  size: number;
  /** الجزء غير المغطّى من المشهد. */
  visible: Rect;
  /** حيث يُوضع الجسم المفحوص (المكشوف ناقص هامش). */
  free: Rect;
}

/** ملف الفحص: عمود جانبي من بداية السطر (اليمين)، أو ورقة سفلية بالشاشات الضيقة. */
export function dossierLayout(view: Size, wide: boolean): DossierLayout {
  if (view.width < 760) {
    // أطول قليلاً على الشاشات القصيرة: الفعل الأساسي (لاحظ/سلّم) ظاهر بلا تمرير.
    const size = Math.round(view.height * (view.height < 720 ? 0.66 : 0.6));
    const visible: Rect = { x0: 0, x1: view.width, y0: 0, y1: view.height - size };
    return { mode: 'sheet', size, visible, free: { x0: 16, x1: view.width - 16, y0: 16, y1: visible.y1 - 16 } };
  }
  const size = wide
    ? Math.round(clamp(view.width * 0.4, 384, 544))
    : Math.round(clamp(view.width * 0.3, 352, 424));
  const visible: Rect = { x0: 0, x1: view.width - size, y0: 0, y1: view.height };
  return { mode: 'side', size, visible, free: { x0: 32, x1: visible.x1 - 32, y0: 40, y1: view.height - 40 } };
}

/** حدود النقر: الجسم نفسه، بحد أدنى 44px على الشاشة حول مركزه. */
export function hitBox(box: Box, scale: number, minScreenPx = 44): Box {
  const min = minScreenPx / Math.max(scale, 0.01);
  const w = Math.max(box.w, min);
  const h = Math.max(box.h, min);
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** نقطة مصدر → إحداثيات شاشة داخل مساحة العرض (للاختبار/التموضع الخارجي). */
export function toScreen(p: Point, t: StageTransform): Point {
  return { x: t.tx + p.x * t.scale, y: t.ty + p.y * t.scale };
}

export function stageCss(t: StageTransform): string {
  return `translate3d(${t.tx.toFixed(2)}px, ${t.ty.toFixed(2)}px, 0) scale(${t.scale.toFixed(5)})`;
}
