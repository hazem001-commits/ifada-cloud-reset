// ============================================================
// src/app/case/[code]/board/jointModel.ts
// الربط المشترك (sql/033، حي) — دوال نقية فوق العرض المقنَّع joint_proposals.
//
// ما يصل للعميل هو ما يقرّر السيرفر إظهاره فقط: لكل مساهمة صاحبها، وهل
// هي لي، ومرجعها فقط إن كان الفريق يعرف بوجود المادة أصلاً (أو كانت لي).
// لا نصوص، لا عناوين من السيرفر، لا تقدّم نحو قاعدة. العنوان — إن ظهر —
// يُقرأ من بيانات هذا اللاعب المصرّح بها (resolveMaterial)، كبقية اللوحة.
// ============================================================
import { canReason, resolveMaterial, type MaterialKind, type MaterialView, type ViewerCatalog } from './boardModel';

export interface JointRef {
  kind: MaterialKind;
  id: string;
}
export interface JointContribution {
  contributor: string;
  mine: boolean;
  /** null = مادة لا يعرف الفريق بوجودها — تُعرض كمساهمة من زميل فقط. */
  ref: JointRef | null;
}
export interface JointProposal {
  id: string;
  createdBy: string | null;
  status: 'open' | 'validated';
  meaning: string | null;
  contributions: JointContribution[];
}

const KINDS: readonly MaterialKind[] = ['evidence', 'object', 'location'];
const CODE_RE = /^[A-Z0-9_:-]{1,64}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function decodeRef(v: unknown): JointRef | null {
  if (!isObj(v)) return null;
  const kind = v.kind as MaterialKind;
  const id = typeof v.id === 'string' ? v.id : '';
  return KINDS.includes(kind) && CODE_RE.test(id) ? { kind, id } : null;
}

/**
 * يقرأ رد joint_proposals بحذر: أي حقل غير متوقع يُسقط، وأي شكل مجهول
 * يُرفض (مغلق). المغلقة لا تصل أصلاً من السيرفر؛ ونُسقطها هنا احتياطاً.
 */
export function decodeJointProposals(data: unknown): JointProposal[] {
  if (!Array.isArray(data)) return [];
  const out: JointProposal[] = [];
  for (const p of data) {
    if (!isObj(p) || typeof p.id !== 'string') continue;
    if (p.status !== 'open' && p.status !== 'validated') continue;
    const contributions: JointContribution[] = [];
    for (const c of Array.isArray(p.contributions) ? p.contributions : []) {
      if (!isObj(c) || typeof c.contributor !== 'string') continue;
      contributions.push({ contributor: c.contributor, mine: c.mine === true, ref: decodeRef(c.ref) });
    }
    out.push({
      id: p.id,
      createdBy: typeof p.created_by === 'string' ? p.created_by : null,
      status: p.status,
      meaning: p.status === 'validated' && typeof p.meaning === 'string' ? p.meaning : null,
      contributions,
    });
  }
  return out;
}

/** المقترحات المفتوحة فقط هي مساحة البناء النشطة (المثبتة تذهب لسجل الروابط). */
export const openProposals = (ps: readonly JointProposal[]) => ps.filter((p) => p.status === 'open');

/** أحدث مقترح مفتوح — تُضاف إليه المساهمة الجديدة (السيرفر يرتّبها بالإنشاء). */
export const activeProposal = (ps: readonly JointProposal[]): JointProposal | null => openProposals(ps).at(-1) ?? null;

export const isParticipant = (p: JointProposal, myId: string) => p.createdBy === myId || p.contributions.some((c) => c.mine);

/** الاختبار: من المشاركين، وعند مساهمتين حيّتين على الأقل. لا اختبار تلقائي أبداً. */
export const canTestJoint = (p: JointProposal, myId: string) => p.status === 'open' && isParticipant(p, myId) && p.contributions.length >= 2;

/**
 * هل أساهم بهذه المادة؟ فقط ما أقرؤه أنا (العنوان وحده لا يكفي) — نفس
 * قاعدة canReason؛ والسيرفر يتحقق من جديد (_connection_node_known).
 */
export function canContribute(view: MaterialView | null): view is MaterialView {
  return !!view && canReason(view);
}

export function alreadyMine(p: JointProposal | null, ref: JointRef): boolean {
  return !!p && p.contributions.some((c) => c.mine && c.ref?.kind === ref.kind && c.ref.id === ref.id);
}

export interface ContributionLabel {
  /** السطر الرئيسي: عنوان المادة إن كان مسموحاً لي رؤيته، وإلا «مساهمة من زميل». */
  primary: string;
  /** من ساهم — اسم بشري، لا تخصص ولا متطلبات. */
  by: string;
  mine: boolean;
}

/**
 * عرض مساهمة لهذا اللاعب. مساهمتي: عنوانها من بياناتي. مساهمة زميل:
 * العنوان فقط إن أرسل السيرفر مرجعها (الفريق يعرف بوجودها) وأستطيع أنا
 * حلّها من بياناتي المصرّح بها؛ وإلا «مساهمة من زميل» — بلا عنوان ولا نوع.
 */
export function contributionLabel(c: JointContribution, cat: ViewerCatalog, nameOf: (userId: string) => string | null): ContributionLabel {
  const view = c.ref ? resolveMaterial({ kind: c.ref.kind, code: c.ref.id }, cat) : null;
  if (c.mine) return { primary: view?.title ?? 'مادة ساهمتَ بها', by: 'مساهمتك', mine: true };
  const name = nameOf(c.contributor);
  return { primary: view?.title ?? 'مساهمة من زميل', by: name ? `مساهمة من ${name}` : 'مساهمة من زميل', mine: false };
}
