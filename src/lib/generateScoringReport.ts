import jsPDF from 'jspdf';
import type { RoundRow } from '@/components/RoundsList';
import { computeTrendLine } from '@/lib/trendLine';
import { holesFilterLabel, type HolesFilter } from '@/lib/roundsFilterStore';
/** Internal report-only value: 'both' = all rounds, 18 and 9 in separate sections. */
export type ReportHolesFilter = HolesFilter | 'both';

// ---------------------------------------------------------------------------
// Tier theming for the PDF.
// The tier itself comes from the same source as the in-app tier badge
// (AuthContext `effectivePlan` / `getEffectivePlan(profile)`), passed in by the
// caller. Here we only map that tier key to print-friendly colors.
// ---------------------------------------------------------------------------
export type ReportTier = 'free' | 'member' | 'scratch' | 'pro' | 'apex' | string;
type RGB = [number, number, number];

export interface PdfTierTheme {
  /** Header band background. */
  header: RGB;
  /** Badge + header stripe. */
  accent: RGB;
  /** Charts, tinted boxes (slightly deeper so it reads on white paper). */
  chart: RGB;
  label: string;
}

const PDF_TIER_THEME: Record<string, PdfTierTheme> = {
  free:    { header: [108, 109, 102], accent: [244, 243, 238], chart: [76, 78, 72],   label: 'Member' },
  member:  { header: [108, 109, 102], accent: [244, 243, 238], chart: [76, 78, 72],   label: 'Member' },
  // Scratch keeps its app green (#4A7C59) with a darker header/chart variant.
  scratch: { header: [45, 78, 56],    accent: [123, 200, 148], chart: [58, 100, 71],  label: 'Scratch' },
  pro:     { header: [106, 93, 50],   accent: [232, 193, 74],  chart: [217, 174, 44], label: 'Pro' },
  apex:    { header: [38, 55, 79],    accent: [141, 176, 232], chart: [111, 152, 220], label: 'Apex Level' },
};

export function getPdfTierTheme(tier: ReportTier | null | undefined): PdfTierTheme {
  return PDF_TIER_THEME[(tier as string) ?? 'free'] ?? PDF_TIER_THEME.free;
}

// ---------------------------------------------------------------------------
// Chart metrics — same set, order and data as the Trends charts in RoundsList.
// ---------------------------------------------------------------------------
type MetricDef = {
  key: string;
  label: string;
  value: (r: RoundRow) => number | null;
  signed?: boolean;
  pct?: boolean;
  suffix?: string;
};

const PDF_METRICS: MetricDef[] = [
  { key: 'score', label: 'Score vs Par', signed: true, value: (r) => r.total_score - r.course_par },
  { key: 'gir', label: 'GIR %', pct: true, suffix: '%', value: (r) => (r.greens_in_regulation != null && r.holes_played ? Math.round((r.greens_in_regulation / r.holes_played) * 100) : null) },
  { key: 'fir', label: 'FIR %', pct: true, suffix: '%', value: (r) => (r.fairways_hit != null && r.fairways_total ? Math.round((r.fairways_hit / r.fairways_total) * 100) : null) },
  { key: 'putts', label: 'Putts', value: (r) => r.putts ?? null },
  { key: 'birdies', label: 'Birdies', value: (r) => r.birdies ?? null },
  { key: 'bogeys', label: 'Bogeys', value: (r) => r.bogeys ?? null },
  { key: 'par3', label: 'Par 3 Avg', value: (r) => r.par3_avg ?? null },
  { key: 'par4', label: 'Par 4 Avg', value: (r) => r.par4_avg ?? null },
  { key: 'par5', label: 'Par 5 Avg', value: (r) => r.par5_avg ?? null },
  { key: 'ud', label: 'U&D %', pct: true, suffix: '%', value: (r) => (r.up_downs_attempted != null && r.up_downs_attempted > 0 && r.up_downs_converted != null ? Math.round((r.up_downs_converted / r.up_downs_attempted) * 100) : null) },
];

function parseLocalRoundDate(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

function shortDate(d: string) {
  return parseLocalRoundDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtAxis(v: number, signed?: boolean) {
  const rounded = Math.round(v * 10) / 10;
  const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return signed && rounded > 0 ? `+${s}` : s;
}

// Average-player benchmarks by handicap bucket. Values represent typical
// AVERAGES for players at that level (never minimums or thresholds).
type Bench = { fir: number; gir: number; putts: number; ud: number; label: string };
function benchmarkForHandicap(h: number): Bench {
  if (h < 5)  return { label: 'scratch to 5', fir: 60, gir: 55, putts: 30, ud: 50 };
  if (h < 10) return { label: '5 to 10',      fir: 55, gir: 45, putts: 31, ud: 45 };
  if (h < 15) return { label: '10 to 15',     fir: 50, gir: 35, putts: 32, ud: 38 };
  if (h < 20) return { label: '15 to 20',     fir: 45, gir: 25, putts: 33, ud: 30 };
  return              { label: '20+',          fir: 40, gir: 18, putts: 34, ud: 25 };
}

function formatDate(d: string) {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function avg(arr: number[]): number | null {
  if (!arr.length) return null;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
}

function computeStats(rounds: RoundRow[]) {
  if (!rounds.length) return null;
  const scores = rounds.map((r) => r.total_score);
  const overPar = rounds.map((r) => r.total_score - r.course_par);
  const putts = rounds.map((r) => r.putts).filter((x): x is number => x != null);
  const gir = rounds
    .map((r) =>
      r.greens_in_regulation != null && r.holes_played
        ? (r.greens_in_regulation / r.holes_played) * 100
        : null,
    )
    .filter((x): x is number => x != null);
  const fir = rounds
    .map((r) =>
      r.fairways_hit != null && r.fairways_total && r.fairways_total > 0
        ? (r.fairways_hit / r.fairways_total) * 100
        : null,
    )
    .filter((x): x is number => x != null);
  const lostBalls = rounds.map((r) => r.lost_balls).filter((x): x is number => x != null);
  const birdiesArr = rounds.map((r) => r.birdies).filter((x): x is number => x != null);
  const bogeysArr = rounds.map((r) => r.bogeys).filter((x): x is number => x != null);
  const udPcts = rounds
    .map((r) =>
      r.up_downs_attempted != null && r.up_downs_attempted > 0 && r.up_downs_converted != null
        ? (r.up_downs_converted / r.up_downs_attempted) * 100
        : null,
    )
    .filter((x): x is number => x != null);
  return {
    total: rounds.length,
    avgScore: avg(scores),
    avgVsPar: avg(overPar),
    avgPutts: avg(putts),
    girPct: gir.length ? Math.round(avg(gir)!) : null,
    firPct: fir.length ? Math.round(avg(fir)!) : null,
    best: overPar.length ? Math.min(...overPar) : null,
    avgLostBalls: avg(lostBalls),
    avgBirdies: avg(birdiesArr),
    avgBogeys: avg(bogeysArr),
    udPct: udPcts.length ? Math.round(avg(udPcts)!) : null,
  };
}

type Stats = NonNullable<ReturnType<typeof computeStats>>;

interface Params {
  studentName: string;
  handicap: number | null;
  rounds: RoundRow[];
  /** Active Trends filter when the report was generated. */
  holesFilter?: ReportHolesFilter;
  /** Subscription tier, same value as the in-app tier badge. */
  tier?: ReportTier | null;
  /** Optional period label (e.g. "YTD 2026"); replaces first/last round dates. */
  periodLabel?: string;
}

export function generateScoringReport({
  studentName,
  handicap,
  rounds: allRounds,
  holesFilter = 'both',
  tier = 'free',
  periodLabel,
}: Params) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 40;
  const CW = W - MARGIN * 2;
  let y = MARGIN;

  const T = getPdfTierTheme(tier);
  const HEADER: RGB = T.header;
  const ACCENT: RGB = T.accent;
  const CHART: RGB = T.chart;
  /** Chart color mixed with white — for tinted boxes / area fills on paper. */
  const tint = (alpha: number): RGB => [
    Math.round(255 + (CHART[0] - 255) * alpha),
    Math.round(255 + (CHART[1] - 255) * alpha),
    Math.round(255 + (CHART[2] - 255) * alpha),
  ];

  // The PDF respects the active holes filter everywhere except the 18/9
  // averages blocks, which keep their existing behaviour. 'all' no longer
  // exists — legacy snapshots saved as 'all' render with 18-hole rounds.
  const rounds =
    holesFilter === 'both'
      ? allRounds
      : allRounds.filter((r) => (r.holes_played ?? 18) === (holesFilter === '18' ? 18 : 9));

  const rounds18 = allRounds.filter((r) => (r.holes_played ?? 18) === 18);
  const rounds9 = allRounds.filter((r) => r.holes_played === 9);
  const sorted = [...rounds].sort(
    (a, b) => parseLocalRoundDate(a.played_on).getTime() - parseLocalRoundDate(b.played_on).getTime(),
  );
  const firstDate = sorted[0]?.played_on;
  const lastDate = sorted[sorted.length - 1]?.played_on;

  // ---------- Page 1 header band ----------
  const HDR_H = 104;
  doc.setFillColor(...HEADER);
  doc.rect(0, 0, W, HDR_H, 'F');
  doc.setFillColor(...ACCENT);
  doc.rect(0, HDR_H - 5, W, 5, 'F');

  // "A" logo mark
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(1);
  doc.roundedRect(MARGIN, 20, 26, 26, 6, 6, 'S');
  doc.setTextColor(...ACCENT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('A', MARGIN + 13, 39, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('Margea Golf Academy', MARGIN + 36, 31);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(235, 235, 235);
  doc.text('by Santiago Castilla', MARGIN + 36, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(230, 230, 230);
  doc.text('SCORING REPORT', MARGIN, 62);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(studentName, MARGIN, 84);

  // Tier badge beside the name
  const badgeX = MARGIN + doc.getTextWidth(studentName) + 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const badgeW = doc.getTextWidth(T.label.toUpperCase()) + 16;
  doc.setFillColor(...ACCENT);
  doc.roundedRect(badgeX, 71, badgeW, 15, 7.5, 7.5, 'F');
  doc.setTextColor(30, 30, 30);
  doc.text(T.label.toUpperCase(), badgeX + badgeW / 2, 81.5, { align: 'center' });

  // Right side meta: label + value pairs
  const meta: [string, string][] = [
    ['PERIOD', periodLabel ? periodLabel : firstDate && lastDate ? `${formatDate(firstDate)} — ${formatDate(lastDate)}` : '—'],
    ['ROUNDS', String(rounds.length)],
    ['FILTER', holesFilter === 'both' ? '18 + 9 holes' : holesFilterLabel(holesFilter)],
  ];
  let metaY = 30;
  meta.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(210, 210, 210);
    doc.text(label, W - MARGIN, metaY, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(value, W - MARGIN, metaY + 11, { align: 'right' });
    metaY += 24;
  });

  y = HDR_H + 26;
  doc.setTextColor(0, 0, 0);

  const sectionTitle = (title: string, atY: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...HEADER);
    doc.text(title, MARGIN, atY);
    return atY + 10;
  };

  const fmtBest = (b: number | null) =>
    b == null ? '—' : b === 0 ? 'E' : b > 0 ? `+${b}` : String(b);

  // ---------- 18-hole averages ----------
  const s18 = computeStats(rounds18);
  y = sectionTitle('18-hole averages', y);
  if (!s18) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 130);
    doc.text('No 18-hole rounds yet.', MARGIN, y + 16);
    y += 32;
  } else {
    const bigW = 168;
    const bigH = 74;
    doc.setFillColor(...HEADER);
    doc.roundedRect(MARGIN, y, bigW, bigH, 8, 8, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(225, 225, 225);
    doc.text('AVERAGE SCORE', MARGIN + 14, y + 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(30);
    doc.setTextColor(255, 255, 255);
    doc.text(s18.avgScore != null ? String(s18.avgScore) : '—', MARGIN + 14, y + 50);
    doc.setFontSize(11);
    doc.setTextColor(...ACCENT);
    doc.text(
      s18.avgVsPar == null
        ? ''
        : `${s18.avgVsPar > 0 ? '+' : ''}${s18.avgVsPar} vs par`,
      MARGIN + 14,
      y + 66,
    );

    const smalls: [string, string][] = [
      ['GIR %', s18.girPct != null ? `${s18.girPct}%` : '—'],
      ['FIR %', s18.firPct != null ? `${s18.firPct}%` : '—'],
      ['PUTTS/RD', s18.avgPutts != null ? String(s18.avgPutts) : '—'],
      ['BEST', fmtBest(s18.best)],
      ['BIRDIES/RD', s18.avgBirdies != null ? String(s18.avgBirdies) : '—'],
      ['BOGEYS/RD', s18.avgBogeys != null ? String(s18.avgBogeys) : '—'],
      ['U&D %', s18.udPct != null ? `${s18.udPct}%` : '—'],
      ['LOST BALLS/RD', s18.avgLostBalls != null ? String(s18.avgLostBalls) : '—'],
    ];
    const gridX = MARGIN + bigW + 12;
    const gridW = CW - bigW - 12;
    const cols = 4;
    const gap = 8;
    const cellW = (gridW - gap * (cols - 1)) / cols;
    const cellH = (bigH - gap) / 2;
    smalls.forEach((c, i) => {
      const cx = gridX + (i % cols) * (cellW + gap);
      const cy = y + Math.floor(i / cols) * (cellH + gap);
      doc.setFillColor(...tint(0.09));
      doc.roundedRect(cx, cy, cellW, cellH, 5, 5, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(120, 120, 120);
      doc.text(c[0], cx + 7, cy + 14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...HEADER);
      doc.text(c[1], cx + 7, cy + 28);
    });
    y += bigH + 22;
  }

  // ---------- 9-hole averages ----------
  const s9 = computeStats(rounds9);
  y = sectionTitle('9-hole averages', y);
  {
    const cells9: [string, string][] = s9
      ? [
          ['AVG SCORE', s9.avgScore != null ? String(s9.avgScore) : '—'],
          ['VS PAR', s9.avgVsPar == null ? '—' : `${s9.avgVsPar > 0 ? '+' : ''}${s9.avgVsPar}`],
          ['GIR %', s9.girPct != null ? `${s9.girPct}%` : '—'],
          ['FIR %', s9.firPct != null ? `${s9.firPct}%` : '—'],
          ['PUTTS/RD', s9.avgPutts != null ? String(s9.avgPutts) : '—'],
          ['BEST', fmtBest(s9.best)],
          ['BIRDIES/RD', s9.avgBirdies != null ? String(s9.avgBirdies) : '—'],
          ['BOGEYS/RD', s9.avgBogeys != null ? String(s9.avgBogeys) : '—'],
          ['U&D %', s9.udPct != null ? `${s9.udPct}%` : '—'],
        ]
      : [];
    if (!cells9.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(130, 130, 130);
      doc.text('No 9-hole rounds yet.', MARGIN, y + 16);
      y += 30;
    } else {
      const gap = 6;
      const cellW = (CW - gap * (cells9.length - 1)) / cells9.length;
      const cellH = 40;
      cells9.forEach((c, i) => {
        const cx = MARGIN + i * (cellW + gap);
        doc.setFillColor(243, 243, 241);
        doc.roundedRect(cx, y, cellW, cellH, 5, 5, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(125, 125, 125);
        doc.text(c[0], cx + 5, y + 14);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...HEADER);
        doc.text(c[1], cx + 5, y + 30);
      });
      y += cellH + 22;
    }
  }

  // ---------- Chart renderer ----------
  const metricAvgLabel = (m: MetricDef, values: (number | null)[]) => {
    const valid = values.filter((v): v is number => v != null && Number.isFinite(v));
    if (!valid.length) return '';
    const a = avg(valid)!;
    if (m.signed) return `avg ${a > 0 ? '+' : ''}${a}`;
    return `avg ${a}${m.suffix ?? ''}`;
  };

  const hasData = (m: MetricDef) =>
    sorted.some((r) => {
      const v = m.value(r);
      return v != null && Number.isFinite(v);
    });

  /** Returns false when the metric has no data (card not drawn). */
  const drawMetricChart = (m: MetricDef, x: number, top: number, w: number, h: number, dense: boolean) => {
    const values = sorted.map((r) => m.value(r));
    const valid = values.filter((v): v is number => v != null && Number.isFinite(v));
    if (valid.length === 0) return false;

    // Card
    doc.setDrawColor(226, 226, 226);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, top, w, h, 6, 6, 'S');

    // Title + average
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...HEADER);
    doc.text(m.label, x + 10, top + 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text(metricAvgLabel(m, values), x + w - 10, top + 15, { align: 'right' });

    const GUT = 32, PAD_T = 26, PAD_B = 16, PAD_R = 10;
    const plotX = x + GUT;
    const plotW = Math.max(10, w - GUT - PAD_R);
    const plotY = top + PAD_T;
    const plotH = Math.max(10, h - PAD_T - PAD_B);

    let minV = Math.min(...valid);
    let maxV = Math.max(...valid);
    if (m.signed) { minV = Math.min(minV, 0); maxV = Math.max(maxV, 0); }
    if (m.pct) { maxV = Math.min(100, Math.max(maxV, 0)); minV = Math.max(0, minV); }
    if (minV === maxV) { minV -= 1; maxV += 1; }
    const n = values.length;
    const px = (i: number) => (n > 1 ? plotX + (i * plotW) / (n - 1) : plotX + plotW / 2);
    const py = (v: number) => {
      const clamped = Math.min(maxV, Math.max(minV, v));
      return plotY + ((maxV - clamped) * plotH) / (maxV - minV);
    };

    // Horizontal grid + Y labels
    const STEPS = 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    for (let i = 0; i <= STEPS; i++) {
      const v = maxV - ((maxV - minV) * i) / STEPS;
      const gy = py(v);
      doc.setDrawColor(238, 238, 238);
      doc.setLineWidth(0.4);
      doc.line(plotX, gy, plotX + plotW, gy);
      doc.setTextColor(140, 140, 140);
      doc.text(fmtAxis(v, m.signed), plotX - 5, gy + 2.2, { align: 'right' });
    }

    // Zero reference for signed metrics
    if (m.signed && minV <= 0 && maxV >= 0) {
      doc.setDrawColor(190, 190, 190);
      doc.setLineWidth(0.6);
      doc.setLineDashPattern([3, 3], 0);
      doc.line(plotX, py(0), plotX + plotW, py(0));
      doc.setLineDashPattern([], 0);
    }

    // Area fill under the line (chart color fading out) — drawn as vertical
    // slivers so it stays a soft gradient on paper.
    const pts = values
      .map((v, i) => (v != null && Number.isFinite(v) ? { x: px(i), y: py(v) } : null))
      .filter((p): p is { x: number; y: number } => p != null);
    if (pts.length > 1) {
      const baseY = plotY + plotH;
      const BANDS = 14;
      for (let b = 0; b < BANDS; b++) {
        const a = 0.16 * (1 - b / BANDS);
        doc.setFillColor(...tint(a));
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          const top0 = p0.y + ((baseY - p0.y) * b) / BANDS;
          const top1 = p1.y + ((baseY - p1.y) * b) / BANDS;
          const bot0 = p0.y + ((baseY - p0.y) * (b + 1)) / BANDS;
          const bot1 = p1.y + ((baseY - p1.y) * (b + 1)) / BANDS;
          doc.triangle(p0.x, top0, p1.x, top1, p1.x, bot1, 'F');
          doc.triangle(p0.x, top0, p1.x, bot1, p0.x, bot0, 'F');
        }
      }
    }

    // Data line
    doc.setDrawColor(...CHART);
    doc.setLineWidth(1.4);
    let prev: { i: number; v: number } | null = null;
    values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) return;
      if (prev) doc.line(px(prev.i), py(prev.v), px(i), py(v));
      prev = { i, v };
    });

    // Dots: solid for 18 holes, hollow for 9 holes
    doc.setFillColor(...CHART);
    doc.setDrawColor(...CHART);
    doc.setLineWidth(0.9);
    values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) return;
      const nine = (sorted[i].holes_played ?? 18) === 9;
      if (nine) {
        doc.setFillColor(255, 255, 255);
        doc.circle(px(i), py(v), 1.9, 'FD');
        doc.setFillColor(...CHART);
      } else {
        doc.circle(px(i), py(v), 1.8, 'F');
      }
    });

    // Trend line (dashed, 3+ rounds)
    const trend = computeTrendLine(values);
    if (trend) {
      doc.setDrawColor(...CHART);
      doc.setLineWidth(1);
      doc.setLineDashPattern([4, 3], 0);
      doc.line(px(0), py(trend.intercept), px(n - 1), py(trend.intercept + trend.slope * (n - 1)));
      doc.setLineDashPattern([], 0);
    }

    // X labels
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(140, 140, 140);
    if (sorted.length) {
      const maxLabels = dense ? 5 : 9;
      const step = Math.max(1, Math.ceil(n / maxLabels));
      for (let i = 0; i < n; i += step) {
        const label = shortDate(sorted[i].played_on);
        const lx = Math.min(px(i), plotX + plotW - doc.getTextWidth(label));
        doc.text(label, Math.max(plotX, lx), top + h - 5);
      }
    }
    doc.setLineWidth(0.2);
    return true;
  };

  const drawDotLegend = (x: number, atY: number) => {
    doc.setFillColor(...CHART);
    doc.setDrawColor(...CHART);
    doc.setLineWidth(0.8);
    doc.circle(x + 3, atY - 2.5, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text('18 holes', x + 9, atY);
    const x2 = x + 9 + doc.getTextWidth('18 holes') + 12;
    doc.setFillColor(255, 255, 255);
    doc.circle(x2 + 3, atY - 2.5, 2, 'FD');
    doc.text('9 holes', x2 + 9, atY);
  };

  // ---------- Page 1 — Score vs Par ----------
  const scoreMetric = PDF_METRICS[0];
  const otherMetrics = PDF_METRICS.slice(1);
  if (hasData(scoreMetric)) {
    const chartH = Math.max(120, Math.min(170, H - MARGIN - 24 - y));
    drawMetricChart(scoreMetric, MARGIN, y, CW, chartH, false);
    drawDotLegend(MARGIN + 2, y + chartH + 12);
  }

  // ---------- Page 2 — Performance trends ----------
  const visibleMetrics = otherMetrics.filter(hasData);
  if (visibleMetrics.length) {
    doc.addPage();
    y = MARGIN + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...HEADER);
    doc.text('Performance trends', MARGIN, y);
    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, y + 6, 46, 3, 'F');
    y += 26;
    const GAP_X = 16;
    const gridW = (CW - GAP_X) / 2;
    const gridH = 112;
    const ROW_GAP = 16;
    visibleMetrics.forEach((m, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cy = y + row * (gridH + ROW_GAP);
      drawMetricChart(m, MARGIN + col * (gridW + GAP_X), cy, gridW, gridH, true);
    });
    y = y + Math.ceil(visibleMetrics.length / 2) * (gridH + ROW_GAP);
    drawDotLegend(MARGIN + 2, y + 6);
  }

  // ---------- Last page — Areas to improve + rounds ----------
  doc.addPage();
  y = MARGIN + 4;

  const overallStats = computeStats(rounds);
  const enoughRounds = rounds.length >= 6;
  const hasHandicap = handicap != null;

  const bullets: string[] = [];
  let mutedNote: string | null = null;

  if (overallStats) {
    if (hasHandicap && enoughRounds) {
      const b = benchmarkForHandicap(handicap!);
      const gaps: { key: string; gap: number; line: string }[] = [];
      if (overallStats.firPct != null) {
        const gap = b.fir - overallStats.firPct;
        if (gap > 0) gaps.push({ key: 'fir', gap, line: `Fairways in regulation: ${overallStats.firPct}%. Players at your handicap level (${b.label}) average around ${b.fir}%. Working on tee-shot control can add fairways per round.` });
      }
      if (overallStats.girPct != null) {
        const gap = b.gir - overallStats.girPct;
        if (gap > 0) gaps.push({ key: 'gir', gap, line: `Greens in regulation: ${overallStats.girPct}%. Players at your handicap level average around ${b.gir}%. Improving approach distance control is usually the fastest lever.` });
      }
      if (overallStats.avgPutts != null) {
        const gap = overallStats.avgPutts - b.putts;
        if (gap > 0) gaps.push({ key: 'putts', gap: gap * 3, line: `Putts per round: ${overallStats.avgPutts}. Players at your handicap level average around ${b.putts}. Focused lag-putting drills tend to help most.` });
      }
      if (overallStats.udPct != null) {
        const gap = b.ud - overallStats.udPct;
        if (gap > 0) gaps.push({ key: 'ud', gap: gap * 0.5, line: `Up-and-down conversion: ${overallStats.udPct}%. Players at your handicap level average around ${b.ud}%. Short-game reps around the green can move this quickly.` });
      }
      gaps.sort((a, b2) => b2.gap - a.gap);
      const picks = gaps.slice(0, 3);
      if (picks.length === 0) {
        bullets.push('Your key metrics are at or above the average for your handicap level. Keep building consistency.');
      } else {
        picks.forEach((p) => bullets.push(p.line));
      }
    } else {
      const candidates: { line: string; score: number }[] = [];
      if (overallStats.firPct != null) candidates.push({ score: 100 - overallStats.firPct, line: `Your fairways in regulation currently sit at ${overallStats.firPct}%. Tracking tee shots for the next few rounds will show whether this is your main improvement area.` });
      if (overallStats.girPct != null) candidates.push({ score: 100 - overallStats.girPct, line: `Your greens in regulation currently sit at ${overallStats.girPct}%. This reflects approach-shot distance control.` });
      if (overallStats.udPct != null) candidates.push({ score: 100 - overallStats.udPct, line: `Your up-and-down conversion currently sits at ${overallStats.udPct}%. Short-game practice is the direct lever here.` });
      if (overallStats.avgPutts != null) candidates.push({ score: overallStats.avgPutts, line: `You average ${overallStats.avgPutts} putts per round. Lag putting and short-putt routine are the usual next steps.` });
      candidates.sort((a, b2) => b2.score - a.score);
      if (candidates[0]) bullets.push(candidates[0].line);
      mutedNote = !enoughRounds
        ? 'Log a few more rounds to unlock a comparison against players at your level.'
        : 'Add your handicap to your profile to unlock a comparison against players at your level.';
    }
  } else {
    bullets.push('No rounds available.');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...HEADER);
  doc.text('Areas to improve', MARGIN, y);
  doc.setFillColor(...ACCENT);
  doc.rect(MARGIN, y + 6, 46, 3, 'F');
  y += 22;

  {
    const innerX = MARGIN + 18;
    const innerW = CW - 28;
    const wrapped = bullets.map((b) => doc.splitTextToSize(`•  ${b}`, innerW) as string[]);
    const bodyH = wrapped.reduce((a, l) => a + l.length * 12 + 6, 0);
    const noteH = mutedNote ? 16 : 0;
    const boxH = bodyH + noteH + 20;
    doc.setFillColor(...tint(0.08));
    doc.roundedRect(MARGIN, y, CW, boxH, 6, 6, 'F');
    doc.setFillColor(...CHART);
    doc.rect(MARGIN, y + 3, 3.5, boxH - 6, 'F');

    let ty = y + 22;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(55, 55, 55);
    wrapped.forEach((lines) => {
      doc.text(lines, innerX, ty);
      ty += lines.length * 12 + 6;
    });
    if (mutedNote) {
      doc.setFontSize(7.5);
      doc.setTextColor(140, 140, 140);
      doc.text(mutedNote, innerX, ty);
    }
    y += boxH + 26;
  }

  // ---------- Rounds table ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...HEADER);
  doc.text('Rounds', MARGIN, y);
  doc.setFillColor(...ACCENT);
  doc.rect(MARGIN, y + 6, 46, 3, 'F');
  y += 20;

  const headers = ['Date', 'Course', 'Type', 'Holes', 'Score', 'FIR', 'GIR', 'Putts'];
  const colWs = [64, 146, 48, 40, 62, 60, 58, 54];
  const tableW = colWs.reduce((a, b) => a + b, 0);
  const startX = MARGIN;
  const ROW_H = 19;

  const drawTableHeader = () => {
    doc.setFillColor(...HEADER);
    doc.rect(startX, y, tableW, ROW_H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    let x = startX;
    headers.forEach((h, i) => {
      doc.text(h.toUpperCase(), x + 6, y + 12.5);
      x += colWs[i];
    });
    y += ROW_H;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(35, 35, 35);
  };
  drawTableHeader();

  // Student's own average vs par per round length — used for the score chips.
  const avgVs18 = computeStats(rounds18)?.avgVsPar ?? null;
  const avgVs9 = computeStats(rounds9)?.avgVsPar ?? null;

  const recent = [...rounds].sort((a, b) => b.played_on.localeCompare(a.played_on));
  let anyFirFlag = false;
  recent.forEach((r, idx) => {
    if (y > H - 60) { doc.addPage(); y = MARGIN; drawTableHeader(); }
    const nine = (r.holes_played ?? 18) === 9;
    if (idx % 2 === 1) {
      doc.setFillColor(248, 248, 246);
      doc.rect(startX, y, tableW, ROW_H, 'F');
    }

    const overUnder = r.total_score - r.course_par;
    const ouLabel = overUnder === 0 ? 'E' : overUnder > 0 ? `+${overUnder}` : `${overUnder}`;
    const ownAvg = nine ? avgVs9 : avgVs18;
    let chipFill: RGB = [238, 238, 238];
    let chipText: RGB = [80, 80, 80];
    if (ownAvg != null) {
      const diff = overUnder - ownAvg;
      if (diff <= -2) { chipFill = [219, 240, 226]; chipText = [26, 110, 60]; }
      else if (diff >= 2) { chipFill = [250, 226, 226]; chipText = [155, 40, 40]; }
    }

    const firOver =
      r.fairways_hit != null && r.fairways_total != null && r.fairways_hit > r.fairways_total;
    if (firOver) anyFirFlag = true;
    const firTxt = r.fairways_hit != null && r.fairways_total ? `${r.fairways_hit}/${r.fairways_total}` : '—';
    const girTxt = r.greens_in_regulation != null ? `${r.greens_in_regulation}/${r.holes_played ?? 18}` : '—';
    const puttsTxt = r.putts != null ? String(r.putts) : '—';

    let x = startX;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(45, 45, 45);
    // Date
    doc.text(formatDate(r.played_on), x + 6, y + 12.5);
    x += colWs[0];
    // Course
    doc.text(doc.splitTextToSize(String(r.course_name_snapshot ?? ''), colWs[1] - 10)[0] ?? '', x + 6, y + 12.5);
    x += colWs[1];
    // Type
    doc.setTextColor(95, 95, 95);
    doc.text(doc.splitTextToSize(String(r.round_type ?? ''), colWs[2] - 10)[0] ?? '', x + 6, y + 12.5);
    x += colWs[2];
    // Holes pill
    doc.setFillColor(237, 237, 234);
    doc.roundedRect(x + 5, y + 4, 26, 11, 5.5, 5.5, 'F');
    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    doc.text(nine ? '9' : '18', x + 18, y + 11.7, { align: 'center' });
    x += colWs[3];
    // Score + chip
    doc.setFontSize(8);
    doc.setTextColor(35, 35, 35);
    doc.text(String(r.total_score), x + 6, y + 12.5);
    const chipX = x + 6 + doc.getTextWidth(String(r.total_score)) + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    const chipW = doc.getTextWidth(ouLabel) + 11;
    doc.setFillColor(...chipFill);
    doc.roundedRect(chipX, y + 4, chipW, 11, 5.5, 5.5, 'F');
    doc.setTextColor(...chipText);
    doc.text(ouLabel, chipX + chipW / 2, y + 11.7, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(45, 45, 45);
    x += colWs[4];
    // FIR (+ flag)
    doc.text(firTxt, x + 6, y + 12.5);
    if (firOver) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(190, 45, 45);
      doc.text('!', x + 6 + doc.getTextWidth(firTxt) + 4, y + 12.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(45, 45, 45);
    }
    x += colWs[5];
    // GIR
    doc.text(girTxt, x + 6, y + 12.5);
    x += colWs[6];
    // Putts
    doc.text(puttsTxt, x + 6, y + 12.5);

    doc.setDrawColor(235, 235, 235);
    doc.setLineWidth(0.4);
    doc.line(startX, y + ROW_H, startX + tableW, y + ROW_H);
    y += ROW_H;
  });

  if (anyFirFlag) {
    if (y > H - 60) { doc.addPage(); y = MARGIN; }
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text('!  Fairways hit exceed the fairways available for that round length.', startX, y + 14);
  }

  // ---------- Footer on every page ----------
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(232, 232, 232);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, H - 32, W - MARGIN, H - 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text('Margea Golf Academy   ·   margeagolfacademy.com', MARGIN, H - 20);
    doc.text(`Page ${p} of ${pageCount}`, W - MARGIN, H - 20, { align: 'right' });
  }

  const fileSafe = studentName.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'student';
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`scoring-report_${fileSafe}_${stamp}.pdf`);
}
