/**
 * Single source of truth for revenue calculations across the admin app.
 *
 * Both /admin/revenue and the coach dashboard import these helpers so the
 * MTD / YTD / "compute from date" numbers always agree pixel-for-pixel.
 *
 * Logic mirrors the original AdminRevenue page:
 *   total = sum(lessons.revenue >= start)
 *         + sum(package_payments.amount >= start)
 *         + sum(stripe payments that are golf revenue, not archived,
 *               not already counted via lessons/packages, >= start)
 */

const GOLF_KEYWORDS = [
  'lesson',
  'package',
  'golf',
  'academy',
  'analysis',
  'swing',
  'coaching',
  'class',
  'sc golf',
  'individual',
];

export function autoClassifyTransaction(tx: any): {
  classification: string;
  confidence: string;
} {
  const text = `${tx.product_name || ''} ${tx.purchase_type || ''} ${tx.reporting_category || ''} ${tx.student_name || ''}`.toLowerCase();

  if (
    ['individual_lesson', 'lesson_package', 'video_analysis', 'subscription'].includes(
      tx.purchase_type,
    )
  ) {
    return { classification: 'golf', confidence: 'high' };
  }
  if (tx.student_matched && tx.student_id) {
    return { classification: 'golf', confidence: 'high' };
  }
  const matchCount = GOLF_KEYWORDS.filter((kw) => text.includes(kw)).length;
  if (matchCount >= 2) return { classification: 'golf', confidence: 'medium' };
  if (matchCount === 1) return { classification: 'golf', confidence: 'low' };
  return { classification: 'unknown', confidence: 'low' };
}

/** Apply the same enrichment used by the Revenue page before any aggregation. */
export function enrichStripePayments(rows: any[]): any[] {
  return (rows || []).map((tx: any) => {
    if (tx.admin_override) return tx;
    const auto = autoClassifyTransaction(tx);
    return {
      ...tx,
      classification: tx.classification === 'unknown' ? auto.classification : tx.classification,
      classification_confidence:
        tx.classification_confidence === 'low' ? auto.confidence : tx.classification_confidence,
      is_golf_revenue: auto.classification === 'golf' || tx.is_golf_revenue,
    };
  });
}

export interface RevenueDataset {
  /** Lesson payments (we only need lesson_date + revenue). */
  lessons: Array<{ lesson_date: string; revenue: number | null }>;
  /** Package payments (payment_date + amount). */
  packagePayments: Array<{ payment_date: string | null; amount: number | null }>;
  /** RAW stripe rows — they will be enriched internally. */
  stripePayments: any[];
  /** Manual payments recorded from the student profile "Add Payment" flow (`payments` table). */
  manualPayments?: Array<{ payment_date: string | null; amount: number | null; student_id?: string | null }>;
}

/**
 * A lesson row only counts as recognized revenue when the money was actually
 * received. This mirrors exactly the Accounts Receivable predicate used by the
 * Revenue page (`unpaidLessons`): a lesson with no package, not imported and
 * with no `payment_method` is still owed, so it belongs to AR — never to
 * revenue. No row can live in both buckets.
 */
export function isLessonRecognizedRevenue(l: any): boolean {
  if (!l) return false;
  if (l.status === 'cancelled') return false;
  const isReceivable = !l.package_id && !l.imported && !l.payment_method;
  return !isReceivable;
}

/** Fuzzy dedupe key so a manual payment recorded for an already-paid lesson isn't counted twice. */
function manualPaymentDuplicatesLesson(
  payment: any,
  countedLessons: any[],
  consumed: Set<any>,
): boolean {
  const amt = Number(payment.amount) || 0;
  const pd = parseRevenueDate(payment.payment_date);
  if (!pd || amt <= 0) return false;
  const match = countedLessons.find((l: any) => {
    if (consumed.has(l)) return false;
    if (!l.student_id || l.student_id !== payment.student_id) return false;
    if ((Number(l.revenue) || 0) !== amt) return false;
    const ld = parseRevenueDate(l.lesson_date);
    if (!ld) return false;
    return Math.abs(ld.getTime() - pd.getTime()) <= 31 * 24 * 60 * 60 * 1000;
  });
  if (match) {
    consumed.add(match);
    return true;
  }
  return false;
}


/**
 * Revenue tables store lesson_date/payment_date as DATE-only strings.
 * JS parses `YYYY-MM-DD` as UTC midnight, which makes same-day MTD revenue
 * from the 1st fall before a local `new Date(year, month, 1)` boundary.
 * Parse date-only values as local dates so July 1 payments count on July 1.
 */
export function parseRevenueDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!dateOnly) return new Date(value);
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Every manual payment recorded by the coach belongs either to a lesson or to
 * a package — there is no third "manual" revenue bucket. This is the single
 * place that decides where a manual payment is displayed.
 */
export function classifyManualPayment(p: any): 'package' | 'lesson' {
  const text = `${p?.concept || ''}`.toLowerCase();
  return text.includes('package') || text.includes('paquete') ? 'package' : 'lesson';
}


/**
 * Compute total revenue from `start` (inclusive) onward, using the same
 * blend of lessons + package_payments + non-double-counted stripe rows
 * that the Revenue page shows in its KPI cards.
 */
export function computeRevenueFrom(start: Date, data: RevenueDataset, end: Date = new Date()): number {
  const enriched = enrichStripePayments(data.stripePayments);
  const golfStripe = enriched.filter(
    (sp: any) => sp.status === 'succeeded' && !sp.is_archived && sp.is_golf_revenue,
  );

  const countedLessons = (data.lessons || []).filter((l: any) => {
    if (!isLessonRecognizedRevenue(l)) return false;
    const d = parseRevenueDate(l.lesson_date);
    if (!d) return false;
    return d >= start && d <= end;
  });
  const lessonRevenue = countedLessons.reduce(
    (sum: number, l: any) => sum + (Number(l.revenue) || 0),
    0,
  );

  const packageRevenue = (data.packagePayments || [])
    .filter((p: any) => {
      const d = parseRevenueDate(p.payment_date);
      if (!d) return false;
      return d >= start && d <= end;
    })
    .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  // Manual payments (`payments` table) — recognized on their payment_date.
  const consumed = new Set<any>();
  const manualRevenue = (data.manualPayments || [])
    .filter((p: any) => {
      const d = parseRevenueDate(p.payment_date);
      if (!d) return false;
      return d >= start && d <= end;
    })
    .filter((p: any) => !manualPaymentDuplicatesLesson(p, countedLessons, consumed))
    .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  const stripeOnlyRevenue = golfStripe
    .filter((sp: any) => {
      const d = sp.paid_at ? new Date(sp.paid_at) : new Date(sp.created_at);
      return d >= start && d <= end && !['individual_lesson', 'package'].includes(sp.reporting_category);
    })
    .reduce(
      (sum: number, sp: any) =>
        sum + (Number(sp.amount) || 0) - (Number(sp.refund_amount) || 0),
      0,
    );

  return lessonRevenue + packageRevenue + manualRevenue + stripeOnlyRevenue;

}

/** Convenience: month-to-date total. */
export function computeMtdRevenue(data: RevenueDataset, now: Date = new Date()): number {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return computeRevenueFrom(monthStart, data);
}
/**
 * Manual payments (`payments` table) that should be recognized as revenue,
 * i.e. excluding those that mirror an already-counted paid lesson.
 * Exported so the breakdown modal lists exactly the rows the KPI sums.
 */
export function filterRecognizedManualPayments(manualPayments: any[], countedLessons: any[]): any[] {
  const consumed = new Set<any>();
  return (manualPayments || []).filter(
    (p: any) => !manualPaymentDuplicatesLesson(p, countedLessons || [], consumed),
  );
}
