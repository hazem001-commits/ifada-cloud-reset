// ============================================================
// src/lib/inquiry/runInquiry.ts
// "اسأل التحقيق" — تنسيق طلب واحد. كل مصادر البيانات والنموذج
// تُحقن (deps) حتى تُختبر حدود الصلاحية والخصوصية بدون قاعدة بيانات.
//
// الترتيب ثابت: مدخل صالح ← هوية ← عضوية ← قرار توجيه (قواعد،
// وإلا نداء نموذج واحد كحد أقصى) ← تنفيذ على مواد اللاعب فقط ←
// بوابة المراجع. لا حلقة وكيل، لا تنفيذ أداة تلقائياً، لا ذاكرة.
// ============================================================

import type { Specialization } from '@/types/database';
import type { InquiryResponse, InquiryTool } from './types';
import { buildCorpus, searchCorpus, verifyResults, type EvidenceRow, type LogRow, type ObjectRow, type SubjectRow } from './search';
import type { RestrictedEvidencePolicy } from '../evidenceVisibility';
import { buildRouterMessages, extractJson, routeByRules, validateModelDecision, type RouteDecision } from './router';
import { allowedTools, resolveTool, type MyChallengeRow, type ToolCatalog } from './tools';

export interface RouterMessage {
  role: 'system' | 'user';
  content: string;
}

export interface InquiryDeps {
  getUserId(): Promise<string | null>;
  isMember(sessionId: string): Promise<boolean>;
  mySpecializations(sessionId: string): Promise<Specialization[]>;
  evidenceIndex(sessionId: string): Promise<EvidenceRow[]>;
  objectIndex(sessionId: string): Promise<ObjectRow[]>;
  subjects(sessionId: string): Promise<SubjectRow[]>;
  interrogationLog(sessionId: string): Promise<LogRow[]>;
  myChallenges(sessionId: string): Promise<MyChallengeRow[]>;
  /** سيرفر فقط: سياسة القضية للدليل غير المقروء (عقد القضية) — بعد تأكيد العضوية. */
  evidencePolicy(sessionId: string): Promise<RestrictedEvidencePolicy>;
  /** سيرفر فقط: أين تعيش الأدوات بهذه القضية (بلا أعمدة حل). */
  toolCatalog(sessionId: string): Promise<ToolCatalog>;
  /** نداء نموذج واحد، يرجع النص الخام (أو null عند الفشل). null = لا مزوّد. */
  classify: ((messages: RouterMessage[]) => Promise<string | null>) | null;
}

export interface InquiryOutcome {
  status: number;
  body: InquiryResponse | { error: string };
  /** للاختبار والمراقبة: عدد نداءات النموذج لهذا الطلب (0 أو 1). */
  modelCalls: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_TEXT = 300;

const GUARD =
  'التحقيق ما بيحسم القضية عنك. بيقدر يدلّك وين تدوّر ويعرضلك المصادر المتاحة لك — والاستنتاج بيضل إلك ولفريقك.';
const COMPARE = 'المقارنة بين المصادر لسا مش متاحة كأداة تحقيق. ابحث عن كل مصدر لحاله وقارن بنفسك.';
const UNSUPPORTED = 'هذا الطلب لسا مش متاح كأداة تحقيق.';
const FALLBACK = 'ما قدرنا نحدد شو بدك تفحص. جرّب تسأل عن اسم أو شي محدد بالموقع.';
const EXAMPLES = ['شو عنا عن اللابتوب؟', 'وين انذكر الشباك؟', 'بدي أعرف مين دخل الغرفة'];

export async function runInquiry(input: unknown, deps: InquiryDeps): Promise<InquiryOutcome> {
  const fail = (status: number, error: string): InquiryOutcome => ({ status, body: { error }, modelCalls: 0 });

  const { sessionId, text } = (input ?? {}) as { sessionId?: unknown; text?: unknown };
  if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) return fail(400, 'MISSING_FIELDS');
  if (typeof text !== 'string' || text.trim() === '') return fail(400, 'MISSING_FIELDS');
  if (text.length > MAX_TEXT) return fail(400, 'TEXT_TOO_LONG');

  // ---------- حدود الهوية والجلسة: قبل أي قراءة لمواد القضية ----------
  if (!(await deps.getUserId())) return fail(401, 'AUTH_REQUIRED');
  if (!(await deps.isMember(sessionId))) return fail(403, 'NOT_A_MEMBER');

  const query = text.trim();
  let modelCalls = 0;
  let catalog: ToolCatalog | null = null;
  const getCatalog = async () => (catalog ??= await deps.toolCatalog(sessionId));

  const askModel = async (allowed: readonly InquiryTool[]): Promise<RouteDecision> => {
    if (!deps.classify || modelCalls > 0) return { kind: 'unknown' };
    modelCalls += 1;
    const specs = await deps.mySpecializations(sessionId);
    const raw = await deps.classify(buildRouterMessages(query, allowed, specs));
    return raw ? validateModelDecision(extractJson(raw), allowed) : { kind: 'unknown' };
  };

  let decision = routeByRules(query);
  if (decision.kind === 'ambiguous') decision = await askModel(allowedTools(await getCatalog()));

  const done = (body: InquiryResponse): InquiryOutcome => ({ status: 200, body, modelCalls });

  switch (decision.kind) {
    case 'solve':
      return done({ kind: 'guard', message: GUARD });
    case 'compare':
      return done({ kind: 'unsupported', message: COMPARE });
    case 'unsupported':
      return done({ kind: 'unsupported', message: UNSUPPORTED });
    case 'tool': {
      const [cat, objects, challenges, specs] = await Promise.all([
        getCatalog(),
        deps.objectIndex(sessionId),
        deps.myChallenges(sessionId),
        deps.mySpecializations(sessionId),
      ]);
      return done(resolveTool(decision.tool, { catalog: cat, objects, challenges, specs }));
    }
    case 'search': {
      const [evidence, objects, subjects, log, policy] = await Promise.all([
        deps.evidenceIndex(sessionId),
        deps.objectIndex(sessionId),
        deps.subjects(sessionId),
        deps.interrogationLog(sessionId),
        deps.evidencePolicy(sessionId),
      ]);
      const corpus = buildCorpus({ evidence, objects, subjects, log }, policy);
      let terms = decision.terms;
      let by = decision.by;
      let results = searchCorpus(corpus, terms);

      // لا مطابقة بالكلمات الحرفية: إعادة صياغة واحدة بالنموذج (إن لم يُستدعَ بعد)،
      // ثم بحث محلي مرة أخرى. النموذج يقترح كلمات فقط — النتائج من المواد نفسها.
      if (results.length === 0 && modelCalls === 0) {
        const retry = await askModel(['CASE_SEARCH']);
        if (retry.kind === 'search' && retry.terms.join(' ') !== terms.join(' ')) {
          const again = searchCorpus(corpus, retry.terms);
          if (again.length > 0) {
            terms = retry.terms;
            by = 'model';
            results = again;
          }
        }
      }

      return done({ kind: 'search', interpretation: { terms, by }, results: verifyResults(results, corpus) });
    }
    default:
      return done({ kind: 'fallback', message: FALLBACK, examples: EXAMPLES });
  }
}
