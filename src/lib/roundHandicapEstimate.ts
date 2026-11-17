export interface HandicapRound {
  id: string;
  played_on: string;
  created_at?: string | null;
  holes_played: number;
  course_par: number;
  total_score: number;
}

/** Performance estimate, NOT a WHS index. Last 20 rounds' mean strokes over
 * par, normalized to 18 holes. No invented slope/rating or profile writes. */
export function roundHandicapEstimate(rounds: HandicapRound[]) {
  const ordered = rounds.filter(r =>
    (r.holes_played === 9 || r.holes_played === 18) &&
    Number.isFinite(r.total_score) && r.total_score > 0 &&
    Number.isFinite(r.course_par) && r.course_par > 0,
  ).slice().sort((a, b) => a.played_on.localeCompare(b.played_on) ||
    (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));
  const values: number[] = [];
  return ordered.map(r => {
    // Older 9-hole entries sometimes stored the full 18-hole par.
    const par = r.holes_played === 9 && r.course_par > 54 ? r.course_par / 2 : r.course_par;
    values.push((r.total_score - par) * (18 / r.holes_played));
    const window = values.slice(-20);
    const estimate = Math.round(window.reduce((a, b) => a + b, 0) / window.length * 10) / 10;
    return { date: r.played_on, handicap: estimate, roundId: r.id, count: window.length };
  });
}