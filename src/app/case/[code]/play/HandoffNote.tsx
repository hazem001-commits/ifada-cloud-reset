// ============================================================
// src/app/case/[code]/play/HandoffNote.tsx
// التسليم للمختص + أثر المادة في ملف القضية — داخل ملف الفحص.
//
//   "يكمله: التقني — سليم"      اكتشافي، وخطوته التالية ليست بيدي
//   "بيد سليم الآن"              شاركته، والمتابعة عند صاحب القدرة
//   "أُضيف إلى ملف القضية"       المادة التي أنتجها هذا الفحص وصلت
//   "في ملف القضية — قراءتها عند سليم" وصلت، لكن قراءتها لصاحب تخصصها: اسأل
//   "تدخل ملف القضية حين تشاركه" النتيجة عندي، والسجل الرسمي للفريق
//
// كل المدخلات مصرّح بها: حالة العنصر كما رجعت لي، خريطة العرض (قدرة،
// لا محتوى)، صفوف evidence_index (العنوان/قابلية القراءة)، وأسماء الفريق.
// ============================================================
'use client';

import { specLabel } from '@/types/database';
import type { EvidenceItem } from '@/types/case';
import type { InvestigationObject } from '@/types/investigationObjects';
import { useCasePresentation } from '@/cases/CaseContext';
import { handoffFor, producedBy, specsOf } from '@/lib/play/model';
import { isRedactedToMe } from '../investigation/labels';
import { IconFile, IconTeam } from '../investigation/icons';
import { usePlay } from './PlayContext';
import s from './play.module.css';

const joinNames = (names: string[]) => names.join(' و');

/** أسماء من يكمل اكتشافاً — للمشاركة الموجّهة ("سلّمه إلى …"). null = لا تسليم. */
export function useHandoffNames(object: InvestigationObject): string | null {
  const play = usePlay();
  const { opening } = useCasePresentation();
  if (!play || !object.discovered || isRedactedToMe(object)) return null;
  const h = handoffFor(opening, object.code, object.state, play.mySpecs, play.holders, play.members, play.myId);
  if (!h || h.mine || h.teammates.length === 0) return null;
  return joinNames(h.teammates.map((t) => t.name));
}

export default function HandoffNote({
  object,
  evidence,
  onOpenEvidence,
}: {
  object: InvestigationObject;
  evidence: readonly EvidenceItem[];
  onOpenEvidence: (code: string) => void;
}) {
  const play = usePlay();
  const { opening } = useCasePresentation();
  if (!play || !opening || !object.discovered || isRedactedToMe(object)) return null;

  const h = handoffFor(opening, object.code, object.state, play.mySpecs, play.holders, play.members, play.myId);
  const produced = producedBy(opening, object.code, object.state);
  const item = produced ? evidence.find((e) => e.code === produced) : undefined;

  if (item) {
    if (item.readable) {
      return (
        <div className={s.note} data-kind="filed">
          <p className={s.noteHead}>
            <IconFile size={14} /> أُضيف إلى ملف القضية
          </p>
          <p className={s.noteText}>{item.title}</p>
          <button type="button" className={s.noteAction} onClick={() => onOpenEvidence(item.code)}>
            افتح المادة
          </button>
        </div>
      );
    }
    const readers = item.owner_spec
      ? play.members.filter((m) => m.userId !== play.myId && specsOf(m.userId, play.holders, m.specialization).includes(item.owner_spec!))
      : [];
    return (
      <div className={s.note} data-kind="filed">
        <p className={s.noteHead}>
          <IconFile size={14} /> في ملف القضية — {item.title}
        </p>
        <p className={s.noteText}>
          {readers.length > 0
            ? `قراءتها عند ${joinNames(readers.map((r) => r.displayName))}. اسأل ماذا تقول.`
            : 'قراءتها عند صاحب تخصصها في فريقك.'}
        </p>
      </div>
    );
  }

  // نتيجة معي لم أشاركها: زر المشاركة نفسه يقول ذلك (لا تكرار).
  if (produced && !object.is_shared) return null;

  if (!h || h.mine || object.processing) return null;
  const names = h.teammates.map((t) => t.name);
  // اكتشاف خاص له من يكمله: زر المشاركة نفسه يقول "سلّمه إلى …" — لا تكرار.
  if (!object.is_shared && names.length > 0) return null;
  return (
    <div className={s.note} data-kind={object.is_shared ? 'handed' : 'handoff'}>
      <p className={s.noteHead}>
        <IconTeam size={14} />
        {object.is_shared ? `بيد ${names.length ? joinNames(names) : 'الفريق'} الآن` : `يكمله: ${specLabel(h.spec)}`}
      </p>
      <p className={s.noteText}>
        {object.is_shared
          ? `الخطوة التالية بأدوات ${specLabel(h.spec)}. تكلّموا عمّا وجدته.`
          : names.length
            ? `ليس بأدواتك — هذه قدرة ${joinNames(names)}. شاركه ليصل.`
            : 'ليس بأدواتك، ولا يحمل أحد في فريقك هذا التخصص الآن.'}
      </p>
    </div>
  );
}
