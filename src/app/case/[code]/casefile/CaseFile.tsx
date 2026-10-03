// ============================================================
// src/app/case/[code]/casefile/CaseFile.tsx
// ملف القضية — طاولة فحص + أرشيف أدراج. يجمع مصدرين بصرياً بدون
// دمجهما بقاعدة بيانات:
//   - أدلة حقيقية (evidence_index، prop من CaseWorkspace)
//   - مواد عناصر تحقيقية (investigation_object_index، جلب/اشتراك هون)
// لا شي غير مكتشف، لا أكواد، لا عدّادات، لا نسب إنجاز.
// ============================================================
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { subscribeAuthenticated } from '@/lib/supabase/realtime';
import type { EvidenceItem } from '@/types/case';
import type { InvestigationObject } from '@/types/investigationObjects';
import { translateInteractionError } from '@/types/investigationObjects';
import { addFindingToBoard, readBoardPins, CHANNEL_PRIVATE_MESSAGE, PIN_UNAVAILABLE_MESSAGE, SHARE_FIRST_MESSAGE } from '../investigation/boardBridge';
import { isReviewed } from '../evidence/reviewed';
import EvidenceFocus from './EvidenceFocus';
import Spotlight, { type SpotlightMode } from './Spotlight';
import ArtifactTile from './ArtifactTile';
import { markOpened, readOpened } from './viewerMarks';
import {
  buildEntries,
  SECTION_META,
  SECTION_ORDER,
  type CaseFileEntry,
  type EvidenceSource,
} from './caseFileModel';
import { useCasePresentation } from '@/cases/CaseContext';
import s from './casefile.module.css';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function CaseFile({
  sessionId,
  caseTitle,
  evidence,
  privateEvidence = [],
}: {
  sessionId: string;
  caseTitle: string;
  evidence: EvidenceItem[];
  /** أدلة أقرؤها خاصة بقناتي (إرشاد السيرفر) — لا يُعرض لها تثبيت. */
  privateEvidence?: readonly string[];
}) {
  // هوية/مصدر مدخلات العناصر من عرض القضية الحالية فقط.
  const { objectProfiles } = useCasePresentation();
  const [objects, setObjects] = useState<InvestigationObject[]>([]);
  const [sources, setSources] = useState<EvidenceSource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<Set<string>>(() => readOpened(sessionId));
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  // ترتيب الوصول: رقم متصاعد لكل مادة (أو نسخة جديدة منها). أول تحميل = الأساس.
  const [arrival, setArrival] = useState<Record<string, number>>({});
  const [baselineMax, setBaselineMax] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evidenceRef = useRef(evidence);
  const knownRef = useRef<Set<string> | null>(null);
  /** معرّفات قطع المواد على اللوحة — لتمييز أحداث الحذف (غير قابلة للتصفية بالجلسة). */
  const pinIdsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data }, pins, prov] = await Promise.all([
      supabase.rpc('investigation_object_index', { p_session: sessionId }),
      readBoardPins(sessionId),
      supabase.rpc('evidence_provenance', { p_session: sessionId }),
    ]);
    const nextObjects = (data ?? []) as InvestigationObject[];
    // قبل تطبيق 025 الدالة غير موجودة → بدون مصادر (سلوك المرحلة 3 نفسه).
    const nextSources = prov.error ? [] : ((prov.data ?? []) as EvidenceSource[]);
    if (prov.error && prov.error.code !== 'PGRST202' && prov.error.code !== '42883') {
      setError(translateInteractionError(prov.error.message));
    }
    const current = buildEntries(evidenceRef.current, nextObjects, nextSources, objectProfiles).sort((x, y) => {
      const ex = x.source.kind === 'evidence' ? x.source.item.unlocked_at : '￿';
      const ey = y.source.kind === 'evidence' ? y.source.item.unlocked_at : '￿';
      return ex.localeCompare(ey);
    });

    setObjects(nextObjects);
    setSources(nextSources);
    pinIdsRef.current = pins.itemIds;
    setPinned(pins.codes);
    setReviewed(new Set(current.filter((e) => isReviewed(sessionId, e.code)).map((e) => e.code)));
    setArrival((prev) => {
      let n = Object.values(prev).reduce((m, v) => Math.max(m, v), 0);
      let changed = false;
      const next = { ...prev };
      for (const e of current) {
        if (next[e.revisionKey] === undefined) {
          next[e.revisionKey] = ++n;
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    const prevKnown = knownRef.current;
    knownRef.current = new Set(current.map((e) => e.revisionKey));
    if (prevKnown === null) {
      setBaselineMax(current.length);
    } else {
      const fresh = current.filter((e) => !prevKnown.has(e.revisionKey));
      if (fresh.length > 0) {
        setAnnouncement(`اكتشاف جديد في ملف القضية: ${fresh.map((e) => e.title).join('، ')}`);
      }
    }
    setLoaded(true);
  }, [sessionId, objectProfiles]);

  useEffect(() => {
    evidenceRef.current = evidence;
    void (async () => {
      await load();
    })();
  }, [evidence, load]);

  useEffect(() => {
    const refreshPins = () =>
      void readBoardPins(sessionId).then((p) => {
        pinIdsRef.current = p.itemIds;
        setPinned(p.codes);
      });
    const filter = `session_id=eq.${sessionId}`;
    return subscribeAuthenticated(
      createClient(),
      `casefile:${sessionId}`,
      (channel) =>
        channel
          .on('postgres_changes', { event: '*', schema: 'public', table: 'session_object_state', filter }, () => void load())
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'board_items', filter }, refreshPins)
          // الحذف لا يُصفّى بالجلسة ويحمل المفتاح فقط: نعيد القراءة إن كان من لوحتي.
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'board_items' }, (payload) => {
            const id = (payload.old as { id?: unknown } | null)?.id;
            if (typeof id === 'string' && pinIdsRef.current.has(id)) refreshPins();
          }),
      () => void load(),
    );
  }, [sessionId, load]);

  const entries = buildEntries(evidence, objects, sources, objectProfiles, privateEvidence);
  const order = (e: CaseFileEntry) => arrival[e.revisionKey] ?? Number.MAX_SAFE_INTEGER;
  const newestFirst = [...entries].sort((x, y) => order(y) - order(x));
  const hero = newestFirst.find((e) => !opened.has(e.revisionKey)) ?? newestFirst[0];
  const heroMode: SpotlightMode = !hero
    ? 'latest'
    : baselineMax !== null && order(hero) > baselineMax
      ? 'live'
      : !opened.has(hero.revisionKey)
        ? 'unopened'
        : 'latest';

  const sections = SECTION_ORDER.map((section) => ({
    section,
    items: newestFirst.filter((e) => e.section === section),
  })).filter((g) => g.items.length > 0);

  const focused = focusedKey ? entries.find((e) => e.key === focusedKey) : undefined;

  function flash(message: string) {
    setError(message);
    window.setTimeout(() => setError(null), 3500);
  }

  function open(entry: CaseFileEntry) {
    setOpened(markOpened(sessionId, entry.revisionKey));
    setFocusedKey(entry.key);
  }

  function close() {
    setFocusedKey(null);
    setReviewed(new Set(entries.filter((e) => isReviewed(sessionId, e.code)).map((e) => e.code)));
  }

  async function pin(entry: CaseFileEntry) {
    if (entry.channelPrivate) return flash(CHANNEL_PRIVATE_MESSAGE);
    setBusy(true);
    const result = await addFindingToBoard({
      sessionId,
      kind: entry.source.kind === 'evidence' ? 'evidence' : entry.source.item.category === 'location' ? 'location' : 'object',
      code: entry.code,
      sharedWithTeam: entry.source.kind === 'evidence' || entry.source.item.is_shared,
    });
    if (result === 'pinned') setPinned((prev) => new Set(prev).add(entry.code));
    else flash(result === 'share_first' ? SHARE_FIRST_MESSAGE : result === 'unavailable' ? PIN_UNAVAILABLE_MESSAGE : 'ما قدرنا نثبّتها على اللوحة. جرّب مرة ثانية.');
    setBusy(false);
  }

  async function share(entry: CaseFileEntry) {
    if (entry.source.kind !== 'object') return;
    setBusy(true);
    const { error: rpcError } = await createClient().rpc('share_object_discovery', {
      p_session: sessionId,
      p_object_code: entry.source.item.code,
    });
    if (rpcError) flash(translateInteractionError(rpcError.message));
    else await load();
    setBusy(false);
  }

  function jumpTo(section: string) {
    document
      .getElementById(`cf-${section}`)
      ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  const canShare = (e: CaseFileEntry) => e.source.kind === 'object' && e.privateToMe;

  return (
    <div className={s.root}>
      <div className={`${s.file} ${focused ? s.receding : ''}`}>
        <header className={s.header}>
          <div className={s.headerText}>
            <p className={s.headerKicker}>{caseTitle}</p>
            <h1 className={s.headerTitle}>ملف القضية</h1>
            <p className={s.headerNote}>كل ما اكتشفته بنفسك، وكل ما شاركه فريقك معك.</p>
          </div>
          <span className={`stamp ${s.headerStamp}`}>سرّي</span>
        </header>

        <p className={s.srOnly} aria-live="polite">
          {announcement}
        </p>

        {error && <p className={`notice ${s.flash}`}>{error}</p>}

        {!loaded ? (
          <p className={s.loading}>عم نفتح الملف…</p>
        ) : entries.length === 0 ? (
          <div className={s.empty}>
            <span className={s.emptyFolder} aria-hidden="true" />
            <p className={s.emptyTitle}>الملف لسا فاضي</p>
            <p className={s.emptyNote}>كل ما تكتشفه بالتحقيق، أو يشاركه فريقك معك، بيدخل هون.</p>
          </div>
        ) : (
          <>
            {hero && (
              <Spotlight
                key={hero.revisionKey}
                sessionId={sessionId}
                entry={hero}
                mode={heroMode}
                unopened={!opened.has(hero.revisionKey)}
                reviewed={reviewed.has(hero.code)}
                pinned={pinned.has(hero.code)}
                busy={busy}
                canShare={canShare(hero)}
                onOpen={() => open(hero)}
                onPin={() => void pin(hero)}
                onShare={() => void share(hero)}
              />
            )}

            <div className={s.archive}>
              <nav className={s.index} aria-label="أقسام ملف القضية">
                {sections.map(({ section, items }, i) => (
                  <button key={section} type="button" className={s.indexLink} onClick={() => jumpTo(section)}>
                    <span className={s.indexNo}>{String(i + 1).padStart(2, '0')}</span>
                    <span>{SECTION_META[section].title}</span>
                    {items.some((e) => !opened.has(e.revisionKey)) && (
                      <span className={s.indexDot} title="فيها مواد لم تفحصها بعد" />
                    )}
                  </button>
                ))}
              </nav>

              <div className={s.drawers}>
                {sections.map(({ section, items }, i) => (
                  <section key={section} id={`cf-${section}`} className={s.drawer} aria-labelledby={`cf-h-${section}`}>
                    <header className={s.drawerHead}>
                      <span className={s.drawerNo}>{String(i + 1).padStart(2, '0')}</span>
                      <h2 id={`cf-h-${section}`} className={s.drawerTitle}>
                        {SECTION_META[section].title}
                      </h2>
                      <p className={s.drawerNote}>{SECTION_META[section].note}</p>
                    </header>
                    <div className={s.grid}>
                      {items.map((e) => (
                        <ArtifactTile
                          key={e.key}
                          sessionId={sessionId}
                          entry={e}
                          unopened={!opened.has(e.revisionKey)}
                          reviewed={reviewed.has(e.code)}
                          pinned={pinned.has(e.code)}
                          onOpen={() => open(e)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {focused && (
        <EvidenceFocus
          sessionId={sessionId}
          entry={focused}
          pinned={pinned.has(focused.code)}
          reviewed={reviewed.has(focused.code)}
          busy={busy}
          canShare={canShare(focused)}
          onShare={() => void share(focused)}
          onPin={() => void pin(focused)}
          onClose={close}
        />
      )}
    </div>
  );
}
