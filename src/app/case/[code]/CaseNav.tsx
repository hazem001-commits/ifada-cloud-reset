// ============================================================
// src/app/case/[code]/CaseNav.tsx
// رأس القضية: هوية خفيفة (القضية، رمز الغرفة، تخصصك) + تنقّل
// بدرجتين (أساسي بارز / لاحق أهدأ). نفس التبويبات ونفس setTab.
// لا عدّاد أدلة ولا نسبة تقدّم (قرار المنتج: لا قوائم ولا أرقام متبقية).
// ============================================================
'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { specLabel, type Specialization } from '@/types/database';
import { useCaseId } from '@/cases/CaseContext';
import { getCaseContract } from '@/cases/registry';
import { caseTabEnabled, investigationTabLabel } from './caseTabs';
import s from './caseNav.module.css';

export type CaseTab =
  | 'investigation'
  | 'casefile'
  | 'evidence'
  | 'board'
  | 'reconstruction'
  | 'interrogation'
  | 'hearing';

interface TabDef {
  id: CaseTab;
  label: string;
  tag?: string;
}

export default function CaseNav({
  tab,
  onTab,
  caseTitle,
  roomCode,
  specs,
  sessionClosed,
  aside,
}: {
  tab: CaseTab;
  onTab: (tab: CaseTab) => void;
  caseTitle: string;
  roomCode: string;
  /** تخصصاتي الفعلية (الأساسي أولاً) — من my_specializations. */
  specs: Specialization[];
  sessionClosed: boolean;
  aside: ReactNode;
}) {
  // مسار التحقيق الذهني: المكان → المادة/ملف القضية → اللوحة → الادعاء.
  // ليس معالجاً خطوة بخطوة: التنقل حر، لكن الترتيب والعلامات تقول للاعب
  // أين هو وبأي نمط تحقيق. الأدلة القديمة أرشيف منفصل وهادئ.
  const contract = getCaseContract(useCaseId());
  const allGroups: { key: string; label: string; className: string; tabs: TabDef[] }[] = [
    {
      key: 'core',
      label: 'مسار التحقيق',
      className: s.core ?? '',
      tabs: [
        { id: 'investigation', label: investigationTabLabel(contract) },
        { id: 'casefile', label: 'ملف القضية' },
        { id: 'board', label: 'لوحة التحقيق' },
      ],
    },
    {
      key: 'claim',
      label: 'المواجهة والادعاء',
      className: s.later ?? '',
      tabs: [
        { id: 'interrogation', label: 'الاستجواب' },
        { id: 'reconstruction', label: 'إعادة البناء' },
        { id: 'hearing', label: sessionClosed ? 'النتيجة' : 'جلسة الاستماع' },
      ],
    },
    {
      key: 'archive',
      label: 'أرشيف',
      className: `${s.later ?? ''} ${s.archive ?? ''}`,
      tabs: [{ id: 'evidence', label: 'الأدلة القديمة' }],
    },
  ];
  // فقط ما تفعّله القضية بعقدها؛ مجموعة بلا تبويبات لا تُعرض.
  const groups = allGroups
    .map((g) => ({ ...g, tabs: g.tabs.filter((t) => caseTabEnabled(t.id, contract)) }))
    .filter((g) => g.tabs.length > 0);

  // شريط التبويبات على الهاتف يُمرَّر أفقياً عن قصد: الحافة تتلاشى فقط حيث
  // يوجد المزيد (بداية/نهاية)، والتبويب النشط يُسحب دائماً إلى المشهد.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => {
      const max = nav.scrollWidth - nav.clientWidth;
      const pos = Math.abs(nav.scrollLeft); // RTL: scrollLeft سالب في كروميوم/سفاري
      nav.dataset.more = max <= 2 ? 'none' : pos <= 2 ? 'end' : pos >= max - 2 ? 'start' : 'both';
    };
    update();
    nav.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    return () => {
      nav.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);
  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
  }, [tab]);

  return (
    <header className={s.bar}>
      <div className={s.identity}>
        <strong className={s.caseTitle}>{caseTitle}</strong>
        <span className={s.caseMeta}>
          <span className={s.caseCode}>{roomCode}</span>
          <span aria-hidden="true">·</span>
          <span className={s.specs}>
            {specs.length > 1 ? 'تخصصاتك' : 'تخصصك'}
            <span className={s.specNames}>{specs.map((sp) => specLabel(sp)).join(' · ')}</span>
          </span>
        </span>
      </div>

      <nav ref={navRef} className={s.nav} aria-label="أقسام القضية" data-more="none">
        {groups.map((g) => (
          <div key={g.key} className={`${s.group} ${g.className}`} role="group" aria-label={g.label}>
            {g.tabs.map((t, i) => (
              <span key={t.id} className={s.step}>
              {g.key === 'core' && i > 0 && (
                <span className={s.flowSep} aria-hidden="true">
                  ←
                </span>
              )}
              <button
                type="button"
                className={s.tab}
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => onTab(t.id)}
              >
                {t.label}
                {t.tag && <span className={s.tag}>{t.tag}</span>}
              </button>
              </span>
            ))}
          </div>
        ))}
      </nav>

      <div className={s.aside}>{aside}</div>
    </header>
  );
}
