// ============================================================
// src/app/case/[code]/investigation/boardBridge.ts
// تثبيت مادة على لوحة التحقيق المشتركة من خارج اللوحة (المشهد، ملف القضية).
//
// نفس طريق اللوحة نفسها: Board V2 (sql/031) — RPC pin_board_material
// للكتابة، وقراءة board_items (RLS). جداول اللوحة القديمة لا تُستعمل.
//   • يُخزَّن المرجع فقط (نوع + كود) — لا عنوان ولا نص مادة أبداً؛ كل لاعب
//     يرى العنوان من بياناته هو المصرّح بها.
//   • اكتشافي الخاص لا يُثبَّت حتى يُشارَك بقاعدة اللعبة (share_object_discovery).
//     الفحص هنا للتجربة فقط؛ السيرفر يرفض ما لا يعرفه الفريق (NOT_PINNABLE).
// اختيار اللاعب — لا تثبيت تلقائي، لا ربط تلقائي، لا حكم على المعنى.
// ============================================================
'use client';

import { createClient } from '@/lib/supabase/client';
import { nextSpot, type MaterialKind } from '../board/boardModel';
import { createBoardStore, type BoardClient } from '../board/boardStore';

export type PinResult = 'pinned' | 'share_first' | 'unavailable' | 'failed';

export async function addFindingToBoard(params: {
  sessionId: string;
  kind: MaterialKind;
  code: string;
  /** لعنصر تحقيق: هل هو مشترك مع الفريق؟ (الأدلة المفتوحة ظاهرة للفريق أصلاً) */
  sharedWithTeam: boolean;
}): Promise<PinResult> {
  if (params.kind !== 'evidence' && !params.sharedWithTeam) return 'share_first';
  const supabase = createClient();
  const { count } = await supabase.from('board_items').select('id', { count: 'exact', head: true }).eq('session_id', params.sessionId);
  const spot = nextSpot(count ?? 0);
  const outcome = await createBoardStore(supabase as unknown as BoardClient, params.sessionId).pinMaterial(
    { kind: params.kind, code: params.code },
    spot.x,
    spot.y,
  );
  return outcome === 'pinned' ? 'pinned' : outcome === 'not_pinnable' ? 'unavailable' : 'failed';
}

/** المواد المثبّتة حالياً على لوحة الجلسة: أكوادها، ومعرّفات صفوفها (لأحداث الحذف). */
export async function readBoardPins(sessionId: string): Promise<{ codes: Set<string>; itemIds: Set<string> }> {
  const supabase = createClient();
  const { data } = await supabase.from('board_items').select('id, material_code').eq('session_id', sessionId).eq('kind', 'material');
  const rows = (data ?? []) as { id: string; material_code: string | null }[];
  return {
    codes: new Set(rows.map((r) => r.material_code).filter((c): c is string => !!c)),
    itemIds: new Set(rows.map((r) => r.id)),
  };
}

export async function readPinnedCodes(sessionId: string): Promise<Set<string>> {
  return (await readBoardPins(sessionId)).codes;
}

export const SHARE_FIRST_MESSAGE = 'هذا اكتشافك الخاص — شاركه مع الفريق أولاً، فاللوحة مشتركة.';
export const PIN_UNAVAILABLE_MESSAGE = 'هذه المادة غير متاحة للوحة.';
export const CHANNEL_PRIVATE_MESSAGE = 'هذه المادة خاصة بك — لا تُثبَّت على اللوحة المشتركة. ساهم بها في ربط مشترك من لوحة التحقيق دون كشفها.';
