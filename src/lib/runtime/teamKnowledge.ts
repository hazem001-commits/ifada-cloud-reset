// ============================================================
// src/lib/runtime/teamKnowledge.ts
// TeamKnowledge — ما يعرفه الفريق كله، كما يستطيع هذا اللاعب إثباته.
//
// ليس اتحاداً لمعارف اللاعبين الخاصة (ولا قراءة service role لكل
// اللاعبين): هو مُرشِّح فوق PlayerKnowledge (AuthorizedKnowledge) للاعب
// نفسه، فيكون دائماً جزءاً منها. كل حقيقة تحمل `team` من البناء:
//   full  → تدخل كما هي (عنصر مشترك، مسار مشترك، محضر، رابط، حالة عالم، خيط مشترك)
//   title → تدخل بعنوانها فقط، بلا نص (قاعدة title بغرفة 714 — صاحب التخصص يقرأ)
//   none  → لا تدخل (اكتشاف خاص، خيط خاص، قناة خاصة، أوصاف كيان مكتسبة لي)
// النبضات لا تدخل أبداً (ليست حقائق أصلاً).
// ============================================================
import type { AuthorizedFact, AuthorizedKnowledge } from '@/lib/ai/knowledge';

export type PlayerKnowledge = AuthorizedKnowledge;

export interface TeamFact {
  id: string;
  kind: AuthorizedFact['kind'];
  title: string;
  /** null = عنوان فقط للفريق. */
  text: string | null;
  clock: string | null;
}

export interface TeamKnowledge {
  caseId: string;
  facts: readonly TeamFact[];
}

export function buildTeamKnowledge(player: PlayerKnowledge): TeamKnowledge {
  const facts: TeamFact[] = [];
  for (const f of player.facts) {
    if (f.team === 'full' && f.visibility === 'readable') {
      facts.push({ id: f.id, kind: f.kind, title: f.title, text: f.text, clock: f.clock });
    } else if (f.team === 'title' && f.kind === 'evidence') {
      facts.push({ id: f.id, kind: f.kind, title: f.title, text: null, clock: f.clock });
    }
    // none / أي قيمة غير متوقعة → خارج معرفة الفريق (مغلق عند الشك)
  }
  return { caseId: player.caseId, facts };
}

/** ضمان بنيوي: كل حقيقة فريق موجودة بمعرفة اللاعب، ولا نص أكثر مما يملك. */
export function isSubsetOfPlayer(team: TeamKnowledge, player: PlayerKnowledge): boolean {
  const mine = new Map(player.facts.map((f) => [f.id, f]));
  return team.facts.every((t) => {
    const p = mine.get(t.id);
    if (!p) return false;
    return t.text === null || t.text === p.text;
  });
}
