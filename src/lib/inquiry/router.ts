// ============================================================
// src/lib/inquiry/router.ts
// موجّه النية — محدود بصرامة، مش وكيل.
//
// 1) قواعد ثابتة أولاً (0 نداء نموذج للحالات الشائعة):
//    طلب حسم القضية → حارس | مقارنة مصادر → غير متاحة بعد |
//    سؤال بحث ("وين انذكر…"، "شو عنا عن…") → بحث | كلمات أداة → أداة.
// 2) غير ذلك فقط: نداء نموذج واحد بمخرج JSON صارم، يُتحقق منه هنا:
//    نية من قائمة مغلقة، أداة من قائمة السماح المبنية لهذا الطلب،
//    وأي شي خارجها يُرفض. النموذج لا يرى أي محتوى من القضية.
// ============================================================

import type { InquiryTool } from './types';
import { normalize, queryTerms } from './normalize';

export type RouteDecision =
  | { kind: 'search'; terms: string[]; by: 'rules' | 'model' }
  | { kind: 'tool'; tool: Exclude<InquiryTool, 'CASE_SEARCH'> }
  | { kind: 'compare' }
  | { kind: 'solve' }
  | { kind: 'unsupported' }
  | { kind: 'ambiguous' }
  | { kind: 'unknown' };

export const ALL_TOOLS: readonly InquiryTool[] = [
  'CASE_SEARCH',
  'ACCESS_LOG',
  'CCTV',
  'RECORDS',
  'DEVICE_INVESTIGATION',
  'INTERROGATION',
];

const has = (padded: string, phrase: string) => padded.includes(` ${normalize(phrase)} `);
const anyOf = (padded: string, phrases: string[]) => phrases.some((p) => has(padded, p));

// طلب "حسم" القضية — التحقيق لا يجيب عنه أبداً.
const SOLVE = [
  'القاتل', 'قاتل', 'المجرم', 'الجاني', 'الفاعل', 'المذنب', 'مين قتل', 'مين قتله', 'مين عملها',
  'مين عمله', 'حل القضيه', 'اعطيني الحل', 'شو الحل', 'مين المسوول', 'مين السبب', 'مين المتهم',
];
const COMPARE = [
  'قارن', 'قارنلي', 'قارني', 'نقارن', 'مقارنه', 'قابل بين', 'طابق', 'طابقلي', 'تناقض', 'يتناقض',
  'بيتناقض', 'تناقضات', 'نفس كلام',
];
const SEARCH_LEADS = [
  'وين انذكر', 'وين ذكر', 'وين انذكرت', 'وين شفنا', 'وين شفت', 'وين لقينا', 'وين ورد', 'وين مكتوب',
  'شو عنا', 'ايش عنا', 'شو عندنا', 'شو في عن', 'شو بنعرف', 'شو منعرف', 'ابحث', 'دور على', 'دورلي',
  'فتش عن', 'مين هو', 'مين هي', 'find', 'search',
];
const TOOL_WORDS: [Exclude<InquiryTool, 'CASE_SEARCH'>, string[]][] = [
  ['ACCESS_LOG', ['دخل', 'دخلت', 'فات', 'فاتت', 'خرج', 'طلع من الغرفه', 'فتح الباب', 'فتح الغرفه', 'بطاقه', 'بطاقات', 'سجل الدخول', 'سجل الابواب', 'سجل البطاقات']],
  ['CCTV', ['كاميرا', 'كاميرات', 'الكاميرا', 'الكاميرات', 'المراقبه', 'تسجيلات المراقبه', 'لقطه', 'لقطات', 'شريط المراقبه']],
  ['RECORDS', ['نزيل', 'النزيل', 'النزلاء', 'سجلات النزلاء', 'ملف النزيل', 'حجز', 'الحجز']],
  ['INTERROGATION', ['استجوب', 'استجواب', 'نستجوب', 'بدي اسال', 'حقق مع', 'نحقق مع']],
];
const DEVICE_NOUNS = ['لابتوب', 'اللابتوب', 'الجهاز', 'جهاز', 'ملفات الجهاز'];
const DEVICE_VERBS = ['افحص', 'نفحص', 'استخرج', 'نستخرج', 'حلل', 'ادخل على', 'شغل', 'افتح ملفات'];

/** تصنيف ثابت. ambiguous = يستحق نداء نموذج واحد. */
export function routeByRules(text: string): RouteDecision {
  const padded = ` ${normalize(text)} `;
  if (padded.trim() === '') return { kind: 'unknown' };

  if (anyOf(padded, SOLVE)) return { kind: 'solve' };
  if (anyOf(padded, COMPARE)) return { kind: 'compare' };

  if (anyOf(padded, SEARCH_LEADS)) {
    const terms = queryTerms(text);
    return terms.length > 0 ? { kind: 'search', terms, by: 'rules' } : { kind: 'unknown' };
  }

  const tools = TOOL_WORDS.filter(([, words]) => anyOf(padded, words)).map(([tool]) => tool);
  if (anyOf(padded, DEVICE_NOUNS) && anyOf(padded, DEVICE_VERBS)) tools.push('DEVICE_INVESTIGATION');
  if (tools.length === 1 && tools[0]) return { kind: 'tool', tool: tools[0] };
  if (tools.length > 1) return { kind: 'ambiguous' };

  // عبارة اسمية قصيرة ("اللابتوب؟"، "Master Key") = بحث مباشر.
  const terms = queryTerms(text);
  if (terms.length >= 1 && terms.length <= 3) return { kind: 'search', terms, by: 'rules' };
  return { kind: 'ambiguous' };
}

// ------------------------------------------------------------
// النموذج: مدخل محدود، مخرج مُتحقق منه
// ------------------------------------------------------------
const TOOL_HELP: Record<InquiryTool, string> = {
  CASE_SEARCH: 'search the case material the player can already read (names, words, objects, documents)',
  ACCESS_LOG: 'door/key-card access log: who opened a door and when',
  CCTV: 'security camera archive: search footage by camera and time window',
  RECORDS: 'hotel guest records lookup by guest name or room number',
  DEVICE_INVESTIGATION: 'forensic examination of a device (e.g. a laptop) and its files',
  INTERROGATION: 'question a person involved in the case',
};

export function buildRouterMessages(text: string, allowed: readonly InquiryTool[], specs: readonly string[]) {
  const menu = allowed.map((t) => `- ${t}: ${TOOL_HELP[t]}`).join('\n');
  const system = [
    'You route requests typed by a player in a cooperative detective game. The request is usually Levantine Arabic.',
    'You know NOTHING about the case. Never answer the question, never name suspects, never state or guess facts.',
    'Choose how the request should be handled and reply with ONE JSON object only, no prose, no markdown:',
    '{"intent":"search"|"tool"|"unsupported"|"unknown","tool":<tool name or null>,"query":<search keywords or null>,"confidence":<0..1>}',
    'Rules:',
    '- "search": the player wants to find where something/someone appears in material. tool = "CASE_SEARCH"; query = 1-4 keywords copied from the request (names, objects, terms), no question words.',
    '- "tool": an investigative tool below can help the player check it themselves. tool = one name from the list; query = null.',
    '- "unsupported": comparing sources, deciding guilt, or anything the listed tools cannot do.',
    '- "unknown": unclear request.',
    `Available tools (the ONLY valid tool names):\n${menu}`,
    `Player specializations: ${specs.join(', ') || 'none'}.`,
  ].join('\n');
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: `REQUEST:\n${text.slice(0, 300)}` },
  ];
}

/** يستخرج أول كائن JSON من رد النموذج (بعد حذف أي تفكير ظاهر). */
export function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

const MIN_CONFIDENCE = 0.55;

/**
 * التحقق الصارم من قرار النموذج. أي أداة خارج قائمة السماح لهذا الطلب،
 * أو نية غير معروفة، أو ثقة منخفضة، أو أنواع خاطئة → unknown.
 * أي مفاتيح إضافية (مثل "answer" أو "sources") تُهمل ولا تُستخدم أبداً.
 */
export function validateModelDecision(value: unknown, allowed: readonly InquiryTool[]): RouteDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'unknown' };
  const v = value as Record<string, unknown>;
  const { intent, tool, query, confidence } = v;

  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < MIN_CONFIDENCE || confidence > 1) {
    return { kind: 'unknown' };
  }
  if (tool !== null && tool !== undefined && (typeof tool !== 'string' || !allowed.includes(tool as InquiryTool))) {
    return { kind: 'unknown' };
  }

  switch (intent) {
    case 'search': {
      if (tool !== 'CASE_SEARCH' && tool !== null && tool !== undefined) return { kind: 'unknown' };
      if (typeof query !== 'string' || query.length > 80) return { kind: 'unknown' };
      const terms = queryTerms(query);
      return terms.length > 0 ? { kind: 'search', terms, by: 'model' } : { kind: 'unknown' };
    }
    case 'tool':
      if (typeof tool !== 'string' || tool === 'CASE_SEARCH') return { kind: 'unknown' };
      return { kind: 'tool', tool: tool as Exclude<InquiryTool, 'CASE_SEARCH'> };
    case 'unsupported':
      return { kind: 'unsupported' };
    default:
      return { kind: 'unknown' };
  }
}
