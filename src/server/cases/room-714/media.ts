// ============================================================
// src/server/cases/room-714/media.ts
// سيرفر فقط. مسارات Storage لوسائط مشهد غرفة 714 (bucket خاص
// case-media). لا تصل للمتصفح أبداً — المتصفح يرسل رموزاً آمنة
// ويستلم رابطاً موقّتاً فقط (src/app/api/scene-media).
//
// لقطات العناصر (مثل الجواز) ليست أدلة: لا صفوف evidence ولا أكواد
// أدلة. مفاتيحها تطابق عرض القضية (src/cases/room-714/presentation.ts).
// ============================================================
import type { CaseMedia } from '../types';

export const ROOM_714_MEDIA: CaseMedia = {
  /** كود موقع → صورة المشهد الكاملة. */
  scenes: {
    ROOM_714: 'room-714/scene/room714-crime-scene-overview.png',
  },
  /**
   * كود عنصر → مفتاح لقطة → مسار. الهاتف والمحفظة ليسا عنصرين مستقلين
   * بالمحرك: هما جزء من VICTIM_ITEMS (نصّه المكتوب يذكرهما).
   */
  objectViews: {
    PASSPORT: { passport: 'room-714/objects/passport-01.png' },
    // ابن GLASS_CUP: لا لقطة إلا إذا كان الكأس نفسه معروفاً للاعب أيضاً.
    BLOOD_STAIN: { stain: 'room-714/objects/blood-stain-01.png' },
    VICTIM_ITEMS: {
      phone: 'room-714/objects/phone-01.png',
      wallet: 'room-714/objects/wallet-01.png',
    },
  },
};
