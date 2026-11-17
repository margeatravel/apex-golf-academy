// Bridges the single "PDF report" button in the Revenue page header to the
// projection chart, which owns the projection state and the PDF builder.
// The page passes its own data (trend, receivables, KPIs) as extras so the
// report includes everything shown on the Revenue page.
import type { RevenueReportExtras } from './revenueReportPdf';

let handler: ((getExtras?: () => RevenueReportExtras) => void) | null = null;

export function setRevenuePdfHandler(fn: ((getExtras?: () => RevenueReportExtras) => void) | null) {
  handler = fn;
}

/** `getExtras` is read when the PDF is built, so it reflects fully loaded page data. */
export function downloadRevenuePdfReport(getExtras?: () => RevenueReportExtras) {
  handler?.(getExtras);
}
