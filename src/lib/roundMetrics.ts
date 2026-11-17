/**
 * Shared round-metric definitions for charts.
 *
 * Mirrors exactly the metric list and formulas used by the "My Stats" page
 * (RoundsList charts view) so the Home chart and the Stats page always show
 * the same numbers. Purely additive: nothing here modifies existing files.
 * Strokes gained is intentionally NOT included.
 */

export type RoundMetricKey =
  | 'score' | 'gir' | 'fir' | 'putts' | 'birdies' | 'bogeys' | 'par3' | 'par4' | 'par5' | 'ud';

export interface RoundMetricRow {
  total_score: number;
  course_par: number;
  holes_played?: number | null;
  greens_in_regulation?: number | null;
  fairways_hit?: number | null;
  fairways_total?: number | null;
  putts?: number | null;
  birdies?: number | null;
  bogeys?: number | null;
  par3_avg?: number | null;
  par4_avg?: number | null;
  par5_avg?: number | null;
  up_downs_attempted?: number | null;
  up_downs_converted?: number | null;
}

export interface RoundMetricDef {
  key: RoundMetricKey;
  labelKey: string;
  color: string;
  /** Value for one round, or null when the round has no data for it. */
  value: (r: RoundMetricRow) => number | null;
  /** Y-axis / tooltip formatting. */
  format: (v: number) => string;
}

/** Columns the metrics below need (for a `select`). */
export const ROUND_METRIC_COLUMNS =
  'id, played_on, total_score, course_par, holes_played, greens_in_regulation, ' +
  'fairways_hit, fairways_total, putts, birdies, bogeys, par3_avg, par4_avg, par5_avg, ' +
  'up_downs_attempted, up_downs_converted';

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));
const pct = (v: number) => `${v}%`;
const plain = (v: number) => String(Math.round(v * 10) / 10);

export const ROUND_METRICS: RoundMetricDef[] = [
  {
    key: 'score', labelKey: 'prozone2.rounds.metricScore', color: '#F0C040',
    value: (r) => r.total_score - r.course_par, format: signed,
  },
  {
    key: 'gir', labelKey: 'prozone2.rounds.metricGir', color: '#4ade80',
    value: (r) =>
      r.greens_in_regulation != null && r.holes_played
        ? Math.round((r.greens_in_regulation / r.holes_played) * 100)
        : null,
    format: pct,
  },
  {
    key: 'fir', labelKey: 'prozone2.rounds.metricFir', color: '#60a5fa',
    value: (r) =>
      r.fairways_hit != null && r.fairways_total && r.fairways_total > 0
        ? Math.round((r.fairways_hit / r.fairways_total) * 100)
        : null,
    format: pct,
  },
  {
    key: 'putts', labelKey: 'prozone2.rounds.metricPutts', color: '#c084fc',
    value: (r) => r.putts ?? null, format: plain,
  },
  {
    key: 'birdies', labelKey: 'prozone2.rounds.metricBirdies', color: '#34d399',
    value: (r) => r.birdies ?? null, format: plain,
  },
  {
    key: 'bogeys', labelKey: 'prozone2.rounds.metricBogeys', color: '#f87171',
    value: (r) => r.bogeys ?? null, format: plain,
  },
  {
    key: 'par3', labelKey: 'prozone2.rounds.metricPar3', color: '#fbbf24',
    value: (r) => r.par3_avg ?? null, format: plain,
  },
  {
    key: 'par4', labelKey: 'prozone2.rounds.metricPar4', color: '#fb923c',
    value: (r) => r.par4_avg ?? null, format: plain,
  },
  {
    key: 'par5', labelKey: 'prozone2.rounds.metricPar5', color: '#a78bfa',
    value: (r) => r.par5_avg ?? null, format: plain,
  },
  {
    key: 'ud', labelKey: 'prozone2.rounds.metricUd', color: '#2dd4bf',
    value: (r) =>
      r.up_downs_attempted != null && r.up_downs_attempted > 0 && r.up_downs_converted != null
        ? Math.round((r.up_downs_converted / r.up_downs_attempted) * 100)
        : null,
    format: pct,
  },
];

/** Metrics with data in at least `min` of the given rounds. Score is always kept. */
export function availableRoundMetrics(rounds: RoundMetricRow[], min = 3): RoundMetricDef[] {
  return ROUND_METRICS.filter((m) => {
    if (m.key === 'score') return true;
    return rounds.filter((r) => m.value(r) != null).length >= min;
  });
}
