// ============================================================
// src/app/page.tsx
// الأرشيف. القضايا المملوكة مفتوحة، غير المملوكة محجوبة (Redacted).
// Server Component — لا يصل للمتصفح إلا ما يُعرض فعلاً.
// ============================================================
import { createClient } from '@/lib/supabase/server';
import type { CaseSummary } from '@/types/database';
import ArchiveActions from './ArchiveActions';
import { getCaseContract, isCaseOpenForPlay } from '@/cases/registry';
import { devCaseAccess } from '@/server/cases/devAccess';

export const dynamic = 'force-dynamic';

export default async function ArchivePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: cases }, { data: owned }, { data: profile }] =
    await Promise.all([
      supabase
        .from('cases')
        .select(
          'id,title,victim_name,incident_date,classification,difficulty,duration_minutes,min_players,max_players,cover_path,price_cents',
        )
        .order('incident_date', { ascending: false }),
      supabase.from('entitlements').select('case_id'),
      supabase
        .from('profiles')
        .select('display_name,cases_closed')
        .eq('id', user?.id ?? '')
        .maybeSingle(),
    ]);

  const ownedIds = new Set((owned ?? []).map((e) => e.case_id as string));
  const list = (cases ?? []) as CaseSummary[];
  // قائمة الإنشاء = قضايا منشورة وقابلة للعب حسب سجل القضايا (أو قيد
  // التطوير لمطوّر مخوّل). قضية قيد الإعداد لا تُعرض كخيار تحقيق عادي.
  const dev = devCaseAccess();
  const playable = new Set(list.filter((c) => isCaseOpenForPlay(c.id, dev)).map((c) => c.id));
  // قضية قيد التطوير تحت next dev فقط: تُنشأ عبر /api/dev/session (بلا entitlement).
  const creatable = list
    .filter((c) => playable.has(c.id))
    .map((c) => ({ id: c.id, title: c.title, dev: process.env.NODE_ENV === 'development' && getCaseContract(c.id)?.status === 'development' }));

  return (
    <main className="shell">
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ fontSize: 'var(--t-2xl)' }}>أرشيف القضايا</h1>
        <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>
          {profile?.display_name ?? 'محقق'} · قضايا مغلقة:{' '}
          <span className="mono">{profile?.cases_closed ?? 0}</span>
        </p>
      </header>

      <hr className="rule" />

      <ArchiveActions cases={creatable} />

      <hr className="rule" />

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '1px' }}>
        {list.map((c) => {
          const isOwned = ownedIds.has(c.id);
          // قضية قيد التطوير: حقول القانون غير المحسومة (اسم الضحية، تاريخ
          // الحادثة، التصنيف…) لا تُعرض كحقيقة نهائية — عنوان + كود + الحالة فقط.
          // Server Component: ما لا يُعرض لا يصل للمتصفح.
          if (getCaseContract(c.id)?.status === 'development') {
            return (
              <li
                key={c.id}
                style={{
                  background: 'var(--ink-raised)',
                  padding: '1.25rem',
                  display: 'grid',
                  gap: '0.6rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  {/* تباعد الحروف في .stamp يفصل الحروف العربية — صفر هنا */}
                  <span className="stamp" style={{ letterSpacing: 0 }}>قيد التطوير</span>
                  <span className="mono muted" style={{ fontSize: 'var(--t-xs)' }} dir="ltr">
                    {c.id}
                  </span>
                </div>
                <h2 style={{ fontSize: 'var(--t-lg)' }}>{c.title}</h2>
                <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>
                  ملف القضية قيد الإعداد — تفاصيلها غير نهائية ولا تُعرض قبل اعتمادها.
                </p>
              </li>
            );
          }
          return (
            <li
              key={c.id}
              style={{
                background: 'var(--ink-raised)',
                padding: '1.25rem',
                display: 'grid',
                gap: '0.6rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <span className="stamp">{c.classification}</span>
                <span className="mono muted" style={{ fontSize: 'var(--t-xs)' }}>
                  {c.incident_date}
                </span>
              </div>

              <h2 style={{ fontSize: 'var(--t-lg)' }}>{c.title}</h2>

              <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>
                الضحية: {c.victim_name} · المدة التقديرية{' '}
                <span className="mono">{c.duration_minutes}</span> دقيقة ·{' '}
                {c.min_players}–{c.max_players} محققين
              </p>

              {!playable.has(c.id) ? (
                <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>
                  ملف القضية قيد الإعداد — غير متاح للتحقيق بعد.
                </p>
              ) : isOwned ? (
                <p style={{ fontSize: 'var(--t-sm)' }}>
                  متاحة لك. افتحها من &quot;افتح تحقيق جديد&quot; فوق.
                </p>
              ) : (
                <p style={{ fontSize: 'var(--t-sm)' }}>
                  <span className="redacted">
                    محتوى القضية غير متاح بدون صلاحية
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {list.length === 0 && (
        <p className="notice">ما في قضايا منشورة حالياً.</p>
      )}
    </main>
  );
}
