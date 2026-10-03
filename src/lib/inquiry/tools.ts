// ============================================================
// src/lib/inquiry/tools.ts
// قائمة أدوات الموجّه = أدوات حقيقية موجودة فعلاً بهذه القضية فقط،
// مبنية من السيرفر (تعريفات التحديات وأدوات العناصر — بدون أي عمود
// حل). لكل طلب: هل الأداة جاهزة لي؟ أم تحتاج مشاركة / متخصصاً آخر /
// فحص العنصر أولاً؟ — ولا إشارة لعنصر غير ظاهر لي (قاعدة الخصوصية).
// الرسائل ثابتة بالكود — لا يكتبها نموذج لغوي.
// ============================================================

import type { Specialization } from '@/types/database';
import type { InquiryResponse, InquiryTool, OpenTarget, ToolStatus } from './types';
import type { ObjectRow } from './search';

export type ToolKind = Exclude<InquiryTool, 'CASE_SEARCH'>;

/** مكان أداة: العنصر اللي تعيش عليه، ومن يستخدمها، وهل تتطلب مشاركته. */
export interface ToolHost {
  tool: ToolKind;
  objectCode: string;
  spec: Specialization | null;
  requiresShared: boolean;
}

export interface ToolCatalog {
  hosts: ToolHost[];
  interrogation: boolean;
}

/** أداة تحدٍّ حقيقية (input_config.tool) → نوع أداة الموجّه. */
export const CHALLENGE_TOOL: Record<string, ToolKind> = {
  access_log: 'ACCESS_LOG',
  cctv_archive: 'CCTV',
  records_search: 'RECORDS',
};

export interface MyChallengeRow {
  code: string;
  object_code: string;
  input_config: { tool?: string } | null;
}

/** قائمة السماح لهذا الطلب: البحث دائماً + ما هو موجود فعلاً بالقضية. */
export function allowedTools(catalog: ToolCatalog): InquiryTool[] {
  const out: InquiryTool[] = ['CASE_SEARCH'];
  for (const h of catalog.hosts) if (!out.includes(h.tool)) out.push(h.tool);
  if (catalog.interrogation) out.push('INTERROGATION');
  return out;
}

const TOOL_NAME: Record<ToolKind, string> = {
  ACCESS_LOG: 'سجل الدخول',
  CCTV: 'أرشيف كاميرات المراقبة',
  RECORDS: 'سجلات النزلاء',
  DEVICE_INVESTIGATION: 'الفحص الرقمي للجهاز',
  INTERROGATION: 'الاستجواب',
};

const LEAD: Record<ToolKind, string> = {
  ACCESS_LOG: 'سجل الدخول ممكن يساعدك تتحقق من هالسؤال بنفسك.',
  CCTV: 'أرشيف كاميرات المراقبة ممكن يساعدك تتحقق من هالسؤال بنفسك.',
  RECORDS: 'سجلات النزلاء ممكن تساعدك تتحقق من هالسؤال بنفسك.',
  DEVICE_INVESTIGATION: 'الفحص الرقمي للجهاز ممكن يساعدك تتحقق من هالسؤال بنفسك.',
  INTERROGATION: 'الاستجواب ممكن يساعدك تسمع الرواية من صاحبها مباشرة.',
};

const SPECIALIST: Record<Specialization, string> = {
  field: 'المحقق الميداني',
  digital: 'متخصص الأدلة الرقمية',
  forensics: 'متخصص الطب الشرعي',
  records: 'متخصص السجلات',
};

function reply(
  tool: ToolKind,
  status: ToolStatus,
  detail: string,
  open: OpenTarget | null,
  openLabel: string | null,
): Extract<InquiryResponse, { kind: 'tool' }> {
  return { kind: 'tool', tool, status, message: `${LEAD[tool]} ${detail}`.trim(), open, openLabel };
}

export function resolveTool(
  tool: ToolKind,
  ctx: { catalog: ToolCatalog; objects: ObjectRow[]; challenges: MyChallengeRow[]; specs: Specialization[] },
): Extract<InquiryResponse, { kind: 'tool' }> {
  if (tool === 'INTERROGATION') {
    if (!ctx.catalog.interrogation) return unavailable(tool);
    const open: OpenTarget = { kind: 'tab', tab: 'interrogation' };
    return ctx.specs.includes('field')
      ? reply(tool, 'ready', 'الاستجواب متاح لك الآن.', open, 'افتح الاستجواب')
      : reply(tool, 'needs_specialist', `يقوده ${SPECIALIST.field}، وتقدر تتابعه مباشرة.`, open, 'تابع الاستجواب');
  }

  const byCode = new Map(ctx.objects.map((o) => [o.code, o]));
  const locationOf = (o: ObjectRow): string | null => {
    let p = o.parent_code ? byCode.get(o.parent_code) : undefined;
    for (let d = 0; p && d < 8; d += 1) {
      if (p.category === 'location') return p.code;
      p = p.parent_code ? byCode.get(p.parent_code) : undefined;
    }
    return null;
  };
  const known = (o: ObjectRow) => o.discovered && o.state !== 'HIDDEN';
  // قاعدة الخصوصية: اكتشاف خاص لزميل (HIDDEN) يُعامل تماماً كعنصر لم يُفحص —
  // نفس الرد حرفياً، فلا يكشف الرد وجود اكتشاف خاص. والفرع يُشار إليه فقط
  // إن كان أصله موقعاً أو اكتشافاً أعرفه (وإلا فهو غير موجود بالنسبة لي).
  const visible = (o: ObjectRow | undefined): o is ObjectRow => {
    if (!o || o.category === 'location') return false;
    if (known(o)) return true;
    const p = o.parent_code ? byCode.get(o.parent_code) : undefined;
    return !!p && (p.category === 'location' || known(p));
  };
  const target = (o: ObjectRow): OpenTarget => ({ kind: 'object', code: o.code, location: locationOf(o) });

  // جاهزة لي فعلاً: تحدٍّ من نوعها رجع بـ challenge_index الخاص بي.
  const mine = ctx.challenges.find((c) => CHALLENGE_TOOL[c.input_config?.tool ?? ''] === tool);
  const mineHost = mine ? byCode.get(mine.object_code) : undefined;
  if (mine && visible(mineHost)) {
    return reply(tool, 'ready', `الأداة متاحة لك الآن من «${mineHost.title}».`, target(mineHost), `افتح ${mineHost.title}`);
  }

  for (const host of ctx.catalog.hosts.filter((h) => h.tool === tool)) {
    const o = byCode.get(host.objectCode);
    if (!visible(o)) continue;
    const open = target(o);
    const label = `افتح ${o.title}`;
    if (!known(o)) {
      return reply(tool, 'start_with_object', `ابدأ بفحص «${o.title}» — الخطوة التالية تظهر هناك.`, open, label);
    }
    const lacksSpec = host.spec !== null && !ctx.specs.includes(host.spec);
    if (!o.is_shared && (host.requiresShared || lacksSpec)) {
      return reply(tool, 'needs_share', `مرتبطة بـ«${o.title}»، واكتشافه لسا خاص عندك — شاركه مع الفريق ليتمكن المتخصص المناسب من استخدامها.`, open, label);
    }
    if (lacksSpec && host.spec) {
      return reply(tool, 'needs_specialist', `مرتبطة بـ«${o.title}» ويستخدمها ${SPECIALIST[host.spec]} في فريقك.`, open, label);
    }
    if (tool === 'DEVICE_INVESTIGATION') {
      return reply(tool, 'ready', `افتح «${o.title}» — أدوات الفحص تظهر هناك.`, open, label);
    }
    return reply(tool, 'start_with_object', `افتح «${o.title}» لتعرف الخطوة التالية.`, open, label);
  }

  return unavailable(tool);
}

function unavailable(tool: ToolKind): Extract<InquiryResponse, { kind: 'tool' }> {
  return {
    kind: 'tool',
    tool,
    status: 'unavailable',
    message: `ما في ${TOOL_NAME[tool]} متاح لك الآن لهذا السؤال. جرّب البحث في مواد القضية.`,
    open: null,
    openLabel: null,
  };
}
