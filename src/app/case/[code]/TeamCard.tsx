// ============================================================
// src/app/case/[code]/TeamCard.tsx
// بطاقة "إغلاق القضية" القابلة للمشاركة. مرسومة بـ Canvas —
// بدون مكتبات خارجية. هذي هي أداة الانتشار الفيروسي.
// ============================================================
'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { LobbyMember } from '@/types/database';
import { OVERALL_LABEL, type OverallTier } from '@/types/verdict';
import { useCaseId } from '@/cases/CaseContext';
import { getCaseContract } from '@/cases/registry';
import { visibleEvidenceRows } from '@/lib/evidenceVisibility';
import type { EvidenceItem } from '@/types/case';

interface Stats {
  minutesTaken: number;
  evidenceFound: number;
  evidenceTotal: number;
  topCharacter: string | null;
  topCharacterQuestions: number;
}

const RANKS: Array<{ max: number; tier: OverallTier; title: string }> = [
  { max: 60, tier: 'proven', title: 'محقق نخبة' },
  { max: 100, tier: 'proven', title: 'محقق محترف' },
  { max: 999, tier: 'proven', title: 'محقق مثابر' },
  { max: 999, tier: 'true_but_unproven', title: 'محقق حدسي' },
  { max: 999, tier: 'wrong_reconstruction', title: 'محقق مبتدئ' },
];

function pickRank(tier: OverallTier, minutes: number): string {
  const candidates = RANKS.filter((r) => r.tier === tier);
  const hit = candidates.find((r) => minutes <= r.max) ?? candidates[candidates.length - 1];
  return hit?.title ?? 'محقق';
}

export default function TeamCard({
  sessionId,
  caseTitle,
  overall,
  members,
  startedAt,
}: {
  sessionId: string;
  caseTitle: string;
  overall: OverallTier;
  members: LobbyMember[];
  startedAt: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const policy = getCaseContract(useCaseId())?.restrictedEvidence ?? 'hidden';
  const [stats, setStats] = useState<Stats | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();

      const [evIdx, log] = await Promise.all([
        supabase.rpc('evidence_index', { p_session: sessionId }),
        supabase
          .from('interrogation_log')
          .select('character_code')
          .eq('session_id', sessionId)
          .eq('speaker', 'player'),
      ]);

      // لا عدّ لما هو مخفي عني (سياسة القضية) — لا تسريب عدد.
      const total = visibleEvidenceRows((evIdx.data ?? []) as EvidenceItem[], policy).length;
      const found = total; // كل صف بـ evidence_index هو أصلاً مفتوح

      const counts = new Map<string, number>();
      for (const row of (log.data ?? []) as Array<{ character_code: string }>) {
        counts.set(row.character_code, (counts.get(row.character_code) ?? 0) + 1);
      }
      let top: string | null = null;
      let topCount = 0;
      for (const [k, v] of counts) {
        if (v > topCount) {
          top = k;
          topCount = v;
        }
      }

      const minutes = startedAt
        ? Math.max(1, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000))
        : 0;

      setStats({
        minutesTaken: minutes,
        evidenceFound: found,
        evidenceTotal: total,
        topCharacter: top,
        topCharacterQuestions: topCount,
      });
    })();
  }, [sessionId, startedAt, policy]);

  useEffect(() => {
    if (!stats) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 1080;
    const H = 1350;
    canvas.width = W;
    canvas.height = H;

    ctx.fillStyle = '#0c1116';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#212b34';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, W - 80, H - 80);

    ctx.textAlign = 'center';

    const label = OVERALL_LABEL[overall];
    ctx.fillStyle = overall === 'proven' ? '#e0a33e' : '#a33529';
    ctx.font = '600 28px monospace';
    ctx.fillText(overall === 'proven' ? 'CASE CLOSED' : 'CASE REVIEWED', W / 2, 140);

    ctx.fillStyle = '#d9d4c7';
    ctx.font = '600 52px sans-serif';
    ctx.fillText(caseTitle, W / 2, 230);

    ctx.font = '400 30px sans-serif';
    ctx.fillStyle = '#8f979e';
    wrapText(ctx, label.title, W / 2, 290, W - 200, 38);

    const rank = pickRank(overall, stats.minutesTaken);
    ctx.fillStyle = '#e0a33e';
    ctx.font = '600 40px sans-serif';
    ctx.fillText(rank, W / 2, 420);

    ctx.strokeStyle = '#212b34';
    ctx.beginPath();
    ctx.moveTo(120, 470);
    ctx.lineTo(W - 120, 470);
    ctx.stroke();

    const statY = 560;
    drawStat(ctx, W / 2, statY, `${stats.minutesTaken}`, 'دقيقة');
    drawStat(ctx, W / 2, statY + 150, `${stats.evidenceFound}/${stats.evidenceTotal}`, 'دليل مفتوح');

    if (stats.topCharacter) {
      drawStat(
        ctx,
        W / 2,
        statY + 300,
        stats.topCharacter,
        `أكثر شخص استُجوب (${stats.topCharacterQuestions} سؤال)`,
      );
    }

    ctx.font = '400 26px sans-serif';
    ctx.fillStyle = '#8f979e';
    const names = members.map((m) => m.displayName).join(' · ');
    wrapText(ctx, names, W / 2, H - 140, W - 200, 34);

    ctx.font = '400 20px monospace';
    ctx.fillStyle = '#5c6a73';
    ctx.fillText('IFADA — ARCHIVE OF CASES', W / 2, H - 70);

    setReady(true);
  }, [stats, overall, caseTitle, members]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `ifada-${caseTitle}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  async function share() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'ifada-card.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: caseTitle });
      } else {
        download();
      }
    }, 'image/png');
  }

  return (
    <div style={{ display: 'grid', gap: '1rem', placeItems: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', maxWidth: '24rem', border: '1px solid var(--ink-line)' }}
      />
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button className="btn" onClick={share} disabled={!ready}>
          شارك البطاقة
        </button>
        <button className="btn btn-quiet" onClick={download} disabled={!ready}>
          نزّل الصورة
        </button>
      </div>
    </div>
  );
}

function drawStat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: string,
  label: string,
) {
  ctx.font = '600 56px monospace';
  ctx.fillStyle = '#d9d4c7';
  ctx.fillText(value, x, y);
  ctx.font = '400 24px sans-serif';
  ctx.fillStyle = '#8f979e';
  ctx.fillText(label, x, y + 36);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ');
  let line = '';
  let curY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = word;
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, curY);
}
