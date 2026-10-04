// ============================================================
// src/app/case/[code]/investigation/InspectionDossier.tsx
// ملف الفحص السياقي: يدخل من بداية السطر والغرفة تبقى ظاهرة بجانبه.
// إفصاح متدرّج: ما هو ← ما نعرفه ← الخطوة الطبيعية التالية
// (مشاركة / أداة المختص / تسليم هادئ) ← اللوحة.
// لا منطق صلاحية هنا ولا أكواد داخلية — كل ما يظهر رجع مفلتراً
// من السيرفر، وكل زر يستدعي نفس الإجراءات الموجودة بالمحرك.
// ============================================================
'use client';

import { useEffect, useRef } from 'react';
import type { Specialization } from '@/types/database';
import type { InvestigationObject, ObjectWorkspace } from '@/types/investigationObjects';
import type { InvestigationChallenge } from '@/types/challenges';
import type { EvidenceItem } from '@/types/case';
import HandoffNote, { useHandoffNames } from '../play/HandoffNote';
import NoticeAction from '../play/NoticeAction';
import { producedBy } from '@/lib/play/model';
import { useCasePresentation } from '@/cases/CaseContext';
import { CATEGORY_LABEL, isMineOrShared, isRedactedToMe, objectStatus, type StatusTone } from './labels';
import WorkstationLane from './WorkstationLane';
import ChallengeConsole from './ChallengeConsole';
import DeviceWorkspace from './DeviceWorkspace';
import AccessGate from './AccessGate';
import ShareAction from './ShareAction';
import { PinAction } from '../casefile/EntryMarks';
import { CategoryIcon, IconBack, IconCheck, IconClock, IconEye, IconEyeOff, IconLock, IconTeam } from './icons';
import d from './dossier.module.css';

const SPEC_ORDER: Specialization[] = ['field', 'digital', 'forensics', 'records'];

const STATUS_ICON: Record<StatusTone, (p: { size: number }) => React.ReactElement> = {
  idle: IconEye,
  private: IconLock,
  teammate: IconEyeOff,
  shared: IconTeam,
  processing: IconClock,
  ready: IconCheck,
};

export default function InspectionDossier({
  sessionId,
  object,
  workspace,
  challenges,
  evidence,
  locationTitle,
  parent,
  sharesWith = [],
  discoveries,
  readyCodes,
  pinned,
  busy,
  onAction,
  onShare,
  onAddToBoard,
  onChallengeSolved,
  onOpenEvidence,
  onFocus,
  onClose,
}: {
  sessionId: string;
  object: InvestigationObject;
  workspace: ObjectWorkspace | null;
  challenges: InvestigationChallenge[];
  /** ملف القضية كما يراه اللاعب (evidence_index بعد سياسة القضية). */
  evidence: readonly EvidenceItem[];
  locationTitle: string;
  /** الأصل لو كان هذا اكتشافاً فرعياً. */
  parent: InvestigationObject | null;
  /** أصول خاصة بي تُشارك معه (عناوين) — الفريق لا يرى الابن بلا أصله. */
  sharesWith?: string[];
  /** اكتشافات فرعية ظاهرة لي تحت هذا العنصر (كما رجعت من السيرفر). */
  discoveries: InvestigationObject[];
  readyCodes: ReadonlySet<string>;
  pinned: boolean;
  busy: boolean;
  onAction: (interactionCode: string) => void;
  onShare: () => void;
  onAddToBoard: () => void;
  onChallengeSolved: () => void;
  onOpenEvidence: (evidenceCode: string) => void;
  onFocus: (code: string) => void;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  // فتح عنصر ينقل تركيز لوحة المفاتيح لعنوانه — القارئ يعرف أين صار.
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [object.code]);

  // إجراء ملف بمحطة الجهاز ما بيتكرر كزر عام بالمسار.
  const toolActions = new Set(
    workspace?.kind === 'device' ? workspace.files.map((f) => f.action).filter((a): a is string => !!a) : [],
  );
  // عنصر لم يُكتشف بعد: إجراءاته كلها أفعال ملاحظة — إيماءة واحدة
  // (نفس الفعل قد يصل بنسخة لكل تخصص أملكه؛ لا يتكرر كزرّين).
  const noticing = !object.discovered && object.actions.length > 0;
  const seenLabels = new Set<string>();
  const lanes = noticing
    ? []
    : SPEC_ORDER.map((spec) => ({
        spec,
        actions: object.actions.filter((a) => {
          if (a.spec !== spec || toolActions.has(a.code)) return false;
          const key = a.label;
          if (seenLabels.has(key)) return false;
          seenLabels.add(key);
          return true;
        }),
      })).filter((l) => l.actions.length > 0);
  const handoffTo = useHandoffNames(object);
  const { opening } = useCasePresentation();
  // المادة التي أنتجها هذا الفحص وصلت ملف القضية: هي الخاتمة — لا رسائل "جاهز/لا خطوة" فوقها.
  const producedCode = producedBy(opening, object.code, object.state);
  const filed = !!producedCode && evidence.some((e) => e.code === producedCode);

  const ready = readyCodes.has(object.code);
  const status = objectStatus(object, ready);
  const StatusIcon = STATUS_ICON[status.tone];
  const redacted = isRedactedToMe(object);
  const canShare = object.discovered && !redacted;
  const canPinToBoard = isMineOrShared(object) && object.category !== 'archive';
  const hasTools = workspace !== null || challenges.length > 0 || lanes.length > 0 || noticing;
  const privateMine = status.tone === 'private';

  return (
    <aside className={d.dossier} key={object.code} aria-labelledby="dossier-title" data-tone={status.tone}>
      <div className={d.scroll}>
        <nav className={d.crumbs} aria-label="مسار التحقيق">
          <button type="button" className={d.back} onClick={onClose}>
            <IconBack size={15} />
            {locationTitle}
          </button>
          {parent && (
            <>
              <span className={d.crumbSep} aria-hidden="true">
                /
              </span>
              <button type="button" className={d.crumbLink} onClick={() => onFocus(parent.code)}>
                {parent.title}
              </button>
            </>
          )}
        </nav>

        <header className={d.head}>
          <p className={d.kicker}>
            <CategoryIcon category={object.category} size={14} />
            {CATEGORY_LABEL[object.category] ?? CATEGORY_LABEL.object}
          </p>
          <h2 id="dossier-title" ref={titleRef} tabIndex={-1} className={d.title}>
            {object.title}
          </h2>
          <p className={d.status} data-tone={status.tone} title={status.hint}>
            <StatusIcon size={14} />
            {status.label}
          </p>
        </header>

        {/* ---------- ما نعرفه ---------- */}
        {redacted ? (
          <div className={d.redacted}>
            <div className={d.redactedBars} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p>زميلك اكتشف شيئاً هنا ولم يشاركه بعد. اسأله عنه.</p>
          </div>
        ) : object.discovered ? (
          <p className={d.observation} key={`${object.code}-${object.state}`}>
            {object.description}
          </p>
        ) : (
          <p className={`${d.observation} ${d.observationMuted}`}>لم يُفحص هذا بعد.</p>
        )}

        {object.processing && (
          <div className={d.processing} role="status">
            <p className={d.processingTitle}>
              <IconClock size={15} />
              قيد التحليل
            </p>
            <div className={d.progress} aria-hidden="true" />
            <p className={d.processingText}>
              الطلب مُرسل ويستمر في الخلفية — لا حاجة للانتظار هنا. تابع تحقيقك في الغرفة، وستظهر النتيجة في هذا
              الملف عند اكتمالها.
            </p>
          </div>
        )}

        {ready && !object.processing && !filed && (
          <p className={d.ready} role="status">
            <IconCheck size={15} />
            النتيجة جاهزة — تظهر في ملاحظة الفحص أعلاه.
          </p>
        )}

        {/* ---------- قرار المشاركة ---------- */}
        {noticing && <NoticeAction action={object.actions[0]!} busy={busy} onAction={onAction} />}

        {canShare && (
          <ShareAction
            shared={object.is_shared}
            busy={busy}
            handoffTo={handoffTo}
            recordPending={!!producedCode}
            withParents={sharesWith}
            onShare={onShare}
          />
        )}

        <HandoffNote object={object} evidence={evidence} onOpenEvidence={onOpenEvidence} />

        {/* ---------- اكتشافات فرعية داخل هذا الموضع ---------- */}
        {discoveries.length > 0 && (
          <section className={d.section} aria-labelledby="dossier-kids">
            <h3 id="dossier-kids" className={d.sectionLabel}>
              ضمن هذا الموضع
            </h3>
            <ul className={d.kids}>
              {discoveries.map((kid) => {
                const ks = objectStatus(kid, readyCodes.has(kid.code));
                return (
                  <li key={kid.code}>
                    <button type="button" className={d.kid} onClick={() => onFocus(kid.code)}>
                      <span className={d.kidTitle}>{kid.title}</span>
                      <span className={d.kidMeta} data-tone={ks.tone}>
                        {ks.label}
                      </span>
                      <span className={d.kidGo} aria-hidden="true">
                        ←
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ---------- أدوات المختص ---------- */}
        {hasTools && !noticing && (
          <section className={d.section} aria-labelledby="dossier-tools">
            <h3 id="dossier-tools" className={d.sectionLabel}>
              أدوات الفحص
            </h3>
            <div className={d.tools}>
              {workspace?.kind === 'device' && (
                <DeviceWorkspace
                  device={workspace.device}
                  files={workspace.files}
                  actions={object.actions}
                  disabled={busy || object.processing}
                  onAction={onAction}
                />
              )}

              {workspace?.kind === 'access' && (
                <AccessGate
                  state={workspace.status}
                  credential={workspace.lock}
                  methods={[]}
                  onUseMethod={() => undefined}
                  disabled
                />
              )}

              {challenges.map((c) => (
                <ChallengeConsole
                  key={c.code}
                  sessionId={sessionId}
                  challenge={c}
                  onSolved={onChallengeSolved}
                  onOpenEvidence={onOpenEvidence}
                />
              ))}

              {lanes.map(({ spec, actions }) => (
                <WorkstationLane
                  key={spec}
                  spec={spec}
                  actions={actions}
                  processing={object.processing}
                  disabled={busy}
                  onAction={onAction}
                />
              ))}
            </div>
          </section>
        )}

        {/* ---------- تسليم هادئ: لا أداة لتخصصي هنا (ليس خطأ) ---------- */}
        {!hasTools && !privateMine && !object.processing && !filed && (
          <div className={d.handoff}>
            {redacted ? (
              <p className={d.handoffText}>الأدوات تظهر هنا بعد أن يشارك زميلك ما وجده.</p>
            ) : !object.discovered ? (
              <>
                <p className={d.handoffTitle}>لا يبدأ فحص هذا بأدوات تخصصك</p>
                <p className={d.handoffText}>قد يبدأه زميل من تخصص آخر في فريقك.</p>
              </>
            ) : (
              <>
                <p className={d.handoffTitle}>لا توجد خطوة لتخصصك هنا الآن</p>
                <p className={d.handoffText}>
                  إن كان لهذا الفحص تتمة، فهي بيد متخصص آخر في فريقك.
                  {canPinToBoard ? ' ما وُجد محفوظ — ناقشه معهم أو ثبّته على اللوحة.' : ''}
                </p>
              </>
            )}
          </div>
        )}

        {canPinToBoard && (
          <footer className={d.footer}>
            <PinAction pinned={pinned} busy={busy} onPin={onAddToBoard} />
          </footer>
        )}
      </div>

      {privateMine && <span className={d.confidentialEdge} aria-hidden="true" />}
    </aside>
  );
}
