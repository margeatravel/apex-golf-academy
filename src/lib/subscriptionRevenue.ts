/**
 * Subscription revenue — single source of truth for the Revenue page
 * "Suscripciones" section, its CSV exports and the PDF report.
 *
 * Sources (read-only, existing tables only — no new data is created):
 *   - stripe_payments: one row per charge. Subscription charges have
 *     reporting_category = 'subscription' (purchase_type = 'subscription').
 *     NOTE: the Stripe webhook only records the first checkout payment
 *     (checkout.session.completed). Renewals arrive as invoice.paid and only
 *     refresh the subscription record, so the payments table can legitimately
 *     be empty even with active subscribers.
 *   - subscriptions: current state per subscriber. `is_active` includes
 *     trialing (webhook: ["active", "trialing"]), the same convention the
 *     Subscribers page uses for its MRR.
 *   - billing_plans: plan prices (price_amount is in CENTS, Stripe
 *     convention — divide by 100 to get MXN).
 *
 * Amounts in stripe_payments are already in the charge currency. The MXN
 * totals only sum rows whose currency is MXN; other currencies still appear
 * in the table with their own currency. Failed or refunded charges never
 * count as income (a partially refunded charge counts its un-refunded part).
 */

export type SubStatusFilter = 'all' | 'succeeded' | 'failed' | 'refunded';

export interface SubscriptionKpis {
  /** is_active subscriptions (includes trialing, per platform convention). */
  activeSubscribers: number;
  /** Monthly recurring revenue (MXN) from is_active subscriptions. */
  mrr: number;
  /** Paid subscription income in the current calendar month (MXN). */
  monthIncome: number;
  /** Paid subscription income in the current calendar year (MXN). */
  yearIncome: number;
  /** Earliest date (YYYY-MM-DD) with a charge or a subscription start. */
  firstDate: string | null;
}

export interface SubscriptionMonthRow {
  month: string; // YYYY-MM
  paidCount: number;
  totalMxn: number;
  active: number;
  started: number;
  canceled: number;
}

/** A charge is a subscription charge when any of its type markers says so. */
export function isSubscriptionPayment(tx: any): boolean {
  if (!tx) return false;
  return (
    tx.reporting_category === 'subscription' ||
    tx.purchase_type === 'subscription' ||
    tx.payment_type === 'subscription'
  );
}

export function paymentDate(tx: any): Date | null {
  const raw = tx?.paid_at || tx?.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/** Local YYYY-MM-DD (avoids UTC-midnight shifts on date-only values). */
export function paymentDateKey(tx: any): string {
  const d = paymentDate(tx);
  if (!d) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isMxn(tx: any): boolean {
  return String(tx?.currency || 'mxn').toLowerCase() === 'mxn';
}

/** Net income of one charge (MXN only): 0 when failed; refunds subtracted. */
export function paymentNetMxn(tx: any): number {
  if (!tx || tx.status === 'failed' || !isMxn(tx)) return 0;
  return Math.max(0, (Number(tx.amount) || 0) - (Number(tx.refund_amount) || 0));
}

/** Was the charge actually paid (money kept)? Failed/refunded count as not paid. */
export function isPaidCharge(tx: any): boolean {
  return tx?.status === 'succeeded' || tx?.status === 'partially_refunded';
}

export function subStatusLabel(status: string, es: boolean): string {
  switch (status) {
    case 'succeeded': return es ? 'Pagado' : 'Paid';
    case 'failed': return es ? 'Fallido' : 'Failed';
    case 'refunded': return es ? 'Reembolsado' : 'Refunded';
    case 'partially_refunded': return es ? 'Reembolsado parcial' : 'Partially refunded';
    case 'pending': return es ? 'Pendiente' : 'Pending';
    default: return status || '—';
  }
}

/** Monthly MXN equivalent of one subscription (same math as the Subscribers page). */
export function monthlyMxnForSub(
  sub: any,
  priceByStripeId: Map<string, { price_amount: number; billing_interval: string }>,
): number {
  let amt = sub?.billing_plans?.price_amount ?? 0;
  let interval = String(
    sub?.billing_plans?.billing_interval || sub?.billing_interval || 'month',
  ).toLowerCase();
  if (!amt && sub?.stripe_price_id) {
    const fb = priceByStripeId.get(sub.stripe_price_id);
    if (fb) {
      amt = fb.price_amount;
      interval = String(fb.billing_interval || 'month').toLowerCase();
    }
  }
  if (!amt) return 0;
  const mxn = amt / 100;
  if (['year', 'yearly', 'annual'].includes(interval)) return mxn / 12;
  if (['week', 'weekly'].includes(interval)) return mxn * 4.345;
  if (['one_time', 'one-time'].includes(interval)) return 0;
  return mxn;
}

export function computeSubscriptionKpis(
  payments: any[],
  subscriptions: any[],
  priceByStripeId: Map<string, { price_amount: number; billing_interval: string }>,
  now: Date = new Date(),
): SubscriptionKpis {
  const active = (subscriptions || []).filter((s: any) => s?.is_active);
  const mrr = active.reduce((sum, s) => sum + monthlyMxnForSub(s, priceByStripeId), 0);
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const y = String(now.getFullYear());
  let monthIncome = 0;
  let yearIncome = 0;
  let firstDate: string | null = null;
  for (const p of payments || []) {
    const k = paymentDateKey(p);
    if (!k) continue;
    if (!firstDate || k < firstDate) firstDate = k;
    if (!isPaidCharge(p)) continue;
    const net = paymentNetMxn(p);
    if (k.slice(0, 7) === ym) monthIncome += net;
    if (k.slice(0, 4) === y) yearIncome += net;
  }
  for (const s of subscriptions || []) {
    const k = String(s?.started_at || '').slice(0, 10);
    if (k && (!firstDate || k < firstDate)) firstDate = k;
  }
  return {
    activeSubscribers: active.length,
    mrr: Math.round(mrr * 100) / 100,
    monthIncome: Math.round(monthIncome * 100) / 100,
    yearIncome: Math.round(yearIncome * 100) / 100,
    firstDate,
  };
}

export interface SubPaymentFilter {
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
  student: string; // substring over name/email (case-insensitive)
  status: SubStatusFilter;
}

export function filterSubscriptionPayments(
  payments: any[],
  f: SubPaymentFilter,
): any[] {
  const q = (f.student || '').trim().toLowerCase();
  return (payments || []).filter((tx: any) => {
    const k = paymentDateKey(tx);
    if (!k || k < f.start || k > f.end) return false;
    if (f.status === 'succeeded' && tx.status !== 'succeeded') return false;
    if (f.status === 'failed' && tx.status !== 'failed') return false;
    if (f.status === 'refunded' && !['refunded', 'partially_refunded'].includes(tx.status)) return false;
    if (q) {
      const hay = `${tx.student_name || ''} ${tx.student_email || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function monthEnd(dateKey: string): string {
  // dateKey is YYYY-MM-DD; returns the last day of that month as YYYY-MM-DD.
  const [y, m] = dateKey.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

/**
 * Monthly summary for the months from startMonth to endMonth (YYYY-MM,
 * inclusive). Paid counts/totals come from `payments` (already filtered to
 * the same range, so the table total always matches the summary total).
 * Active/altas/bajas come from `subscriptions`:
 * - altas: started_at inside the month.
 * - bajas: canceled_at (or ended_at when no canceled_at) inside the month.
 * - activos: started on/before month-end and not canceled/ended on/before
 *   month-end. A subscription canceled with cancel_at_period_end still runs
 *   to its period end, so this is an approximation, not a billing truth.
 */
export function buildSubscriptionMonthlySummary(
  payments: any[],
  subscriptions: any[],
  startMonth: string,
  endMonth: string,
): SubscriptionMonthRow[] {
  const months: string[] = [];
  {
    const [sy, sm] = startMonth.split('-').map(Number);
    const [ey, em] = endMonth.split('-').map(Number);
    let y = sy;
    let m = sm;
    while (y < ey || (y === ey && m <= em)) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      if (months.length > 60) break; // safety cap: 5 years
    }
  }
  return months.map((month) => {
    const end = monthEnd(`${month}-01`);
    let paidCount = 0;
    let totalMxn = 0;
    for (const p of payments || []) {
      const k = paymentDateKey(p);
      if (!k || k.slice(0, 7) !== month) continue;
      if (!isPaidCharge(p)) continue;
      paidCount += 1;
      totalMxn += paymentNetMxn(p);
    }
    let active = 0;
    let started = 0;
    let canceled = 0;
    for (const s of subscriptions || []) {
      const start = String(s?.started_at || '').slice(0, 10);
      const cancel = String(s?.canceled_at || s?.ended_at || '').slice(0, 10);
      if (start && start.slice(0, 7) === month) started += 1;
      if (cancel && cancel.slice(0, 7) === month) canceled += 1;
      if (start && start <= end && (!cancel || cancel > end)) active += 1;
    }
    return {
      month,
      paidCount,
      totalMxn: Math.round(totalMxn * 100) / 100,
      active,
      started,
      canceled,
    };
  });
}

/** Match a charge to its subscription (for plan name / covered period). */
export function matchSubscription(tx: any, subscriptions: any[]): any | null {
  if (!tx || !subscriptions?.length) return null;
  if (tx.stripe_subscription_id) {
    const m = subscriptions.find((s: any) => s?.stripe_subscription_id === tx.stripe_subscription_id);
    if (m) return m;
  }
  if (tx.stripe_customer_id) {
    const m = subscriptions.find((s: any) => s?.stripe_customer_id === tx.stripe_customer_id);
    if (m) return m;
  }
  if (tx.student_id && tx.stripe_price_id) {
    const m = subscriptions.find(
      (s: any) => s?.student_id === tx.student_id && s?.stripe_price_id === tx.stripe_price_id,
    );
    if (m) return m;
  }
  return null;
}

export function paymentPlanLabel(tx: any, sub: any | null): string {
  return (
    tx?.product_name ||
    tx?.description ||
    sub?.plan_name ||
    (tx?.metadata?.plan_tier
      ? String(tx.metadata.plan_tier).charAt(0).toUpperCase() + String(tx.metadata.plan_tier).slice(1)
      : null) ||
    sub?.plan_tier ||
    '—'
  );
}

/**
 * Covered period of a charge: the matched subscription's current period,
 * but only when the charge date falls inside it (older charges belong to
 * earlier periods that the database does not keep). Otherwise '—'.
 */
export function paymentPeriodLabel(tx: any, sub: any | null): string {
  if (!sub) return '—';
  const start = String(sub.current_period_start || '').slice(0, 10);
  const end = String(sub.current_period_end || '').slice(0, 10);
  if (!start || !end) return '—';
  const k = paymentDateKey(tx);
  if (!k || k < start || k > end) return '—';
  return `${start} → ${end}`;
}

export function paymentMethodLabel(tx: any): string {
  return tx?.metadata?.payment_method || tx?.metadata?.method || tx?.payment_method || 'Stripe';
}

// ---- CSV ------------------------------------------------------------------

function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Amounts: plain numbers with 2 decimals — no $ sign, no thousands commas. */
function csvAmount(n: number): string {
  return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
}

export function subscriptionPaymentsToCsv(
  rows: any[],
  subscriptions: any[],
  es: boolean,
): string {
  const head = ['fecha', 'alumno', 'plan', 'monto', 'moneda', 'estado', 'periodo cubierto', 'método de pago'];
  const lines = [head.join(',')];
  for (const tx of rows) {
    const sub = matchSubscription(tx, subscriptions);
    lines.push(
      [
        csvCell(paymentDateKey(tx)),
        csvCell(tx.student_name || tx.student_email || '—'),
        csvCell(paymentPlanLabel(tx, sub)),
        csvAmount(Number(tx.amount) || 0),
        csvCell(String(tx.currency || 'mxn').toUpperCase()),
        csvCell(subStatusLabel(tx.status, es)),
        csvCell(paymentPeriodLabel(tx, sub)),
        csvCell(paymentMethodLabel(tx)),
      ].join(','),
    );
  }
  return lines.join('\r\n');
}

export function subscriptionMonthlySummaryToCsv(rows: SubscriptionMonthRow[]): string {
  const head = ['mes', 'cobros pagados', 'total MXN', 'suscriptores activos', 'altas', 'bajas'];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.month),
        String(r.paidCount),
        csvAmount(r.totalMxn),
        String(r.active),
        String(r.started),
        String(r.canceled),
      ].join(','),
    );
  }
  return lines.join('\r\n');
}

/** Downloads UTF-8 CSV (with BOM so Excel shows accents correctly). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function todayKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
