// ============================================================
// src/app/case/[code]/investigation/WorkstationLane.tsx
// أدوات تخصص واحد على هذا العنصر: غلاف أداة موحّد بهوية التخصص.
// الإجراءات نفسها (ما رجع من السيرفر لتخصصاتي) — العرض فقط تغيّر.
// أول إجراء بارز؛ الرقمي بخطوات مرقّمة (ترتيب فحص تقني).
// ============================================================
'use client';

import type { ReactElement } from 'react';
import type { Specialization } from '@/types/database';
import type { ObjectAction } from '@/types/investigationObjects';
import { WORKSTATION_TITLE } from './labels';
import { IconClock, IconDevice, IconEye, IconFile, IconFlask } from './icons';
import t from './tools.module.css';

const SPEC_ICON: Record<Specialization, () => ReactElement> = {
  field: () => <IconEye size={17} />,
  digital: () => <IconDevice size={17} />,
  forensics: () => <IconFlask size={17} />,
  records: () => <IconFile size={17} />,
};

export default function WorkstationLane({
  spec,
  actions,
  processing,
  disabled,
  onAction,
}: {
  spec: Specialization;
  actions: ObjectAction[];
  processing: boolean;
  disabled: boolean;
  onAction: (code: string) => void;
}) {
  if (actions.length === 0) return null;
  const Icon = SPEC_ICON[spec];

  return (
    <section className={t.tool} data-spec={spec} aria-label={WORKSTATION_TITLE[spec]}>
      <header className={t.toolHead}>
        <span className={t.toolIcon}>
          <Icon />
        </span>
        <div>
          <p className={t.toolKicker}>أداة متاحة لتخصصك</p>
          <h4 className={t.toolTitle}>{WORKSTATION_TITLE[spec]}</h4>
        </div>
        {processing && (
          <span className={t.toolTag}>
            <IconClock size={12} /> قيد التحليل
          </span>
        )}
      </header>

      <div className={t.toolBody}>
        <div className={t.actions}>
          {actions.map((a, idx) => (
            <button
              key={a.code}
              type="button"
              className={`${t.action} ${idx === 0 ? t.actionPrimary : ''}`}
              disabled={disabled || processing}
              onClick={() => onAction(a.code)}
            >
              <span className={t.actionIndex}>{spec === 'digital' ? String(idx + 1).padStart(2, '0') : '•'}</span>
              <span>{a.label}</span>
              <span className={t.actionGo} aria-hidden="true">
                ←
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
