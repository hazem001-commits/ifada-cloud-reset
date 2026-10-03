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
import { IconCheck, IconLock, IconTeam, IconTransmit } from './icons';
import d from './dossier.module.css';

const SETTLE_MS = 2600;

export default function ShareAction({
  shared,
  busy,
  needsHandoff,
  onShare,
}: {
  shared: boolean;
  busy: boolean;
  /** لا أداة لتخصصي هنا: المشاركة هي الخطوة الطبيعية التالية. */
  needsHandoff: boolean;
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
          <p className={d.shareText}>الفريق يرى هذا الاكتشاف الآن، ويمكن للمتخصص المناسب متابعته.</p>
          <span className={d.transmission} data-phase="delivered" aria-hidden="true" />
        </div>
      );
    }
    return (
      <p className={d.sharedLine}>
        <IconTeam size={14} />
        مشترك مع الفريق
      </p>
    );
  }

  const sending = requested && busy;

  return (
    <div className={d.share} data-phase={sending ? 'sending' : 'private'}>
      <p className={d.shareHead}>
        <IconLock size={14} />
        اكتشاف خاص
      </p>
      <p className={d.shareText}>
        {needsHandoff
          ? 'لا يعرف به أحد غيرك بعد، ومتابعته ليست ضمن أدوات تخصصك. شاركه ليصل إلى المتخصص المناسب في فريقك.'
          : 'لا يعرف به أحد غيرك بعد. شاركه حين تقرّر ليصل إلى الفريق.'}
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
        {sending ? 'جارٍ التسليم للفريق…' : 'مشاركة مع الفريق'}
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
