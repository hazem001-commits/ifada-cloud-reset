// ============================================================
// src/app/case/[code]/evidence/phone/phoneTypes.ts
// أنواع أدلة الهاتف/المحادثة. وضع "المحادثة المبنينة" جاهز معمارياً
// فقط — يُستخدم حصراً لو القضية زوّدت بيانات رسائل حقيقية. ما في
// استخراج نص من صور الشاشة ولا إعادة بناء محادثة ولا رسائل مُختلقة.
// ============================================================

export interface StructuredMessage {
  /** اتجاه الرسالة كما هو بالمصدر. */
  direction: 'incoming' | 'outgoing';
  text: string;
  /** يظهر فقط لو موجود بالمصدر نفسه. */
  time?: string;
  /** اسم المرسل كما هو بالمصدر (اختياري) — لا تعرّف تلقائي. */
  sender?: string;
}

export interface StructuredThread {
  /** عنوان المحادثة كما يظهر بالمصدر (اختياري). */
  label?: string;
  messages: StructuredMessage[];
}

export type PhoneMediaState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; url: string };
