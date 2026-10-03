// ============================================================
// src/app/case/[code]/evidence/EvidenceExaminationRoom.tsx
// المتحكم: يجلب رابط الوسائط الموقّت (فقط لما تُفتح الغرفة، وفقط
// لو الدليل has_media)، يصنّف طريقة العرض، ويفوّض للـ viewer
// المناسب داخل EvidenceOverlay. منطق الأمان/الشبكة هون فقط —
// مكوّنات العرض (Viewer) لا تعرف عن fetch أو أخطاء الشبكة.
// ============================================================
'use client';

import { useEffect, useRef, useState } from 'react';
import type { EvidenceItem } from '@/types/case';
import type { EvidenceMediaResponse } from './types';
import { classifyEvidence } from './classify';
import { authoredContextFor } from './authoredContext';
import EvidenceOverlay from './EvidenceOverlay';
import DocumentEvidenceViewer, { type DocumentMediaState } from './document/DocumentEvidenceViewer';
import ImageEvidenceViewer, { type ImageMediaState } from './image/ImageEvidenceViewer';
import AudioEvidenceViewer, { type AudioMediaState } from './audio/AudioEvidenceViewer';
import VideoEvidenceViewer, { type VideoMediaState } from './video/VideoEvidenceViewer';
import PhoneEvidenceViewer from './phone/PhoneEvidenceViewer';
import type { PhoneMediaState } from './phone/phoneTypes';

export default function EvidenceExaminationRoom({
  sessionId,
  item,
  onClose,
}: {
  sessionId: string;
  item: EvidenceItem;
  onClose: () => void;
}) {
  const [media, setMedia] = useState<EvidenceMediaResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    item.has_media ? 'loading' : 'ready',
  );
  const [attempt, setAttempt] = useState(0);
  // مفتاح "طلب الفتح" الحالي (جلسة + دليل + رقم المحاولة). React بيحافظ على
  // الـ ref خلال إعادة تشغيل الـ effects المحاكاة بـ Strict Mode (dev) —
  // فنفس الفتح ما بيبعث طلب ثاني. فتح جديد (مكوّن جديد) أو "إعادة
  // المحاولة" (attempt جديد) = مفتاح جديد = طلب صلاحية جديد.
  const activeRequest = useRef<string | null>(null);

  useEffect(() => {
    if (!item.has_media) return;
    const key = `${sessionId}:${item.code}:${attempt}`;
    if (activeRequest.current === key) return;
    activeRequest.current = key;

    void (async () => {
      setStatus('loading');

      try {
        const res = await fetch('/api/evidence-media', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, code: item.code }),
        });

        // رد قديم (تغيّر الدليل/المحاولة بالأثناء) = تجاهل.
        if (activeRequest.current !== key) return;

        if (!res.ok) {
          // كود الخطأ للتشخيص فقط — المحطات بتعرض رسالة داخل عالم اللعبة.
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          console.error('[IFADA evidence] media request refused:', body.error ?? res.status);
          setStatus('error');
          return;
        }

        const data = (await res.json()) as EvidenceMediaResponse;
        if (activeRequest.current !== key) return;
        setMedia(data);
        setStatus('ready');
      } catch {
        if (activeRequest.current === key) setStatus('error');
      }
    })();
  }, [sessionId, item.code, item.has_media, attempt]);

  function onMediaError() {
    setStatus('error');
  }

  function retry() {
    setAttempt((n) => n + 1);
  }

  const contentType = media?.contentType ?? null;

  // بدون وسائط فعلية، كل الأنواع تُعرض كوثيقة نصية (body) — لا فائدة
  // من عرض CCTV/مسجّل/فيديو فاضٍ بانتظار وسائط لن تصل.
  const presentation = item.has_media
    ? classifyEvidence(item, contentType)
    : 'document';

  const isDocument = presentation === 'document' || presentation === 'official-record';

  // "تفاصيل الدليل": نص الدليل المكتوب نفسه (item.body المصرّح به) حين
  // تكون له وسائط — حتى لا تُخفي الوسائط محتوى يراه اللاعب أصلاً.
  // بلا وسائط يبقى null: العارض النصي يعرض النص (لا تكرار).
  const context = authoredContextFor(item);

  if (isDocument) {
    const docMedia: DocumentMediaState = !item.has_media
      ? { status: 'none' }
      : status === 'error'
        ? { status: 'error' }
        : status === 'ready' && media
          ? { status: 'ready', url: media.url, contentType: media.contentType }
          : { status: 'loading' };

    return (
      <EvidenceOverlay
        sessionId={sessionId}
        code={item.code}
        title={item.title}
        layout="workstation"
        context={context}
        onClose={onClose}
      >
        <DocumentEvidenceViewer item={item} media={docMedia} onRetry={retry} onMediaError={onMediaError} />
      </EvidenceOverlay>
    );
  }

  // الاختيار حسب خصائص الدليل/الوسائط (kind + contentType + العنوان)
  // عبر classifyEvidence — مش حسب كود قضية أو دليل معيّن.
  if (presentation === 'surveillance-image' || presentation === 'social-image') {
    const imageMedia: ImageMediaState =
      status === 'error'
        ? { status: 'error' }
        : status === 'ready' && media
          ? { status: 'ready', url: media.url }
          : { status: 'loading' };

    return (
      <EvidenceOverlay
        sessionId={sessionId}
        code={item.code}
        title={item.title}
        layout="workstation"
        context={context}
        onClose={onClose}
      >
        <ImageEvidenceViewer
          item={item}
          mode={presentation === 'surveillance-image' ? 'surveillance' : 'photo'}
          media={imageMedia}
          onRetry={retry}
          onMediaError={onMediaError}
        />
      </EvidenceOverlay>
    );
  }

  if (presentation === 'audio') {
    const audioMedia: AudioMediaState =
      status === 'error'
        ? { status: 'error' }
        : status === 'ready' && media
          ? { status: 'ready', url: media.url, contentType: media.contentType }
          : { status: 'loading' };

    return (
      <EvidenceOverlay
        sessionId={sessionId}
        code={item.code}
        title={item.title}
        layout="workstation"
        context={context}
        onClose={onClose}
      >
        <AudioEvidenceViewer item={item} media={audioMedia} onRetry={retry} />
      </EvidenceOverlay>
    );
  }

  if (presentation === 'video') {
    const videoMedia: VideoMediaState =
      status === 'error'
        ? { status: 'error' }
        : status === 'ready' && media
          ? { status: 'ready', url: media.url, contentType: media.contentType }
          : { status: 'loading' };

    return (
      <EvidenceOverlay
        sessionId={sessionId}
        code={item.code}
        title={item.title}
        layout="workstation"
        context={context}
        onClose={onClose}
      >
        <VideoEvidenceViewer item={item} media={videoMedia} onRetry={retry} />
      </EvidenceOverlay>
    );
  }

  // المتبقّي: 'phone' — لقطة شاشة جهاز (أو محادثة مبنينة لو توفّرت بيانات حقيقية).
  const phoneMedia: PhoneMediaState = !item.has_media
    ? { status: 'none' }
    : status === 'error'
      ? { status: 'error' }
      : status === 'ready' && media
        ? { status: 'ready', url: media.url }
        : { status: 'loading' };

  return (
    <EvidenceOverlay
      sessionId={sessionId}
      code={item.code}
      title={item.title}
      layout="workstation"
      context={context}
      onClose={onClose}
    >
      <PhoneEvidenceViewer item={item} media={phoneMedia} onRetry={retry} onMediaError={onMediaError} />
    </EvidenceOverlay>
  );
}
