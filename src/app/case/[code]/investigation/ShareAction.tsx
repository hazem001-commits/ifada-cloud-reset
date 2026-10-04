// ============================================================
// src/app/case/[code]/investigation/ShareAction.tsx
// المشاركة كتسليم تحقيقي مقصود:
//   خاص    → "اكتشاف خاص" + سطر سرّي هادئ + قرار المشاركة
//   إرسال  → خط نقل نحاسي رفيع — أثناء الطلب الحقيقي فقط
//   وصل    → الخط يكتمل و"وصل إلى الفريق" — فقط لما السيرفر يثبّت
//            is_shared فعلاً (لا نجاح مزيّف)، ثم يستقر
//   مشترك  → سطر هادئ، بدون إعادة تمثيل الخصوصية
// لا منطق هون: onShare هو نفس share_object_discovery بالمحرك.
// ============================================================
'use client';

import { useEffect, useState } from 'react';
import { IconCheck, IconLock, IconTransmit } from './icons';
import d from './dossier.module.css';

const SETTLE_MS = 2600;

export default function ShareAction({
  shared,
  busy,
  handoffTo = null,
  recordPending = false,
  withParents = [],
  onShare,
}: {
  shared: boolean;
  busy: boolean;
  /** زميل/زملاء يملكون القدرة التالية (أسماء) — مشاركة موجّهة. */
  handoffTo?: string | null;
  /** عندي نتيجة/مادة جاهزة تدخل ملف القضية حين أشارك. */
  recordPending?: boolean;
  /** أصول خاصة بي تُشارك معه (عناوين). */
  withParents?: string[];
  onShare: () => void;
}) {
  const [requested, setRequested] = useState(false);
  const [settled, setSettled] = useState(false);

  // بعد تأكيد السيرفر: لحظة "وصل" قصيرة ثم استقرار هادئ.
  useEffect(() => {
    if (!shared || !requested) return;
    const id = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [shared, requested]);

  if (shared) {
    if (requested && !settled) {
      return (
        <div className={d.share} data-phase="delivered" role="status">
          <p className={d.shareHead} data-phase="delivered">
            <IconCheck size={15} />
            وصل إلى الفريق
          </p>
          <p className={d.shareText}>
            {handoffTo ? `وصل إلى ${handoffTo} وبقية الفريق — المتابعة الآن بيده.` : 'الفريق يرى هذا الاكتشاف الآن، ويمكن للمتخصص المناسب متابعته.'}
          </p>
          <span className={d.transmission} data-phase="delivered" aria-hidden="true" />
        </div>
      );
    }
    // الحالة "مشترك مع الفريق" ظاهرة أصلاً تحت العنوان — لا تكرار هنا.
    return null;
  }

  const sending = requested && busy;

  return (
    <div className={d.share} data-phase={sending ? 'sending' : 'private'}>
      <p className={d.shareHead}>
        <IconLock size={14} />
        اكتشاف خاص
      </p>
      <p className={d.shareText}>
        {handoffTo
          ? 'لا يعرف به أحد غيرك بعد. الخطوة التالية ليست بأدواتك.'
          : recordPending
            ? 'النتيجة معك وحدك. حين تشاركه تدخل ملف القضية — سجل الفريق الرسمي.'
            : 'لا يعرف به أحد غيرك بعد. شاركه حين تقرّر ليصل إلى الفريق.'}
        {withParents.length > 0 && <> يُشارك معه موضعه: {withParents.join(' ← ')}.</>}
      </p>
      <button
        type="button"
        className={d.shareBtn}
        disabled={busy}
        aria-busy={sending}
        onClick={() => {
          setRequested(true);
          setSettled(false);
          onShare();
        }}
      >
        <IconTransmit size={16} />
        {sending ? 'جارٍ التسليم للفريق…' : handoffTo ? `سلّمه إلى ${handoffTo}` : 'مشاركة مع الفريق'}
      </button>
      <span className={d.transmission} data-phase={sending ? 'sending' : 'idle'} aria-hidden="true" />
      {sending && (
        <span className="sr-only" role="status">
          جارٍ تسليم الاكتشاف للفريق
        </span>
      )}
    </div>
  );
}
