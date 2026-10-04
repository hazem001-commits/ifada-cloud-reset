// ============================================================
// src/cases/room-714/presentation.ts
// عرض غرفة 714: مشاهد مصوّرة، مفاتيح لقطات العناصر، وهوية/مصدر
// مدخلات ملف القضية. كله عرض فقط — لا حالة ولا صلاحية ولا حقيقة
// مخفية، وكل المفاتيح هنا ضمن نطاق هذه القضية وحدها.
// (نُقلت كما هي من sceneGeometry.ts / objectViews.ts / caseFileModel.ts)
// ============================================================
import type { CasePresentation, ObjectProfile, OpeningPresentation } from '../presentation';

// ------------------------------------------------------------
// المشاهد المعتمدة. المفتاح = كود الموقع بـ investigation_objects.
// الموقع بدون مشهد هنا يُعرض على سطح تحقيق محايد (بلا صورة مختلقة).
//
// قاعدة: عنصر يُثبَّت على الصورة فقط إذا كان جسمه الفعلي ظاهراً فيها.
// DOOR_714 (باب الغرفة / نظام الدخول) غير مثبّت عمداً: باب مدخل الغرفة
// لا يظهر بالصورة المعتمدة (الباب المفتوح الظاهر باب الحمّام). يبقى
// العنصر كاملاً قابلاً للوصول عبر مدخل "خارج إطار الصورة" بالمشهد.
// ------------------------------------------------------------
const SCENES: CasePresentation['scenes'] = {
  ROOM_714: {
    width: 1536,
    height: 1024,
    focal: { x: 900, y: 520 },
    safe: { x: 370, y: 170, w: 1085, h: 770 },
    alt: 'الغرفة 714 ليلاً: سرير غير مرتّب، باب حمّام مفتوح بجانبه، أريكة وطاولة قهوة، شباك مفتوح على المدينة، ومكتب عليه لابتوب وأغراض شخصية. على الأرض كأس مكسور.',
    anchors: {
      LAPTOP: {
        box: { x: 1130, y: 500, w: 318, h: 258 },
        glint: { x: 1332, y: 724 },
      },
      VICTIM_ITEMS: {
        box: { x: 1082, y: 764, w: 362, h: 130 },
        glint: { x: 1250, y: 800 },
        frame: { x: 1060, y: 700, w: 410, h: 220 },
      },
      PASSPORT: {
        box: { x: 1182, y: 758, w: 144, h: 80 },
        glint: { x: 1250, y: 800 },
        frame: { x: 1070, y: 720, w: 390, h: 190 },
      },
      OPEN_WINDOW: {
        box: { x: 1088, y: 34, w: 212, h: 364 },
        glint: { x: 1211, y: 242 },
      },
      GLASS_CUP: {
        box: { x: 545, y: 856, w: 215, h: 98 },
        glint: { x: 578, y: 902 },
        frame: { x: 520, y: 706, w: 300, h: 262 },
      },
      BLOOD_STAIN: {
        box: { x: 706, y: 730, w: 78, h: 44 },
        glint: { x: 744, y: 752 },
        frame: { x: 560, y: 700, w: 280, h: 250 },
      },
    },
  },
};

// ------------------------------------------------------------
// لقطات قريبة (مفاتيح وتسميات فقط؛ المسارات بالسيرفر وحده:
// src/server/cases/room-714/media.ts). التسميات من النص المكتوب
// للعنصر نفسه: VICTIM_ITEMS يذكر "الهاتف … المحفظة … جواز السفر"،
// والجواز عنصر مستقل، وBLOOD_STAIN يصف "بقعة صغيرة داكنة". لا تفاصيل
// إضافية من الصور (أسماء/أرقام/مصدر الدم) تُضاف هنا.
// ------------------------------------------------------------
const OBJECT_VIEWS: CasePresentation['objectViews'] = {
  PASSPORT: [{ key: 'passport', label: 'جواز السفر' }],
  BLOOD_STAIN: [{ key: 'stain', label: 'بقعة صغيرة داكنة' }],
  VICTIM_ITEMS: [
    { key: 'phone', label: 'الهاتف' },
    { key: 'wallet', label: 'المحفظة' },
  ],
};

// ------------------------------------------------------------
// ملف القضية: هوية ومصدر لكل حالة، لأن نفس العنصر يتحوّل (أثر
// ملحوظ → عيّنة → نتيجة مخبرية). عبارات المصدر تصف فقط ما صار فعلاً
// بآليات اللعبة — لا وقائع قضية جديدة.
// ------------------------------------------------------------
const ROOM_SURVEY = 'عُثر عليه أثناء معاينة الغرفة 714';

const OBJECT_PROFILES: Record<string, Record<string, ObjectProfile>> = {
  GLASS_CUP: { DISCOVERED: { identity: 'physical', provenance: ROOM_SURVEY } },
  OPEN_WINDOW: { DISCOVERED: { identity: 'physical', provenance: 'لوحظ أثناء معاينة الغرفة 714' } },
  VICTIM_ITEMS: { DISCOVERED: { identity: 'physical', provenance: 'لوحظت أثناء معاينة الغرفة 714' } },
  BLOOD_STAIN: {
    DISCOVERED: { identity: 'physical', provenance: 'لوحظ أثناء الفحص عن قرب لمحيط الكأس المكسور' },
    SAMPLE_COLLECTED: { identity: 'lab', provenance: 'عيّنة أُخذت من الأثر في موقعه' },
    PROCESSING: { identity: 'lab', provenance: 'العيّنة في المختبر — التحليل جارٍ' },
    ANALYZED: { identity: 'lab', provenance: 'نتيجة تحليل مخبري لعيّنة الأثر' },
  },
  PASSPORT: {
    DISCOVERED: { identity: 'physical', provenance: 'عُثر عليه ضمن أغراض النزيل الشخصية' },
    RECORDS_QUERIED: { identity: 'record', provenance: 'نتيجة استعلام في سجلات نزلاء الفندق' },
  },
  LAPTOP: {
    DISCOVERED: { identity: 'physical', provenance: ROOM_SURVEY },
    INSPECTED: { identity: 'digital', provenance: 'فُحص الجهاز تقنياً' },
    DRAFT_RECOVERED: { identity: 'digital', provenance: 'مُستخرج من جهاز الضحية' },
  },
};

// ------------------------------------------------------------
// الافتتاحية (RESET-2). النصوص من الكتالوج العام للقضية (العنوان، اسم
// المفقود، التصنيف) ومن البلاغ نفسه (V-01 يقرؤه صاحبه فقط). خرائط
// التسليم/الإنتاج مرآة لتفاعلات sql/038 (tests/play/openingMirror.test.ts).
// ------------------------------------------------------------
const OPENING: OpeningPresentation = {
  briefing: {
    evidence: 'V-01',
    kicker: 'بلاغ شخص مفقود',
    premise: 'رامي الخطيب مفقود. غرفته في الفندق، 714، أول ما ستراه.',
    enter: 'ادخل الغرفة 714',
  },
  capabilities: {
    field: 'تلاحظ كل ما في الغرفة، وتفحص المكان بعين المحقق.',
    forensics: 'تلاحظ الآثار المادية، تجمع العيّنات وترسلها للمختبر.',
    digital: 'تلاحظ الأجهزة والأبواب، وتستخرج ما تحفظه أنظمتها.',
    records: 'تلاحظ الوثائق والمقتنيات، وتستعلم في سجلات الفندق.',
  },
  handoffs: {
    LAPTOP: { DISCOVERED: 'digital', INSPECTED: 'digital' },
    PASSPORT: { DISCOVERED: 'records' },
    BLOOD_STAIN: { DISCOVERED: 'forensics', SAMPLE_COLLECTED: 'forensics' },
    DOOR_714: { DISCOVERED: 'digital' },
  },
  produces: {
    LAPTOP: { DRAFT_RECOVERED: 'D-01' },
    PASSPORT: { RECORDS_QUERIED: 'R-01' },
    BLOOD_STAIN: { ANALYZED: 'F-02' },
  },
  custody: {
    'V-01': 'البلاغ الذي فتح القضية',
    'D-01': 'استُخرجت من لابتوب الضحية بفحص تقني',
    'R-01': 'نتيجة استعلام في سجلات نزلاء الفندق بعد فحص الجواز',
    'F-02': 'تقرير المختبر لعيّنة أُخذت من الأثر قرب الكأس',
    'F-01': 'أُعدّ حين وثّق الفريق كل ما في الغرفة',
  },
  leadPointers: {
    L714_ROOM: { kind: 'object', code: 'ROOM_714', label: 'الغرفة نفسها' },
  },
};

export const ROOM_714_PRESENTATION: CasePresentation = {
  scenes: SCENES,
  objectViews: OBJECT_VIEWS,
  objectProfiles: OBJECT_PROFILES,
  // لوحة غرفة 714 حرة: إعادة بناء الحركة تعيش بسطحها الخاص (المرحلة 8).
  boardLanes: [],
  opening: OPENING,
};
