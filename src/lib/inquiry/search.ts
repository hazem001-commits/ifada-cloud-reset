// ============================================================
// src/lib/inquiry/search.ts
// بحث ثابت (بلا نموذج لغوي) في مواد القضية المصرّح بها للاعب فقط.
//
// المدخلات: صفوف رجعت أصلاً من المسار الموثوق وبجلسة اللاعب نفسه
// (evidence_index، investigation_object_index، interrogation_subjects،
// محضر الاستجواب عبر RLS). هذا الملف لا يوسّع أي صلاحية — بالعكس،
// يضيّقها أكثر لقاعدة الخصوصية:
//   • عناصر التحقيق: فقط ما اكتشفته أنا أو شُورك مع الفريق — نفس ما
//     يدخل ملف القضية. عنصر محجوب عني (اكتشاف خاص لزميل: HIDDEN) وعنصر
//     لم يُفحص بعد يتطابقان تماماً: كلاهما غير موجود بالبحث. لو كان غير
//     المفحوص قابلاً للبحث، لكان اختفاؤه وحده إشارة لاكتشاف خاص.
//   • نص دليل لا أملك تخصصه (readable = false) → لا يُبحث فيه أبداً؛
//     عنوانه فقط (نفس ما يعرضه ملف القضية لكل الأعضاء).
// ============================================================

import type { Specialization } from '@/types/database';
import type { Epistemic, OpenTarget, SearchResult, SourceRef } from './types';
import { containsTerm, normalize } from './normalize';
import { evidenceVisibility, type RestrictedEvidencePolicy } from '../evidenceVisibility';

export interface EvidenceRow {
  code: string;
  title: string;
  kind: string;
  owner_spec: Specialization | null;
  clock_label: string | null;
  body: string | null;
  readable: boolean;
}

export interface ObjectRow {
  code: string;
  category: string;
  parent_code: string | null;
  title: string;
  description: string;
  state: string;
  discovered: boolean;
  is_shared: boolean;
}

export interface SubjectRow {
  code: string;
  name: string;
  role: string | null;
}

export interface LogRow {
  id: string;
  character_code: string;
  speaker: string;
  content: string;
}

export interface CorpusInput {
  evidence: EvidenceRow[];
  objects: ObjectRow[];
  subjects: SubjectRow[];
  log: LogRow[];
}

interface Doc {
  ref: SourceRef;
  title: string;
  body: string | null;
  nTitle: string;
  nBody: string;
  sourceLabel: string;
  epistemic: Epistemic;
  clock: string | null;
  access: 'full' | 'title';
  ownerSpec: Specialization | null;
  open: OpenTarget | null;
}

export type Corpus = Doc[];

const EVIDENCE_LABEL: Record<string, string> = {
  document: 'وثيقة',
  photo: 'صورة',
  audio: 'تسجيل صوتي',
  video: 'تسجيل مصوّر',
  record: 'سجل',
  testimony: 'إفادة',
};

const OBJECT_LABEL: Record<string, string> = {
  object: 'أثر في الموقع',
  device: 'جهاز في الموقع',
  access: 'نظام دخول',
  archive: 'أرشيف',
};

/** مرئي لي كمادة: اكتشافي أو مشترك — لا المحجوب (إشارة زميل). */
function isMineOrShared(o: ObjectRow): boolean {
  return o.discovered && o.state !== 'HIDDEN';
}

function doc(d: Omit<Doc, 'nTitle' | 'nBody'>): Doc {
  return { ...d, nTitle: normalize(d.title), nBody: d.body ? normalize(d.body) : '' };
}

/**
 * policy = سياسة القضية للدليل غير المقروء (عقد القضية). نفس القاعدة
 * المشتركة مع عقد الذكاء الاصطناعي: المخفي لا يدخل الفهرس إطلاقاً.
 */
export function buildCorpus(input: CorpusInput, policy: RestrictedEvidencePolicy): Corpus {
  const corpus: Corpus = [];

  // ---------- الأدلة المفتوحة بالجلسة ----------
  for (const e of input.evidence) {
    const visibility = evidenceVisibility(e, policy);
    if (!visibility) continue; // مخفي: لا مطابقة ولا عنوان ولا أي أثر
    const readable = visibility === 'readable';
    corpus.push(
      doc({
        ref: { type: 'evidence', code: e.code },
        title: e.title,
        body: readable ? e.body : null,
        sourceLabel: EVIDENCE_LABEL[e.kind] ?? 'مادة',
        epistemic: e.kind === 'testimony' ? 'claim' : 'source',
        clock: e.clock_label,
        access: readable ? 'full' : 'title',
        ownerSpec: readable ? null : e.owner_spec,
        open: readable ? { kind: 'evidence', code: e.code } : null,
      }),
    );
  }

  // ---------- عناصر التحقيق (قاعدة الخصوصية) ----------
  const byCode = new Map(input.objects.map((o) => [o.code, o]));
  const locationOf = (o: ObjectRow): string | null => {
    let p = o.parent_code ? byCode.get(o.parent_code) : undefined;
    for (let depth = 0; p && depth < 8; depth += 1) {
      if (p.category === 'location') return p.code;
      p = p.parent_code ? byCode.get(p.parent_code) : undefined;
    }
    return null;
  };
  for (const o of input.objects) {
    if (o.category === 'location' || !isMineOrShared(o)) continue;
    corpus.push(
      doc({
        ref: { type: 'object', code: o.code },
        title: o.title,
        body: o.description ? o.description : null,
        sourceLabel: `${OBJECT_LABEL[o.category] ?? 'عنصر في الموقع'}${o.is_shared ? '' : ' · اكتشافك الخاص'}`,
        epistemic: 'source',
        clock: null,
        access: 'full',
        ownerSpec: null,
        open: { kind: 'object', code: o.code, location: locationOf(o) },
      }),
    );
  }

  // ---------- أشخاص قابلون للاستجواب (قائمة عامة لكل الأعضاء) ----------
  const subjectName = new Map(input.subjects.map((s) => [s.code, s.name]));
  for (const s of input.subjects) {
    corpus.push(
      doc({
        ref: { type: 'subject', code: s.code },
        title: s.name,
        body: s.role,
        sourceLabel: 'شخص قابل للاستجواب',
        epistemic: 'source',
        clock: null,
        access: 'full',
        ownerSpec: null,
        open: { kind: 'tab', tab: 'interrogation' },
      }),
    );
  }

  // ---------- محضر الاستجواب: أقوال الشخصيات فقط (ادعاءات) ----------
  for (const l of input.log) {
    if (l.speaker !== 'character') continue;
    const name = subjectName.get(l.character_code) ?? 'شخص';
    corpus.push(
      doc({
        ref: { type: 'interrogation', code: l.id },
        title: `أقوال ${name} في الاستجواب`,
        body: l.content,
        sourceLabel: 'محضر استجواب',
        epistemic: 'claim',
        clock: null,
        access: 'full',
        ownerSpec: null,
        open: { kind: 'tab', tab: 'interrogation' },
      }),
    );
  }

  return corpus;
}

/** مقتطف حرفي: أول سطر يحوي كلمة بحث، مقصوص حول موضعها. */
function excerptOf(body: string, terms: string[]): string {
  const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const hit = lines.find((l) => terms.some((t) => containsTerm(normalize(l), t))) ?? lines[0] ?? '';
  if (hit.length <= 200) return hit;
  const n = normalize(hit);
  const idx = terms.map((t) => n.indexOf(t)).find((i) => i >= 0) ?? 0;
  const at = Math.floor((idx / Math.max(1, n.length)) * hit.length);
  const start = Math.max(0, at - 70);
  return `${start > 0 ? '…' : ''}${hit.slice(start, start + 180).trim()}…`;
}

export const MAX_RESULTS = 8;

export function searchCorpus(corpus: Corpus, terms: string[]): SearchResult[] {
  if (terms.length === 0) return [];
  const need = terms.length <= 2 ? terms.length : Math.ceil(terms.length * 0.6);

  const scored: { d: Doc; score: number; i: number }[] = [];
  corpus.forEach((d, i) => {
    let matched = 0;
    let weight = 0;
    for (const t of terms) {
      const inTitle = containsTerm(d.nTitle, t);
      const inBody = d.nBody !== '' && containsTerm(d.nBody, t);
      if (inTitle || inBody) matched += 1;
      weight += (inTitle ? 3 : 0) + (inBody ? 1 : 0);
    }
    if (matched >= need) scored.push({ d, score: matched * 10 + weight, i });
  });

  scored.sort((a, b) => b.score - a.score || a.i - b.i);

  return scored.slice(0, MAX_RESULTS).map(({ d }) => ({
    ref: d.ref,
    title: d.title,
    sourceLabel: d.sourceLabel,
    epistemic: d.epistemic,
    excerpt: d.body ? excerptOf(d.body, terms) : null,
    clock: d.clock,
    access: d.access,
    ownerSpec: d.ownerSpec,
    open: d.open,
  }));
}

/**
 * بوابة المراجع: نتيجة تُعرض فقط إذا مرجعها موجود فعلاً بمواد اللاعب
 * الحالية (نفس النوع والرمز)، وإجراء الفتح يطابق صلاحيته. أي مرجع
 * مختلق أو قديم (صار محجوباً/لم يعد موجوداً) يسقط.
 */
export function verifyResults(results: SearchResult[], corpus: Corpus): SearchResult[] {
  const known = new Map(corpus.map((d) => [`${d.ref.type}:${d.ref.code}`, d]));
  return results.filter((r) => {
    const d = known.get(`${r.ref.type}:${r.ref.code}`);
    if (!d) return false;
    if (r.open?.kind === 'evidence' && d.open?.kind !== 'evidence') return false;
    if (r.access === 'full' && d.access !== 'full') return false;
    if (d.access === 'title' && r.excerpt !== null) return false;
    return true;
  });
}
