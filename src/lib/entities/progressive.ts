// ============================================================
// src/lib/entities/progressive.ts
// الأشخاص/الكيانات التدريجية — أساس نقي (بلا تخزين بعد).
//
//   رجل مجهول → رجل بشعر رمادي → نزيل محتمل → طبيب محتمل → د. نبيل
//
// القواعد:
//   • المعرّف الرسمي للكيان يبقى بالسيرفر — اللاعب يرى "مقبضاً" معتماً
//     ثابتاً بالجلسة، لا يحمل الاسم ولا المعرّف.
//   • التسمية المعروضة = أعلى وصف مكتسب فعلاً (اكتشافات اللاعب/الفريق).
//   • لا تسريب هوية مبكر: وصف لم يُكتسب لا يظهر بأي شكل.
//   • المعرفة الخاصة تبقى خاصة: ما يكسبه اللاعب يُحسب فقط من مواده هو
//     المصرّح بها (earnedFromAuthorized). اكتشاف خاص لزميل لا يرفع
//     تسمية لاعب آخر. "الدمج" يحدث فقط عندما يصبح الاكتشاف نفسه
//     مشتركاً (فيظهر بمواد اللاعب الآخر)، أو بحدث مكتوب مرئي للفريق
//     (رابط مثبت للفريق، طبقة استجواب يراها الجميع). لا اتحاد مباشر
//     بين معارف اللاعبين أبداً.
//   • نص دليل يشير لكيان عبر رمز {{entity:ID}} يُعرض بتسمية القارئ
//     الحالية — لا يفرض كشف الهوية الكاملة.
// ============================================================

/** مصدر يكسب وصفاً — حقائق لعب موجودة أصلاً (لا حالة جديدة). */
export type DescriptorSource =
  | { kind: 'evidence'; code: string }
  | { kind: 'object_state'; code: string; state: string }
  | { kind: 'connection'; ruleId: string }
  | { kind: 'interrogation_layer'; character: string; layer: number };

/** وصف مكتوب — حقيقة قضية (سيرفر فقط). */
export interface AuthoredDescriptor {
  id: string;
  /** ما يراه اللاعب عند اكتسابه ("رجل بشعر رمادي"). */
  label: string;
  /** الأعلى = أكثر تحديداً. التسمية المعروضة = أعلى مستوى مكتسب. */
  level: number;
  /** يكفي أي مصدر واحد منها. قائمة فارغة = لا يُكتسب أبداً (مغلق). */
  earnedBy: DescriptorSource[];
  /** هذا الوصف هو الهوية الكاملة (الاسم). */
  identity?: boolean;
}

/** كيان مكتوب — سيرفر فقط. */
export interface AuthoredEntity {
  id: string;
  descriptors: AuthoredDescriptor[];
}

/** ما اكتسبه لاعب (أو فريق بعد المشاركة) — مفاتيح حقائق لعب. */
export type EarnedFacts = ReadonlySet<string>;

export const sourceKey = (s: DescriptorSource): string => {
  switch (s.kind) {
    case 'evidence':
      return `evidence:${s.code}`;
    case 'object_state':
      return `object:${s.code}@${s.state}`;
    case 'connection':
      return `connection:${s.ruleId}`;
    case 'interrogation_layer':
      return `layer:${s.character}#${s.layer}`;
  }
};

/** العرض الآمن للاعب: لا معرّف رسمي، لا أوصاف غير مكتسبة. */
export interface EntityView {
  handle: string;
  label: string;
  level: number;
  /** كل الأوصاف المكتسبة (تسميات فقط)، من الأعم للأدق. */
  descriptors: string[];
  identified: boolean;
}

export function earnedDescriptors(entity: AuthoredEntity, earned: EarnedFacts): AuthoredDescriptor[] {
  return entity.descriptors
    .filter((d) => d.earnedBy.length > 0 && d.earnedBy.some((s) => earned.has(sourceKey(s))))
    .sort((a, b) => a.level - b.level);
}

/**
 * عرض الكيان لهذا اللاعب. لا وصف مكتسب → null (الكيان غير معروف له
 * إطلاقاً — لا حتى "شخص مجهول"). handleOf يُحقن من السيرفر (مقبض معتم
 * لكل جلسة، مثل HMAC(سر الجلسة، المعرّف)).
 */
export function entityViewFor(
  entity: AuthoredEntity,
  earned: EarnedFacts,
  handleOf: (entityId: string) => string,
): EntityView | null {
  const got = earnedDescriptors(entity, earned);
  const top = got.at(-1);
  if (!top) return null;
  return {
    handle: handleOf(entity.id),
    label: top.label,
    level: top.level,
    descriptors: got.map((d) => d.label),
    identified: got.some((d) => d.identity === true),
  };
}

/**
 * ما كسبه لاعب واحد — من مواده المصرّح بها له فقط:
 *   readableEvidence     أكواد أدلة يقرأها هو (العنوان وحده لا يكسب شيئاً)
 *   visibleObjectStates  عناصر اكتشافه أو المشتركة (لا المحجوبة/غير المفحوصة)
 *   teamConnections      روابط مثبتة للفريق (حدث مكتوب مرئي للجميع)
 *   teamLayers           طبقات استجواب بلغها الفريق (الاستجواب مرئي للجميع)
 * لا مدخل هنا لمعرفة لاعب آخر — هذا هو ضمان الخصوصية.
 */
export function earnedFromAuthorized(input: {
  readableEvidence: readonly string[];
  visibleObjectStates: readonly { code: string; state: string }[];
  teamConnections: readonly string[];
  teamLayers: readonly { character: string; layer: number }[];
}): EarnedFacts {
  const out = new Set<string>();
  for (const code of input.readableEvidence) out.add(sourceKey({ kind: 'evidence', code }));
  for (const o of input.visibleObjectStates) out.add(sourceKey({ kind: 'object_state', code: o.code, state: o.state }));
  for (const ruleId of input.teamConnections) out.add(sourceKey({ kind: 'connection', ruleId }));
  for (const l of input.teamLayers) {
    // بلوغ طبقة أعلى يعني أن ما قبلها انكشف أيضاً.
    for (let n = 1; n <= l.layer; n += 1) out.add(sourceKey({ kind: 'interrogation_layer', character: l.character, layer: n }));
  }
  return out;
}

export const UNKNOWN_ENTITY_LABEL = 'شخص غير محدد';

/**
 * يعرض نصاً مكتوباً يشير لكيانات برموز {{entity:ID}} بتسمية القارئ
 * الحالية. كيان غير معروف له → تسمية عامة، لا الاسم ولا المعرّف.
 */
export function renderEntityRefs(
  text: string,
  entities: Readonly<Record<string, AuthoredEntity>>,
  earned: EarnedFacts,
): string {
  return text.replace(/\{\{entity:([A-Za-z0-9_-]{1,64})\}\}/g, (_m, id: string) => {
    const entity = Object.prototype.hasOwnProperty.call(entities, id) ? entities[id] : undefined;
    const top = entity ? earnedDescriptors(entity, earned).at(-1) : undefined;
    return top?.label ?? UNKNOWN_ENTITY_LABEL;
  });
}
