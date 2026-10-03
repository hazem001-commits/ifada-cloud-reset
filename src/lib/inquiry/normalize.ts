// ============================================================
// src/lib/inquiry/normalize.ts
// تطبيع عربي/لاتيني ثابت للبحث — بلا نموذج لغوي.
// توحيد الهمزات والياء والتاء المربوطة، حذف التشكيل والتطويل،
// أرقام هندية ← لاتينية، وحذف كلمات السؤال العامية ("وين انذكر"،
// "شو عنا عن"…) حتى يبقى موضوع البحث نفسه.
// ============================================================

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const PUNCT = /[^\p{L}\p{N}\s]/gu;

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// كلمات سؤال/ربط لا تحمل موضوع البحث (بصيغتها المطبّعة).
const STOPWORDS = new Set(
  [
    'وين', 'فين', 'اين', 'شو', 'ايش', 'اش', 'ماذا', 'ما', 'مين', 'من', 'متى', 'كيف', 'ليش', 'هل',
    'عنا', 'عندنا', 'عن', 'على', 'في', 'فيه', 'فيها', 'الى', 'إلى', 'لل', 'مع', 'او', 'و', 'يا',
    'انذكر', 'اتذكر', 'ذكر', 'انذكرت', 'ذكرت', 'مذكور', 'مذكوره', 'شفنا', 'شفت', 'شاف', 'لقينا',
    'اسم', 'بدي', 'بدنا', 'اعرف', 'نعرف', 'بنعرف', 'منعرف', 'ابحث', 'دور', 'دورلي', 'فتش',
    'اعطيني', 'اعطني', 'قلي', 'قللي', 'قول', 'خبرني', 'بخصوص', 'حول', 'موضوع', 'شي', 'اشي', 'شيء',
    'هاد', 'هذا', 'هذه', 'هاي', 'هيك', 'كل', 'اي', 'اللي', 'يلي', 'الذي', 'التي', 'هو', 'هي',
    'انا', 'احنا', 'نحن', 'لقد', 'قد', 'كان', 'كانت', 'بعد', 'قبل', 'the', 'a', 'an', 'of', 'about',
  ].map((w) => normalize(w)),
);

const PREFIXES = ['وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و', 'ب', 'ل', 'ف'];

/** صيغ مطابقة لكلمة: كما هي، وبدون سوابق الربط/التعريف الشائعة. */
export function variants(token: string): string[] {
  const out = new Set<string>([token]);
  for (const p of PREFIXES) {
    if (token.startsWith(p) && token.length - p.length >= 3) out.add(token.slice(p.length));
  }
  return [...out];
}

/** موضوع البحث: كلمات المعنى فقط، بترتيبها، بدون تكرار. */
export function queryTerms(text: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const t of normalize(text).split(' ')) {
    // حرفان عربيان يطابقان كل شي تقريباً؛ الرموز اللاتينية/الأرقام (M1) تكفيها حرفان.
    const min = /[a-z0-9]/.test(t) ? 2 : 3;
    if (t.length < min || STOPWORDS.has(t) || seen.has(t)) continue;
    seen.add(t);
    terms.push(t);
  }
  return terms.slice(0, 6);
}

/** يطابق كلمة بحث داخل نص مطبّع (مع سوابقها). */
export function containsTerm(normalizedText: string, term: string): boolean {
  return variants(term).some((v) => normalizedText.includes(v));
}
