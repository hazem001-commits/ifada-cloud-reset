// ============================================================
// tests/inquiry/fixtures.ts
// بيانات اختبار تحاكي ما ترجعه RPCs الحقيقية لكل لاعب — بنفس
// قواعدها: evidence_index يحجب body عن غير صاحب التخصص؛
// investigation_object_index يرجع اكتشاف الزميل الخاص كـ HIDDEN
// بلا وصف؛ الفرع يظهر حين يُكتشف أصله. النصوص من بذرة ROOM 714.
// ============================================================

import type { Specialization } from '../../src/types/database';
import type { InquiryDeps } from '../../src/lib/inquiry/runInquiry';
import type { RestrictedEvidencePolicy } from '../../src/lib/evidenceVisibility';
import type { EvidenceRow, LogRow, ObjectRow, SubjectRow } from '../../src/lib/inquiry/search';
import type { MyChallengeRow, ToolCatalog } from '../../src/lib/inquiry/tools';

export const SESSION = '11111111-2222-4333-8444-555555555555';

// شريحة من أدلة ROOM 714 المفتوحة (sql/005).
const EVIDENCE: Omit<EvidenceRow, 'readable'>[] = [
  {
    code: 'D-02',
    title: 'سجل بطاقات الأبواب',
    kind: 'record',
    owner_spec: 'digital',
    clock_label: null,
    body: 'الطابق السابع — سجل فتح الأبواب\n\n23:43 — غرفة 714 — بطاقة النزيل (رامي الخطيب)\n00:06 — غرفة 714 — Staff Master Key\n\nلا يوجد فتح آخر مسجّل لهذه الغرفة تلك الليلة.',
  },
  {
    code: 'V-02',
    title: 'إفادة مدير الأمن — كريم',
    kind: 'testimony',
    owner_spec: 'field',
    clock_label: null,
    body: 'إفادة: كريم — مدير أمن الفندق\n\n"آخر مرة شفته كانت حوالي الحدعش. كان نازل من المصعد. ما حكينا كتير."',
  },
  {
    code: 'V-06',
    title: 'إفادة فني الصيانة — آدم',
    kind: 'testimony',
    owner_spec: 'field',
    clock_label: '00:20',
    body: 'إفادة: آدم — فني صيانة\n\n"...سمعت صوت. معدني. قوي."',
  },
];

/** كما يرجعها evidence_index لهذا اللاعب: body = null خارج تخصصاته. */
export function evidenceFor(specs: Specialization[]): EvidenceRow[] {
  return EVIDENCE.map((e) => {
    const readable = e.owner_spec !== null && specs.includes(e.owner_spec); // null = لا مالك قدراتي → مغلق (كقاعدة 035)
    return { ...e, readable, body: readable ? e.body : null };
  });
}

const ROOM: ObjectRow = {
  code: 'ROOM_714', category: 'location', parent_code: null, title: 'الغرفة 714',
  description: 'الغرفة مش مقلوبة أو فيها فوضى كبيرة.', state: 'KNOWN', discovered: true, is_shared: true,
};
const OFFICE: ObjectRow = {
  code: 'SECURITY_OFFICE', category: 'location', parent_code: null, title: 'مكتب الأمن',
  description: 'مكتب أمن الفندق.', state: 'KNOWN', discovered: true, is_shared: true,
};

type View = 'unknown' | 'mine' | 'hidden' | 'shared';

const DESCRIPTIONS: Record<string, string> = {
  LAPTOP: 'لابتوب مفتوح، الشاشة مطفأة.',
  DOOR_714: 'باب الغرفة يُفتح ببطاقة. فتحات الباب تُسجَّل بسجل بطاقات الطابق.',
  VICTIM_ITEMS: 'الهاتف موجود على الطاولة. المحفظة موجودة. جواز السفر موجود.',
  PASSPORT: 'الاسم على الجواز: رامي الخطيب.',
  CCTV_ARCHIVE: 'نظام أرشيف الكاميرات جاهز للبحث.',
};

function obj(code: string, category: string, parent: string, title: string, view: View): ObjectRow {
  // نفس شكل investigation_object_index: المحجوب بلا وصف وحالته 'HIDDEN'.
  switch (view) {
    case 'unknown':
      return { code, category, parent_code: parent, title, description: '', state: 'UNKNOWN', discovered: false, is_shared: false };
    case 'hidden':
      return { code, category, parent_code: parent, title, description: '', state: 'HIDDEN', discovered: true, is_shared: false };
    default:
      return {
        code, category, parent_code: parent, title, description: DESCRIPTIONS[code] ?? '',
        state: 'DISCOVERED', discovered: true, is_shared: view === 'shared',
      };
  }
}

export interface World {
  laptop?: View;
  door?: View;
  victimItems?: View;
  passport?: View | 'absent';
  cctv?: View;
}

export function objectsFor(w: World): ObjectRow[] {
  const rows = [
    ROOM,
    OFFICE,
    obj('LAPTOP', 'device', 'ROOM_714', 'لابتوب', w.laptop ?? 'unknown'),
    obj('DOOR_714', 'access', 'ROOM_714', 'باب الغرفة', w.door ?? 'unknown'),
    obj('VICTIM_ITEMS', 'object', 'ROOM_714', 'أغراض على الطاولة الجانبية', w.victimItems ?? 'unknown'),
    obj('CCTV_ARCHIVE', 'archive', 'SECURITY_OFFICE', 'أرشيف كاميرات المراقبة', w.cctv ?? 'unknown'),
  ];
  // الفرع يظهر بالفهرس فقط حين يُكتشف أصله (من أي لاعب) — كما بـ SQL.
  const parentFound = (w.victimItems ?? 'unknown') !== 'unknown';
  if (parentFound && w.passport !== 'absent') {
    rows.push(obj('PASSPORT', 'object', 'VICTIM_ITEMS', 'جواز السفر', (w.passport as View | undefined) ?? 'unknown'));
  }
  return rows;
}

export const SUBJECTS: SubjectRow[] = [{ code: 'KAREEM', name: 'كريم', role: 'مدير أمن الفندق' }];

export const CATALOG: ToolCatalog = {
  hosts: [
    { tool: 'ACCESS_LOG', objectCode: 'DOOR_714', spec: 'digital', requiresShared: true },
    { tool: 'CCTV', objectCode: 'CCTV_ARCHIVE', spec: 'field', requiresShared: true },
    { tool: 'RECORDS', objectCode: 'PASSPORT', spec: 'records', requiresShared: true },
    { tool: 'DEVICE_INVESTIGATION', objectCode: 'LAPTOP', spec: 'digital', requiresShared: false },
  ],
  interrogation: true,
};

export interface FakeOptions {
  userId?: string | null;
  member?: boolean;
  specs?: Specialization[];
  world?: World;
  log?: LogRow[];
  challenges?: MyChallengeRow[];
  catalog?: ToolCatalog;
  /** سياسة القضية للدليل غير المقروء — غرفة 714 = title. */
  policy?: RestrictedEvidencePolicy;
  model?: ((prompt: string) => string | null) | null;
}

/** deps مزيّفة تسجّل كل قراءة — للتحقق أن الرفض يحصل قبل أي وصول للمواد. */
export function fakeDeps(o: FakeOptions = {}): InquiryDeps & { reads: string[]; prompts: string[] } {
  const reads: string[] = [];
  const prompts: string[] = [];
  const specs = o.specs ?? ['digital', 'forensics'];
  const note = <T,>(name: string, value: T) => {
    reads.push(name);
    return Promise.resolve(value);
  };
  return {
    reads,
    prompts,
    getUserId: () => Promise.resolve(o.userId === undefined ? 'user-b' : o.userId),
    isMember: () => Promise.resolve(o.member ?? true),
    mySpecializations: () => note('my_specializations', specs),
    evidenceIndex: () => note('evidence_index', evidenceFor(specs)),
    objectIndex: () => note('investigation_object_index', objectsFor(o.world ?? {})),
    subjects: () => note('interrogation_subjects', SUBJECTS),
    interrogationLog: () => note('interrogation_log', o.log ?? []),
    myChallenges: () => note('challenge_index', o.challenges ?? []),
    evidencePolicy: () => note('evidence_policy', o.policy ?? 'title'),
    toolCatalog: () => note('tool_catalog', o.catalog ?? CATALOG),
    classify:
      o.model === null || o.model === undefined
        ? null
        : (messages) => {
            const prompt = messages.map((m) => m.content).join('\n');
            prompts.push(prompt);
            return Promise.resolve(o.model ? o.model(prompt) : null);
          },
  };
}

export function ask(text: string) {
  return { sessionId: SESSION, text };
}
