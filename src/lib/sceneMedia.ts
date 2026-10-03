// ============================================================
// src/lib/sceneMedia.ts
// قائمة السماح لوسائط المشهد (سيرفر فقط — يستوردها route.ts).
// المسارات نفسها تعيش بوحدة كل قضية بالسيرفر
// (src/server/cases/<case>/media.ts)؛ هنا القاعدة المشتركة فقط.
// مسارات Storage لا تصل للمتصفح أبداً؛ المتصفح يرسل رموزاً آمنة
// (كود موقع، أو كود عنصر + مفتاح لقطة) ويستلم رابطاً موقّتاً فقط.
//
// لقطات العناصر القريبة (مثل الجواز) ليست أدلة: لا صفوف evidence ولا
// أكواد أدلة. هي "كيف يبدو الشيء عن قرب" بعد أن يعرفه اللاعب — لذلك
// لا تُمنح إلا لعنصر ظاهر لهذا اللاعب بفهرس التحقيق الخاص به،
// ومكتشَف، وليس اكتشافاً خاصاً لزميل (HIDDEN) — وسلسلة آبائه كلها
// ظاهرة له أيضاً (خط دفاع ثانٍ فوق sql/026، مغلق عند الشك).
// كل بحث بالمفاتيح "خاص بالكائن" — لا وراثة من prototype.
// ============================================================

import { ancestorsKnownInRows, type IndexRow } from './objectVisibility';
import { own } from '@/cases/presentation';
import { getCaseServerModule, serverCaseIds } from '@/server/cases/registry';

/** قضية → موقع → مسار صورة المشهد الكاملة. */
export const SCENE_ALLOWLIST: Record<string, Record<string, string>> = Object.fromEntries(
  serverCaseIds().map((id) => [id, { ...getCaseServerModule(id)!.media.scenes }]),
);

/** قضية → كود عنصر تحقيق موجود → مفتاح لقطة → مسار. */
export const OBJECT_VIEW_ALLOWLIST: Record<string, Record<string, Record<string, string>>> = Object.fromEntries(
  serverCaseIds().map((id) => [id, { ...getCaseServerModule(id)!.media.objectViews }]),
);

export type VisibleObjectRow = IndexRow;

/** مسار صورة مشهد موقع ضمن قضيته فقط؛ غير ذلك null. */
export function sceneImagePath(caseId: string, locationCode: string): string | null {
  return own(own(SCENE_ALLOWLIST, caseId) ?? {}, locationCode) ?? null;
}

/**
 * مسار لقطة عنصر — فقط إذا كان العنصر ضمن ما يراه اللاعب نفسه
 * (صفوف investigation_object_index بجلسته)، مكتشَفاً، وليس محجوباً عنه،
 * وكل أسلافه موجودون ومعروفون له (لا أب مفقود، لا حلقة، لا عمق زائد).
 * أي شرط ناقص = null (لا تمييز بين "غير موجود" و"غير مسموح").
 */
export function resolveObjectView(
  caseId: string,
  objectCode: string,
  viewKey: string,
  myVisibleObjects: VisibleObjectRow[],
): string | null {
  const path = own(own(own(OBJECT_VIEW_ALLOWLIST, caseId) ?? {}, objectCode) ?? {}, viewKey);
  if (typeof path !== 'string' || !path) return null;
  const row = myVisibleObjects.find((o) => o.code === objectCode);
  if (!row || !row.discovered || row.state === 'HIDDEN') return null;
  if (!ancestorsKnownInRows(myVisibleObjects, objectCode)) return null;
  return path;
}
