// ============================================================
// src/app/case/[code]/investigation/AccessGate.tsx
// لوحة نظام دخول (باب/نظام مقفل): حالة القفل + نوع وسيلة الدخول +
// طرق الدخول المتاحة (لو في). طرق الدخول تأتي فقط من محتوى القضية —
// ما في طرق مُخترعة. سجل الدخول نفسه أداة استعلام منفصلة (تحدٍّ).
// ============================================================
'use client';

import { IconDoor, IconLock, IconUnlock } from './icons';
import t from './tools.module.css';

export type AccessState = 'LOCKED' | 'ACCESS_METHOD_AVAILABLE' | 'OPENED';

const ACCESS_LABEL: Record<AccessState, string> = {
  LOCKED: 'مقفل',
  ACCESS_METHOD_AVAILABLE: 'طريقة دخول متاحة',
  OPENED: 'مفتوح',
};

export interface AccessMethod {
  code: string;
  label: string;
}

export default function AccessGate({
  state,
  credential,
  methods,
  onUseMethod,
  disabled,
}: {
  state: AccessState;
  credential?: string | null;
  methods: AccessMethod[];
  onUseMethod: (code: string) => void;
  disabled: boolean;
}) {
  return (
    <section className={t.tool} data-tool="access" aria-label="نظام الدخول">
      <header className={t.toolHead}>
        <span className={t.toolIcon}>
          <IconDoor size={17} />
        </span>
        <div>
          <p className={t.toolKicker}>نظام التحكّم بالدخول</p>
          <h4 className={t.toolTitle}>حالة الدخول</h4>
        </div>
      </header>

      <div className={t.toolBody}>
        <div className={t.lockGrid}>
          <div className={t.lockCell}>
            <span className={t.lockLabel}>القفل</span>
            <span className={t.lockValue} data-state={state}>
              {state === 'OPENED' ? <IconUnlock size={15} /> : <IconLock size={15} />}
              {ACCESS_LABEL[state]}
            </span>
          </div>
          {credential && (
            <div className={t.lockCell}>
              <span className={t.lockLabel}>وسيلة الدخول</span>
              <span className={t.lockValue}>{credential}</span>
            </div>
          )}
        </div>

        {state === 'ACCESS_METHOD_AVAILABLE' && methods.length > 0 && (
          <div className={t.actions}>
            {methods.map((m) => (
              <button key={m.code} type="button" className={t.action} disabled={disabled} onClick={() => onUseMethod(m.code)}>
                <span className={t.actionIndex}>•</span>
                <span>{m.label}</span>
                <span className={t.actionGo} aria-hidden="true">
                  ←
                </span>
              </button>
            ))}
          </div>
        )}

        {state === 'LOCKED' && methods.length === 0 && (
          <p className={t.toolPrompt}>لا توجد طريقة دخول معروفة حتى الآن.</p>
        )}
      </div>
    </section>
  );
}
