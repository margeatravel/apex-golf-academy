/**
 * Least-squares linear regression helpers for the Stats > Trends charts.
 *
 * A trend line is only meaningful with enough data, so callers get `null`
 * when fewer than MIN_POINTS valid (non-null) points are visible.
 */

export const MIN_TREND_POINTS = 3;

export interface TrendLine {
  /** Fitted value at the first visible point. */
  start: number;
  /** Fitted value at the last visible point. */
  end: number;
  /** Change in the metric per round. */
  slope: number;
  /** Number of valid points used in the fit. */
  count: number;
  /** Fitted value at x = 0 (first visible point index). */
  intercept: number;
}

/**
 * Ordinary least-squares fit over the visible points.
 * `values` may contain nulls (missing metrics); those points are skipped but
 * their x-position is preserved so the line keeps the correct inclination.
 */
export function computeTrendLine(values: (number | null | undefined)[]): TrendLine | null {
  const pts: { x: number; y: number }[] = [];
  values.forEach((v, i) => {
    if (v != null && Number.isFinite(v)) pts.push({ x: i, y: v });
  });
  if (pts.length < MIN_TREND_POINTS) return null;

  const n = pts.length;
  const meanX = pts.reduce((a, p) => a + p.x, 0) / n;
  const meanY = pts.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  const firstX = pts[0].x;
  const lastX = pts[n - 1].x;
  return {
    start: intercept + slope * firstX,
    end: intercept + slope * lastX,
    slope,
    count: n,
    intercept,
  };
}

