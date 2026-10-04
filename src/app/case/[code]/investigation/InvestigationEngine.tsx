// ============================================================
// src/app/case/[code]/investigation/InvestigationEngine.tsx
// محرك التفاعل التحقيقي — غرفة 714 + مكتب الأمن.
// العرض: RoomScene (المشهد الحقيقي أولاً) + InspectionDossier (ملف
// الفحص السياقي). المنطق أدناه (تحميل، realtime، معالجة، إجراءات)
// هو نفسه — تغيّر العرض فقط.
//
// المزامنة (src/lib/realtime/objectSync): حدث صف أو بث "تغيّر شيء" من زميل
// → إعادة جلب investigation_object_index (بوابة: جلب واحد بالتوازي، والإشارات
// أثناءه تُدمج). محتوى الحدث لا يصبح حالة واجهة أبداً. بعد فعل خاص ناجح
// نبثّ إشارة فارغة: اكتشاف الزميل الخاص لا يصل لغيره كحدث صف (RLS 022/026).
//
// يعتمد كلياً على RPCs آمنة: investigation_object_index،
// execute_object_interaction، share_object_discovery، challenge_index،
// object_workspace، run_challenge. كل فحص صلاحية بالسيرفر — هذا
// المكوّن عرض/تنقّل فقط. الـ realtime إشارة لإعادة الجلب، مش محتوى.
//
// المادة المستخرجة من أداة (إطار كاميرا، سجل) دليل حقيقي: تُفتح عبر
// evidence_index + EvidenceExaminationRoom نفسه (رابط وسائط موقّت آمن).
// ============================================================
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { subscribeAuthenticated } from '@/lib/supabase/realtime';
import { configureObjectSync, createRefetchGate, objectSyncTopic, signalObjectsChanged } from '@/lib/realtime/objectSync';
import type { EvidenceItem } from '@/types/case';
import type { InvestigationObject, ObjectWorkspace } from '@/types/investigationObjects';
import { parseWorkspace, translateInteractionError } from '@/types/investigationObjects';
import { translateChallengeError, type InvestigationChallenge } from '@/types/challenges';
import EvidenceExaminationRoom from '../evidence/EvidenceExaminationRoom';
import type { OpenTarget } from '@/lib/inquiry/types';
import { useCaseId } from '@/cases/CaseContext';
import { getCaseContract } from '@/cases/registry';
import { visibleEvidenceRows } from '@/lib/evidenceVisibility';
import { showsScene } from '../caseTabs';
import RoomScene from './scene/RoomScene';
import InspectionDossier from './InspectionDossier';
import CaseInquiry from './inquiry/CaseInquiry';
import { addFindingToBoard, readPinnedCodes, PIN_UNAVAILABLE_MESSAGE, SHARE_FIRST_MESSAGE } from './boardBridge';
import { usePlay } from '../play/PlayContext';
import { privateAncestors } from './labels';
import r from './scene/roomScene.module.css';

// "الدالة مش مثبّتة بعد" فقط = الميزة غير متاحة. أي خطأ ثاني لازم يبان.
function isNotInstalled(error: { code?: string } | null): boolean {
  return error !== null && (error.code === 'PGRST202' || error.code === '42883');
}

// إكمال المعالجة بالخلفية يصير عند القراءة (auto-advance بالسيرفر):
// طالما في عنصر قيد التحليل، إعادة قراءة دورية خفيفة تكشف النتيجة.
const PROCESSING_REFRESH_MS = 20_000;

export default function InvestigationEngine({
  sessionId,
  evidence = [],
  onNavigate,
  initialFocus,
}: {
  sessionId: string;
  /** ملف القضية كما يراه اللاعب (من مساحة العمل، متزامن حياً). */
  evidence?: readonly EvidenceItem[];
  /** "اسأل التحقيق" أو خيط قد يدلّ على تبويب آخر — اللاعب يفتحه بنفسه. */
  onNavigate?: (tab: 'interrogation') => void;
  /** "ارجع لمصدره" من لوحة التحقيق: عنصر يُركَّز عليه بعد التحميل — فقط إن كان ظاهراً لي. */
  initialFocus?: string | null;
}) {
  const contract = getCaseContract(useCaseId());
  const evidencePolicy = contract?.restrictedEvidence ?? 'hidden';
  const [objects, setObjects] = useState<InvestigationObject[]>([]);
  const [challenges, setChallenges] = useState<InvestigationChallenge[]>([]);
  const [workspaces, setWorkspaces] = useState<Record<string, ObjectWorkspace>>({});
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [readyCodes, setReadyCodes] = useState<Set<string>>(new Set());
  const [locationCode, setLocationCode] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [examining, setExamining] = useState<EvidenceItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // عرض فقط: أي عنصر كان "قيد التحليل" بالقراءة السابقة وصار لا → "جاهز".
  const processingRef = useRef<Set<string>>(new Set());
  const pendingFocusRef = useRef<string | null>(initialFocus ?? null);
  // قناة الجلسة المشتركة (للبث فقط بعد فعل ناجح مني) + بوابة الجلب.
  const channelRef = useRef<RealtimeChannel | null>(null);
  // بعد كل قراءة موثوقة للعناصر: تسوية المحرك (مادة تنتظر قارئها تصل الآن).
  const play = usePlay();
  const nudgeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    nudgeRef.current = play?.nudge ?? null;
  }, [play]);
  const refetchRef = useRef<{ trigger(): Promise<void> | void } | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [objs, ch, ws, pins] = await Promise.all([
      supabase.rpc('investigation_object_index', { p_session: sessionId }),
      supabase.rpc('challenge_index', { p_session: sessionId }),
      supabase.rpc('object_workspace', { p_session: sessionId }),
      readPinnedCodes(sessionId),
    ]);

    setChallenges(ch.error ? [] : ((ch.data ?? []) as InvestigationChallenge[]));
    setPinned(pins);

    const next: Record<string, ObjectWorkspace> = {};
    if (!ws.error) {
      for (const row of (ws.data ?? []) as { object_code: string; workspace: unknown }[]) {
        const parsed = parseWorkspace(row.workspace);
        if (parsed) next[row.object_code] = parsed;
      }
    }
    setWorkspaces(next);

    if (objs.error) {
      setError(translateInteractionError(objs.error.message));
    } else {
      const nextObjects = (objs.data ?? []) as InvestigationObject[];
      const finished = nextObjects.filter((o) => processingRef.current.has(o.code) && !o.processing).map((o) => o.code);
      processingRef.current = new Set(nextObjects.filter((o) => o.processing).map((o) => o.code));
      if (finished.length > 0) setReadyCodes((prev) => new Set([...prev, ...finished]));
      setObjects(nextObjects);
      nudgeRef.current?.();
      // تركيز قادم من سطح آخر: يُستهلك مرة واحدة، وفقط لعنصر أعرفه.
      const want = pendingFocusRef.current;
      if (want) {
        pendingFocusRef.current = null;
        // أي عنصر في فهرسي أنا (السيرفر لا يدرج ما لا يحق لي رؤيته) — اكتشاف
        // من اللوحة، أو اتجاه خيط نحو شيء ظاهر لي ولم يُفحص بعد.
        const target = nextObjects.find((o) => o.code === want);
        if (target) {
          const byCode = new Map(nextObjects.map((o) => [o.code, o]));
          let loc = target.category === 'location' ? target : target.parent_code ? byCode.get(target.parent_code) : undefined;
          for (let d = 0; loc && loc.category !== 'location' && d < 8; d += 1) loc = loc.parent_code ? byCode.get(loc.parent_code) : undefined;
          if (loc) setLocationCode(loc.code);
          if (target.category !== 'location') setFocused(target.code);
        }
      }
      const realError = [ch.error, ws.error].find((e) => e !== null && !isNotInstalled(e));
      setError(realError ? translateChallengeError(realError.message) : null);
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      await supabase.rpc('open_investigation', { p_session: sessionId });
      await load();
    })();
  }, [sessionId, load]);

  useEffect(() => {
    const gate = createRefetchGate(load);
    refetchRef.current = gate;
    const unsubscribe = subscribeAuthenticated(
      createClient(),
      objectSyncTopic(sessionId),
      (channel) => {
        channelRef.current = channel;
        return configureObjectSync(channel, sessionId, () => void gate.trigger());
      },
      () => void gate.trigger(),
    );
    return () => {
      gate.dispose();
      unsubscribe();
      channelRef.current = null;
      if (refetchRef.current === gate) refetchRef.current = null;
    };
  }, [sessionId, load]);

  /** بعد فعل ناجح مني: جلبي الموثوق + إشارة فارغة لبقية الفريق. */
  async function reloadAndSignal() {
    const gate = refetchRef.current;
    if (gate) await gate.trigger();
    else await load();
    signalObjectsChanged(channelRef.current, sessionId);
  }

  const anyProcessing = objects.some((o) => o.processing);
  useEffect(() => {
    if (!anyProcessing) return;
    const id = window.setInterval(() => void load(), PROCESSING_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [anyProcessing, load]);

  function flashError(message: string) {
    setError(message);
    window.setTimeout(() => setError(null), 3500);
  }

  function focus(code: string | null) {
    setFocused(code);
    if (code) {
      setReadyCodes((prev) => {
        if (!prev.has(code)) return prev;
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    }
  }

  async function runAction(objectCode: string, interactionCode: string) {
    setBusy(true);
    const { error: rpcError } = await createClient().rpc('execute_object_interaction', {
      p_session: sessionId,
      p_object_code: objectCode,
      p_interaction: interactionCode,
    });
    if (rpcError) flashError(translateInteractionError(rpcError.message));
    else await reloadAndSignal();
    setBusy(false);
  }

  // مشاركة اكتشاف داخل اكتشاف خاص بي (جواز داخل أغراض لم أشاركها): الفريق
  // لا يرى الابن بلا أصله (026) — فنشارك سلسلة أصولي الخاصة أولاً، من الأعلى،
  // بنفس الـ RPC (كلها اكتشافاتي أنا). لا شيء لزميل يُشارك نيابة عنه.
  async function share(objectCode: string) {
    setBusy(true);
    const supabase = createClient();
    let failed = false;
    for (const code of [...privateAncestors(objects, objectCode).map((o) => o.code), objectCode]) {
      const { error: rpcError } = await supabase.rpc('share_object_discovery', { p_session: sessionId, p_object_code: code });
      if (rpcError) {
        flashError(translateInteractionError(rpcError.message));
        failed = true;
        break;
      }
    }
    if (!failed) await reloadAndSignal();
    setBusy(false);
  }

  async function addToBoard(object: InvestigationObject) {
    setBusy(true);
    const result = await addFindingToBoard({
      sessionId,
      kind: object.category === 'location' ? 'location' : 'object',
      code: object.code,
      sharedWithTeam: object.is_shared,
    });
    if (result === 'pinned') setPinned((prev) => new Set(prev).add(object.code));
    else flashError(result === 'share_first' ? SHARE_FIRST_MESSAGE : result === 'unavailable' ? PIN_UNAVAILABLE_MESSAGE : 'ما قدرنا نضيفها للوحة. جرّب مرة ثانية.');
    setBusy(false);
  }

  // المادة المستخرجة: نفس evidence_index (صلاحية التخصص بالسيرفر).
  async function openEvidence(code: string) {
    const { data, error: rpcError } = await createClient().rpc('evidence_index', { p_session: sessionId });
    if (rpcError) return flashError(translateInteractionError(rpcError.message));
    // المخفي بسياسة القضية = غير موجود: نفس رد المرجع غير الصالح، بلا إشارة لوجوده.
    const item = visibleEvidenceRows((data ?? []) as EvidenceItem[], evidencePolicy).find((e) => e.code === code);
    if (!item) return flashError('هذا المصدر لم يعد متاحاً لك.');
    if (!item.readable) {
      return flashError('المادة محفوظة بملف القضية — يقرأها زميلك صاحب التخصص.');
    }
    setExamining(item);
  }

  // فتح مصدر من "اسأل التحقيق" — عبر المسارات الموجودة نفسها فقط.
  // عنصر غير موجود بحالتي الحالية = مرجع قديم/غير صالح، ما يُفتح.
  function openTarget(target: OpenTarget) {
    if (target.kind === 'evidence') return void openEvidence(target.code);
    if (target.kind === 'tab') return onNavigate?.(target.tab);
    if (!objects.some((o) => o.code === target.code)) return flashError('هذا المصدر لم يعد متاحاً لك.');
    if (target.location) setLocationCode(target.location);
    focus(target.code);
  }

  if (loading) {
    return (
      <main className={r.engine}>
        <p className={r.loading} role="status">
          جارٍ فتح موقع التحقيق…
        </p>
      </main>
    );
  }

  const byCode = new Map(objects.map((o) => [o.code, o]));
  const locations = objects.filter((o) => o.category === 'location');
  const location = locations.find((l) => l.code === locationCode) ?? locations[0];
  const items = objects.filter((o) => o.category !== 'location');
  // "جذر" = طفل مباشر للمكان المختار؛ فرعي = طفل لواحد من هالجذور.
  const roots = items.filter((o) => o.parent_code === location?.code);
  const childrenOf = (code: string) => items.filter((o) => o.parent_code === code);
  const focusedObject = focused ? byCode.get(focused) : undefined;

  // مسار العنصر المركّز: موقعه، وأصله لو كان اكتشافاً فرعياً.
  const parent = focusedObject?.parent_code ? byCode.get(focusedObject.parent_code) : undefined;
  const focusLocation = parent?.category === 'location' ? parent : parent?.parent_code ? byCode.get(parent.parent_code) : undefined;

  return (
    <main className={r.engine}>
      {showsScene(contract) && (
      <RoomScene
        sessionId={sessionId}
        locations={locations}
        location={location}
        roots={roots}
        childrenOf={childrenOf}
        byCode={byCode}
        focused={focusedObject}
        readyCodes={readyCodes}
        error={error}
        escapeEnabled={examining === null}
        onSelectLocation={setLocationCode}
        onFocus={focus}
        dossier={
          focusedObject ? (
            <InspectionDossier
              sessionId={sessionId}
              object={focusedObject}
              workspace={workspaces[focusedObject.code] ?? null}
              challenges={challenges.filter((c) => c.object_code === focusedObject.code)}
              evidence={evidence}
              locationTitle={focusLocation?.title ?? location?.title ?? 'موقع التحقيق'}
              parent={parent && parent.category !== 'location' ? parent : null}
              sharesWith={privateAncestors(objects, focusedObject.code).map((o) => o.title)}
              discoveries={childrenOf(focusedObject.code)}
              readyCodes={readyCodes}
              pinned={pinned.has(focusedObject.code)}
              busy={busy}
              onAction={(code) => void runAction(focusedObject.code, code)}
              onShare={() => void share(focusedObject.code)}
              onAddToBoard={() => void addToBoard(focusedObject)}
              onChallengeSolved={() => void reloadAndSignal()}
              onOpenEvidence={(code) => void openEvidence(code)}
              onFocus={focus}
              onClose={() => focus(null)}
            />
          ) : null
        }
      />
      )}

      {contract?.ai.groundedSearch && <CaseInquiry sessionId={sessionId} onOpen={openTarget} />}

      {examining && (
        <EvidenceExaminationRoom
          key={examining.code}
          sessionId={sessionId}
          item={examining}
          onClose={() => setExamining(null)}
        />
      )}
    </main>
  );
}
