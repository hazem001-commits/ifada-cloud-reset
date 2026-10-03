// ============================================================
// src/app/case/[code]/ui/Surface.tsx
// عناصر الأساس المشتركة لأسطح التحقيق: رأس السطح (نمط التحقيق الحالي)
// وحالة السطح (تحميل / فراغ / غير متاح لك / خطأ) بمفردات واحدة.
// "غير متاح لك" ليست خطأ: هي عدم تماثل مقصود بين اللاعبين.
// ============================================================
import type { ReactNode } from 'react';
import s from './ui.module.css';

export function SurfaceHeader({
  mode,
  title,
  lede,
  actions,
}: {
  /** نمط التحقيق الحالي (المكان، المادة، الملف، اللوحة، المواجهة…). */
  mode: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
}) {
  return (
    <header className={s.header}>
      <div className={s.headText}>
        <span className={s.eyebrow}>{mode}</span>
        <h2 className={s.title}>{title}</h2>
        {lede && <p className={s.lede}>{lede}</p>}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </header>
  );
}

export type StateVariant = 'loading' | 'empty' | 'unavailable' | 'error';

export function SurfaceState({
  variant,
  title,
  children,
  action,
}: {
  variant: StateVariant;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={s.state} data-variant={variant} role={variant === 'error' ? 'alert' : 'status'}>
      {variant === 'loading' && <span className={s.pulse} aria-hidden="true" />}
      {title && <strong className={s.stateTitle}>{title}</strong>}
      {children}
      {action}
    </div>
  );
}

export const toolClass = s.tool;
