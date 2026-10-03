// ============================================================
// src/server/cases/devSession.ts
// سيرفر فقط. حارس "جلسة تطوير" لقضية قيد التطوير (مثل المشهد 17).
//
// لماذا: create_session (sql/002) يتطلب entitlement دائماً، وقضية قيد
// التطوير لا تملك مسار شراء/استحقاق. منح entitlement دائم لاختبار محلي
// مرفوض. البديل الأضيق: مسار تطوير محلي فقط يُنشئ الجلسة + عضوية
// المضيف بنفس شكل create_session، بلا أي entitlement ولا تعديل عليها.
//
// الحارس (كل الشروط معاً، وإلا "غير موجود"):
//   • NODE_ENV === 'development' فقط (next dev) — لا IFADA_DEV_CASES،
//     ولا أي بيئة منشورة. next build/start = production دائماً.
//   • عقد القضية مسجّل وحالته 'development' — قضية playable (غرفة 714)
//     لا تمر من هنا أبداً، فلا تجاوز لاستحقاق قضية حقيقية.
//   • تخصص صالح من القائمة العامة.
//   • مستخدم مصادق (يُفحص بالمسار قبل أي عميل service role).
// ما بعد الإنشاء كله المسار العادي: join_session برمز الغرفة،
// start_session من المضيف، و035 يوزّع القنوات عند lobby → active.
// ============================================================
import { getCaseContract } from '@/cases/registry';
import { SPECIALIZATIONS, type Specialization } from '@/types/database';

export type DevSessionGuard =
  | { ok: true; caseId: string; specialization: Specialization }
  | { ok: false; status: 404 | 400 };

export function devSessionGuard(input: { nodeEnv: string | undefined; caseId: unknown; specialization: unknown }): DevSessionGuard {
  if (input.nodeEnv !== 'development') return { ok: false, status: 404 };
  if (typeof input.caseId !== 'string') return { ok: false, status: 404 };
  const contract = getCaseContract(input.caseId);
  if (!contract || contract.status !== 'development') return { ok: false, status: 404 };
  const spec = SPECIALIZATIONS.find((s) => s.id === input.specialization)?.id;
  if (!spec) return { ok: false, status: 400 };
  return { ok: true, caseId: contract.id, specialization: spec };
}

/** نفس أبجدية create_session (بلا O/0/I/1) ونفس الطول. */
export const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newSessionCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) code += SESSION_CODE_ALPHABET[Math.floor(random() * SESSION_CODE_ALPHABET.length)];
  return code;
}
