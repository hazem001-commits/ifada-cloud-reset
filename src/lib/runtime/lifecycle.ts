// ============================================================
// src/lib/runtime/lifecycle.ts
// دورات الحياة الصريحة — مرآة نقية لما تفعله sql/037 (و019/026
// للاكتشاف). كل انتقال غير مسموح يرجع خطأ بدل أن يُفترض.
//
//   Discovery:   latent → private → shared        (أو latent → shared مباشرة لاكتشاف جماعي)
//   Lead:        latent → open_private | open_team
//                open_private → shared (مشاركة) → followed → closed
//                أي مرحلة مفتوحة → closed (صار قديماً بعد تغيّر العالم)
//   World state: unreached → reached (مرة واحدة، لا رجوع)
// ============================================================
import type { LeadPhase, LeadStatus } from './types';

// ------------------------------------------------------------
// Discovery
// ------------------------------------------------------------
export type DiscoveryPhase = 'latent' | 'private' | 'shared';
export type DiscoveryEvent = 'discover_private' | 'discover_team' | 'share';

export function discoveryTransition(phase: DiscoveryPhase, event: DiscoveryEvent): DiscoveryPhase | { error: string } {
  if (phase === 'latent' && event === 'discover_private') return 'private';
  if (phase === 'latent' && event === 'discover_team') return 'shared';
  if (phase === 'private' && event === 'share') return 'shared';
  // إعادة الاكتشاف/المشاركة لا تغيّر شيئاً (نفس on conflict do nothing)
  if (phase === 'private' && event === 'discover_private') return 'private';
  if (phase === 'shared' && (event === 'share' || event === 'discover_team' || event === 'discover_private')) return 'shared';
  if (phase === 'private' && event === 'discover_team') return 'shared';
  return { error: `INVALID_DISCOVERY_TRANSITION:${phase}:${event}` };
}

/** مرحلة اكتشاف من صف عنصر كما يراه اللاعب. */
export function discoveryPhaseOf(row: { discovered: boolean; is_shared: boolean; state: string } | null | undefined): DiscoveryPhase {
  if (!row || !row.discovered || row.state === 'HIDDEN') return 'latent';
  return row.is_shared ? 'shared' : 'private';
}

// ------------------------------------------------------------
// Lead — نفس أعمدة session_leads
// ------------------------------------------------------------
export interface LeadRecord {
  /** null = خيط فريق منذ ولادته؛ holder + shared = كان خاصاً ثم شورك. */
  holder: string | null;
  shared: boolean;
  status: LeadStatus;
  followed: boolean;
}

export type LeadEvent =
  | { kind: 'open'; scope: 'actor'; actor: string }
  | { kind: 'open'; scope: 'team' }
  | { kind: 'share'; by: string }
  | { kind: 'follow'; scope: 'actor' | 'team'; actor?: string }
  | { kind: 'close'; scope: 'actor' | 'team'; actor?: string };

export function leadPhase(l: LeadRecord | null): LeadPhase {
  if (!l) return 'latent';
  if (l.status === 'closed') return 'closed';
  if (l.followed) return 'followed';
  if (!l.shared) return 'open_private';
  return l.holder === null ? 'open_team' : 'shared';
}

/** يمكن لهذا الأثر أن يلمس الخيط؟ (فريق: المشترك فقط. لاعب: خيطه هو غير المشترك فقط.) */
function canTouch(l: LeadRecord, scope: 'actor' | 'team', actor?: string): boolean {
  return scope === 'team' ? l.shared : !l.shared && !!actor && l.holder === actor;
}

export function applyLeadEvent(l: LeadRecord | null, e: LeadEvent): LeadRecord | { error: string } {
  switch (e.kind) {
    case 'open':
      if (l) return l; // خيط واحد لكل جلسة: الفتح الثاني لا يغيّر شيئاً
      return e.scope === 'team'
        ? { holder: null, shared: true, status: 'open', followed: false }
        : { holder: e.actor, shared: false, status: 'open', followed: false };
    case 'share':
      if (!l || !(l.shared || l.holder === e.by)) return { error: 'LEAD_NOT_FOUND' };
      return { ...l, shared: true };
    case 'follow':
      if (!l || !canTouch(l, e.scope, e.actor)) return l ?? { error: 'LEAD_NOT_FOUND' };
      return { ...l, followed: true, status: l.status === 'closed' ? 'closed' : 'followed' };
    case 'close':
      if (!l || !canTouch(l, e.scope, e.actor)) return l ?? { error: 'LEAD_NOT_FOUND' };
      return { ...l, status: 'closed' };
  }
}

export const isLeadError = (v: LeadRecord | { error: string }): v is { error: string } => 'error' in v;

// ------------------------------------------------------------
// World state — رتيب: يُبلغ مرة واحدة ولا يُلغى
// ------------------------------------------------------------
export function reachWorldState(reached: ReadonlySet<string>, state: string): { reached: Set<string>; changed: boolean } {
  if (reached.has(state)) return { reached: new Set(reached), changed: false };
  return { reached: new Set([...reached, state]), changed: true };
}
