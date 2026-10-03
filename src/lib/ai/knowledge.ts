// ============================================================
// src/lib/ai/knowledge.ts
// عقد القضية للذكاء الاصطناعي — "ماذا يحق لهذا اللاعب أن يعرف؟"
//
// القاعدة: الذكاء الاصطناعي واجهة لحقيقة مكتوبة، وليس مصدر الحقيقة.
// كل نظام ذكي مستقبلي (بحث، موجّه، أشخاص تدريجيون، ربط كيانات،
// اختبار فرضية، استجواب/مواجهة، مساعدة إعادة بناء، جلسة الاستماع)
// يستهلك AuthorizedKnowledge فقط — لا جداول القضية ولا حقيقتها المخفية.
//
// المصدر: نفس حدود البحث المؤسَّس (src/app/api/case-inquiry): كل قراءة
// معرفة تتم بعميل اللاعب نفسه عبر RPCs/RLS المعتمدة (evidence_index،
// investigation_object_index، interrogation_subjects، المحضر)، بعد
// التحقق من العضوية. وجود الدليل يُحدَّد بنفس القاعدة المشتركة مع البحث
// (src/lib/evidenceVisibility.ts) وبسياسة عقد القضية:
//   readable   → المحتوى كاملاً
//   restricted → نفس السطح الظاهر للاعب بالضبط (عنوان، نوع، تخصص، وقت —
//                بلا نص)، فقط إن كانت سياسة القضية 'title'
//   hidden     → غائب تماماً: لا كود ولا عنوان ولا عدد ولا أي إشارة
//
// لا معرّفات قواعد ولا معرّفات كيانات رسمية بالمخرج أبداً.
// AuthorizedKnowledge نوع "موسوم": لا يُصنع إلا بـ buildAuthorizedKnowledge.
//
// RESET-1 (sql/037): المحرك يضيف — للاعب نفسه فقط — الخيوط التي يحملها
// أو المشتركة، حالات العالم التي بلغها الفريق، والأماكن المغلقة التي
// كُشفت له. كل حقيقة تحمل `team`: ما يعرفه الفريق كله منها (أساس
// TeamKnowledge، src/lib/runtime/teamKnowledge.ts). النبضات (Pulse) لا
// تدخل هنا أبداً: هي إشارة اجتماعية لا معرفة قضية.
// ============================================================
import type { Specialization } from '@/types/database';
import type { EvidenceRow, LogRow, ObjectRow, SubjectRow } from '@/lib/inquiry/search';
import type { KnowledgeView, NodeRef } from '@/lib/connections/types';
import { evidenceVisibility, type EvidenceVisibility, type RestrictedEvidencePolicy } from '@/lib/evidenceVisibility';
import { earnedFromAuthorized, entityViewFor, type AuthoredEntity, type EntityView } from '@/lib/entities/progressive';
import type { RuntimeKnowledgeInput } from '@/lib/runtime/types';

declare const AUTHORIZED: unique symbol;

export type FactKind = 'evidence' | 'object' | 'statement' | 'connection' | 'entity' | 'lead' | 'world_state' | 'place';

/**
 * ما يعرفه الفريق كله من هذه الحقيقة (من منظور توزيع القضية بالسيرفر):
 *   full  — كل عضو يقرأ المحتوى (مشترك / مسار مشترك / حدث فريق)
 *   title — كل عضو يرى العنوان فقط (سياسة title بغرفة 714)
 *   none  — ليست معرفة فريق (خاصة باللاعب، أو قناة خاصة، أو مشتقة له)
 */
export type TeamVisibility = 'full' | 'title' | 'none';

/** حقيقة كما تظهر للاعب — كلها وصلت له أصلاً عبر مسار مصرّح. */
export interface AuthorizedFact {
  /** evidence:CODE، object:CODE، statement:ID، connection:N، entity:HANDLE */
  id: string;
  kind: FactKind;
  /** restricted = دليل يظهر بعنوانه فقط بسطح اللاعب (قاعدة منتج)، بلا محتوى. */
  visibility: EvidenceVisibility;
  title: string;
  /** null فقط لـ restricted. */
  text: string | null;
  clock: string | null;
  /** لـ restricted فقط: من يملك قراءته (كما يعرضه سطح اللاعب). */
  ownerSpec: Specialization | null;
  team: TeamVisibility;
}

/** قاعدة يحق للاعب فحصها — القدرة فقط، لا محتوى القاعدة. */
export type CheckableRule =
  | { kind: 'connection' }
  | { kind: 'theory' }
  | { kind: 'challenge'; code: string };

export interface AuthorizedKnowledge {
  readonly [AUTHORIZED]: true;
  caseId: string;
  facts: readonly AuthorizedFact[];
  /** كيانات بتسمياتها المكتسبة لهذا اللاعب فقط (مقبض معتم، لا معرّف رسمي). */
  entities: readonly EntityView[];
  /** معاني الروابط المثبتة للفريق — بلا معرّفات قواعد. */
  relationships: readonly { meaning: string }[];
  tools: readonly string[];
  checkable: readonly CheckableRule[];
}

/** مدخلات البناء — كلها صفوف رجعت بجلسة اللاعب نفسه من مسار مصرّح. */
export interface AuthorizedInput {
  caseId: string;
  /** من عقد القضية؛ غيابها = 'hidden' (مغلق عند الشك). */
  restrictedEvidence: RestrictedEvidencePolicy;
  /** صفوف evidence_index للاعب نفسه فقط. */
  evidence: EvidenceRow[];
  objects: ObjectRow[];
  subjects: SubjectRow[];
  /** أسطر المحضر (تُؤخذ أقوال الشخصيات فقط). */
  log: LogRow[];
  /**
   * روابط الفريق المثبتة. ruleId يُستخدم بالسيرفر فقط لحساب ما كُسب من
   * أوصاف الكيانات — لا يدخل المخرج أبداً.
   */
  validatedConnections: { ruleId: string; meaning: string }[];
  /** طبقات استجواب بلغها الفريق (الاستجواب مرئي لكل الأعضاء). */
  interrogationLayers: { character: string; layer: number }[];
  /** كيانات القضية المكتوبة (سيرفر فقط) + مولّد المقبض المعتم للجلسة. */
  entities?: { authored: readonly AuthoredEntity[]; handleOf: (entityId: string) => string };
  tools: string[];
  challengeCodes: string[];
  connectionsEnabled: boolean;
  /**
   * أكواد أدلة يقرؤها كل عضو بتوزيع القضية (مسار مشترك بقضية قنوات).
   * غيابها = لا محتوى دليل في معرفة الفريق (مغلق عند الشك).
   */
  teamReadableEvidence?: readonly string[];
  /** قراءة المحرك (037) للاعب نفسه — بلا نبضات. غيابها = لا محرك بعد. */
  runtime?: RuntimeKnowledgeInput | null;
}

/** نفس قاعدة البحث وملف القضية: اكتشافي أو مشترك — لا المحجوب ولا غير المفحوص. */
const objectKnown = (o: ObjectRow) => o.discovered && o.state !== 'HIDDEN';

export function buildAuthorizedKnowledge(input: AuthorizedInput): AuthorizedKnowledge {
  const policy: RestrictedEvidencePolicy = input.restrictedEvidence === 'title' ? 'title' : 'hidden';
  const facts: AuthorizedFact[] = [];
  const readableCodes: string[] = [];
  const teamReadable = new Set(input.teamReadableEvidence ?? []);
  // دليل يظهر بعنوانه لكل عضو (سياسة title)، أو بمحتواه لكل عضو (مسار مشترك).
  const evidenceTeam = (code: string): TeamVisibility => (teamReadable.has(code) ? 'full' : policy === 'title' ? 'title' : 'none');

  for (const e of input.evidence) {
    const visibility = evidenceVisibility(e, policy);
    if (!visibility) continue; // مخفي: لا يترك أي أثر
    if (visibility === 'readable') {
      readableCodes.push(e.code);
      facts.push({ id: `evidence:${e.code}`, kind: 'evidence', visibility, title: e.title, text: e.body, clock: e.clock_label, ownerSpec: null, team: evidenceTeam(e.code) });
    } else {
      // نفس سطح اللاعب بالضبط: evidence_index يعطيه العنوان والوقت والتخصص — بلا نص.
      facts.push({ id: `evidence:${e.code}`, kind: 'evidence', visibility, title: e.title, text: null, clock: e.clock_label, ownerSpec: e.owner_spec, team: 'title' });
    }
  }

  const knownObjects = input.objects.filter(objectKnown);
  const byCode = new Map(input.objects.map((o) => [o.code, o]));
  // معرفة فريق فقط إن كان العنصر وكل أسلافه مشتركين (عنصر مشترك تحت سلف
  // خاص بي ليس معرفة فريق). سلف مفقود/حلقة/عمق → لا (مغلق عند الشك).
  const teamShared = (o: ObjectRow): boolean => {
    let cur: ObjectRow | undefined = o;
    for (let d = 0; cur; d += 1) {
      if (d > 8 || !cur.is_shared || !cur.discovered) return false;
      if (!cur.parent_code) return true;
      cur = byCode.get(cur.parent_code);
    }
    return false;
  };
  for (const o of knownObjects) {
    facts.push({ id: `object:${o.code}`, kind: 'object', visibility: 'readable', title: o.title, text: o.description || '', clock: null, ownerSpec: null, team: teamShared(o) ? 'full' : 'none' });
  }

  const names = new Map(input.subjects.map((s) => [s.code, s.name]));
  for (const l of input.log) {
    if (l.speaker !== 'character') continue;
    // المحضر مرئي لكل الأعضاء (RLS 008).
    facts.push({ id: `statement:${l.id}`, kind: 'statement', visibility: 'readable', title: names.get(l.character_code) ?? 'إفادة', text: l.content, clock: null, ownerSpec: null, team: 'full' });
  }

  // معرّف استشهاد ترتيبي — لا يكشف اسم القاعدة المكتوبة.
  input.validatedConnections.forEach((c, i) => {
    facts.push({ id: `connection:${i + 1}`, kind: 'connection', visibility: 'readable', title: 'رابط مثبت', text: c.meaning, clock: null, ownerSpec: null, team: 'full' });
  });

  // المحرك (037): ما رجع لهذا اللاعب من runtime_state فقط. لا نبضات.
  if (input.runtime) {
    for (const l of input.runtime.leads) {
      if (!l.shared && !l.mine) continue; // لا يُفترض وصوله — مغلق عند الشك
      facts.push({ id: `lead:${l.code}`, kind: 'lead', visibility: 'readable', title: 'خيط تحقيق', text: l.label, clock: null, ownerSpec: null, team: l.shared ? 'full' : 'none' });
    }
    for (const w of input.runtime.world) {
      facts.push({ id: `world:${w.code}`, kind: 'world_state', visibility: 'readable', title: 'تطور بالقضية', text: w.headline, clock: null, ownerSpec: null, team: 'full' });
    }
    const objectIds = new Set(knownObjects.map((o) => o.code));
    for (const p of input.runtime.places) {
      if (objectIds.has(p.code)) continue; // ظاهر أصلاً كعنصر (بتصنيف فريقه الصحيح) — لا تكرار
      // بلا سلسلة أسلاف هنا لإثبات أنه مشترك بالكامل → ليس معرفة فريق (مغلق عند الشك)
      facts.push({ id: `place:${p.code}`, kind: 'place', visibility: 'readable', title: p.title, text: '', clock: null, ownerSpec: null, team: 'none' });
    }
  }

  // الكيانات: من مواد هذا اللاعب المصرّح بها فقط — لا من معرفة زميل.
  const entities: EntityView[] = [];
  if (input.entities) {
    const earned = earnedFromAuthorized({
      readableEvidence: readableCodes,
      visibleObjectStates: knownObjects.map((o) => ({ code: o.code, state: o.state })),
      teamConnections: input.validatedConnections.map((c) => c.ruleId),
      teamLayers: input.interrogationLayers,
    });
    for (const entity of input.entities.authored) {
      const view = entityViewFor(entity, earned, input.entities.handleOf);
      if (view) entities.push(view);
    }
  }
  for (const en of entities) {
    // الأوصاف المكتسبة تُحسب لكل لاعب من مواده هو — ليست معرفة فريق.
    facts.push({ id: `entity:${en.handle}`, kind: 'entity', visibility: 'readable', title: en.label, text: en.descriptors.join(' · '), clock: null, ownerSpec: null, team: 'none' });
  }

  const checkable: CheckableRule[] = [
    ...(input.connectionsEnabled ? [{ kind: 'connection' } as const] : []),
    ...input.challengeCodes.map((code) => ({ kind: 'challenge', code }) as const),
  ];
  return {
    caseId: input.caseId,
    facts,
    entities,
    relationships: input.validatedConnections.map((c) => ({ meaning: c.meaning })),
    tools: input.tools,
    checkable,
  } as unknown as AuthorizedKnowledge;
}

/**
 * منظور المعرفة لمحرك الروابط: عقدة "معروفة" فقط إذا أملك محتواها.
 *   evidence → دليل مقروء لي (restricted لا يكفي — هو عنوان فقط)
 *   object/location → عنصر مكتشف لي أو مشترك
 *   entity → مقبض كيان مكتسب لي
 *   event/claim/question/hypothesis → غير مُنمذج بعد → غير معروف (مغلق)
 */
export function knowledgeView(k: AuthorizedKnowledge): KnowledgeView {
  const readable = new Set(k.facts.filter((f) => f.visibility === 'readable').map((f) => f.id));
  return {
    knows(node: NodeRef): boolean {
      const id = node.id.trim().toUpperCase();
      switch (node.kind) {
        case 'evidence':
          return readable.has(`evidence:${id}`);
        case 'object':
        case 'location':
          return readable.has(`object:${id}`);
        case 'entity':
          return k.entities.some((e) => e.handle === node.id);
        default:
          return false;
      }
    },
  };
}

/** مصدر المعرفة — كل قراءة مقيدة باللاعب المستدعي (عميل المستخدم). */
export interface AuthorizedKnowledgeSource {
  isMember(sessionId: string): Promise<boolean>;
  caseIdOf(sessionId: string): Promise<string | null>;
  /** سياسة عقد القضية للدليل غير المقروء. */
  restrictedEvidence(caseId: string): RestrictedEvidencePolicy;
  evidenceIndex(sessionId: string): Promise<EvidenceRow[]>;
  objectIndex(sessionId: string): Promise<ObjectRow[]>;
  subjects(sessionId: string): Promise<SubjectRow[]>;
  interrogationLog(sessionId: string): Promise<LogRow[]>;
  /** روابط الفريق المثبتة (بعد sql/027) — ruleId للسيرفر فقط؛ قبلها []. */
  validatedConnections(sessionId: string): Promise<{ ruleId: string; meaning: string }[]>;
  interrogationLayers(sessionId: string): Promise<{ character: string; layer: number }[]>;
  /** كيانات القضية المكتوبة + مولّد المقبض (سيرفر فقط)؛ null = لا كيانات بعد. */
  entities(caseId: string, sessionId: string): { authored: readonly AuthoredEntity[]; handleOf: (id: string) => string } | null;
  tools(sessionId: string): Promise<string[]>;
  challengeCodes(sessionId: string): Promise<string[]>;
  /** أكواد مقروءة لكل عضو (من صفوف اللاعب نفسه + توزيع القضية بالسيرفر). */
  teamReadableEvidence?(caseId: string, evidence: readonly EvidenceRow[]): readonly string[];
  /** قراءة المحرك (037) للاعب — null قبل تطبيقه أو عند تعطيله بعقد القضية. */
  runtime?(sessionId: string, caseId: string): Promise<RuntimeKnowledgeInput | null>;
}

/** يبني المعرفة المصرّح بها لجلسة — العضوية أولاً، وإلا خطأ ولا بيانات. */
export async function loadAuthorizedKnowledge(
  sessionId: string,
  source: AuthorizedKnowledgeSource,
  opts: { connectionsEnabled: boolean },
): Promise<AuthorizedKnowledge> {
  if (!(await source.isMember(sessionId))) throw new Error('NOT_A_MEMBER');
  const caseId = await source.caseIdOf(sessionId);
  if (!caseId) throw new Error('NOT_A_MEMBER');
  const [evidence, objects, subjects, log, validatedConnections, interrogationLayers, tools, challengeCodes, runtime] = await Promise.all([
    source.evidenceIndex(sessionId),
    source.objectIndex(sessionId),
    source.subjects(sessionId),
    source.interrogationLog(sessionId),
    source.validatedConnections(sessionId),
    source.interrogationLayers(sessionId),
    source.tools(sessionId),
    source.challengeCodes(sessionId),
    source.runtime ? source.runtime(sessionId, caseId) : Promise.resolve(null),
  ]);
  return buildAuthorizedKnowledge({
    caseId,
    restrictedEvidence: source.restrictedEvidence(caseId),
    evidence,
    objects,
    subjects,
    log,
    validatedConnections,
    interrogationLayers,
    entities: source.entities(caseId, sessionId) ?? undefined,
    tools,
    challengeCodes,
    connectionsEnabled: opts.connectionsEnabled,
    teamReadableEvidence: source.teamReadableEvidence?.(caseId, evidence) ?? [],
    runtime,
  });
}
