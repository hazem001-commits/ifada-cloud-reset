// ============================================================
// src/lib/objectVisibility.ts
// قاعدة "ظهور الابن يتطلب ظهور سلسلة الآباء" — نفس خوارزمية
// public._object_ancestors_known (sql/026) بالضبط، مغلقة عند الشك:
//   • العنصر نفسه غير موجود            → غير ظاهر
//   • أب مذكور غير موجود               → غير ظاهر
//   • حلقة بالسلسلة                     → غير ظاهر
//   • عمق أكثر من MAX_ANCESTOR_DEPTH   → غير ظاهر
//   • أي سلف غير معروف للاعب            → غير ظاهر
// "معروف" يُمرَّر من المستدعي حسب مصدر البيانات (صفوف فهرس اللاعب
// بالسيرفر، أو حالة الجلسة بنموذج الاختبار).
// ============================================================

export const MAX_ANCESTOR_DEPTH = 8;

const norm = (code: string | null | undefined): string => (code ?? '').trim().toUpperCase();

/**
 * @param parentOf كود الأب: null = جذر، undefined = العنصر غير موجود.
 * @param known    هل هذا السلف مكتشَف ومعروف للاعب (مشترك أو اكتشافه).
 */
export function ancestorsKnown(
  code: string,
  parentOf: (code: string) => string | null | undefined,
  known: (code: string) => boolean,
): boolean {
  const self = norm(code);
  if (!self) return false;

  const first = parentOf(self);
  if (first === undefined) return false;

  const seen = new Set<string>([self]);
  let parent = norm(first) || null;
  let depth = 0;

  while (parent) {
    depth += 1;
    if (depth > MAX_ANCESTOR_DEPTH) return false;
    if (seen.has(parent)) return false;
    seen.add(parent);

    const next = parentOf(parent);
    if (next === undefined) return false;
    if (!known(parent)) return false;

    parent = norm(next) || null;
  }
  return true;
}

export interface IndexRow {
  code: string;
  parent_code: string | null;
  discovered: boolean;
  state: string;
}

/**
 * نفس القاعدة فوق صفوف investigation_object_index الخاصة باللاعب:
 * السلف "معروف" إذا ظهر بفهرسه، مكتشَفاً، وليس اكتشافاً خاصاً لزميل
 * (state = 'HIDDEN'). غياب صف السلف = غير ظاهر.
 */
export function ancestorsKnownInRows(rows: IndexRow[], code: string): boolean {
  const byCode = new Map(rows.map((r) => [norm(r.code), r]));
  return ancestorsKnown(
    code,
    (c) => {
      const row = byCode.get(c);
      return row ? row.parent_code : undefined;
    },
    (c) => {
      const row = byCode.get(c);
      return !!row && row.discovered && row.state !== 'HIDDEN';
    },
  );
}
