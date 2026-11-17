import { supabase } from '@/integrations/supabase/client';
import { generateScoringReport, type ReportTier } from '@/lib/generateScoringReport';
import { generateLessonReportPdf } from '@/lib/generateLessonReportPdf';
import type { RoundRow } from '@/components/RoundsList';
import type { HolesFilter } from '@/lib/roundsFilterStore';

export type ReportType = 'lesson' | 'scoring';

/**
 * Lesson reports a student may generate for themselves per calendar month.
 * Mirrored in supabase/functions/generate-student-report (server-side check).
 */
export const MAX_STUDENT_LESSON_REPORTS_PER_MONTH = 10;

export interface StoredReport {
  id: string;
  student_id: string;
  created_by: string;
  title: string;
  content: string;
  date_range_start: string;
  date_range_end: string;
  shared_with_student: boolean;
  hidden_by_student: boolean;
  generated_by_student: boolean;
  report_type: ReportType;
  created_at: string;
}

/** Payload stored in `content` for scoring reports (rebuilt into a PDF on demand). */
export interface ScoringSnapshot {
  v: 1;
  studentName: string;
  handicap: number | null;
  tier: ReportTier | null;
  holesFilter: HolesFilter | 'all' | 'both';
  rounds: RoundRow[];
  periodLabel?: string;
}

export function parseScoringSnapshot(content: string): ScoringSnapshot | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && Array.isArray(parsed.rounds)) return parsed as ScoringSnapshot;
  } catch {
    /* not a snapshot */
  }
  return null;
}

/** Localized date range, e.g. ES "1 – 30 sep 2026", EN "Sep 1 – 30, 2026". */
export function formatReportRange(start: string, end: string, locale: string): string {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  const isEs = locale.toLowerCase().startsWith('es');
  const month = (d: Date) => d.toLocaleDateString(locale, { month: 'short' }).replace('.', '');
  if (isEs) {
    const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    return sameMonth
      ? `${a.getDate()} – ${b.getDate()} ${month(b)} ${b.getFullYear()}`
      : `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)} ${b.getFullYear()}`;
  }
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return sameMonth
    ? `${month(a)} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`
    : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}, ${b.getFullYear()}`;
}

/** Regenerates and downloads the PDF for a stored report of either type. */
export function downloadStoredReport(
  report: StoredReport,
  opts: { studentName: string; tier?: ReportTier | null; labels?: { eyebrow?: string; period?: string; fileName?: string } },
) {
  if (report.report_type === 'scoring') {
    const snap = parseScoringSnapshot(report.content);
    if (!snap) throw new Error('Report data unavailable');
    generateScoringReport({
      studentName: snap.studentName || opts.studentName,
      handicap: snap.handicap ?? null,
      rounds: snap.rounds,
      holesFilter: snap.holesFilter === '9' || snap.holesFilter === '18' ? snap.holesFilter : 'both',
      tier: snap.tier ?? opts.tier ?? 'free',
      periodLabel: snap.periodLabel,
    });
    return;
  }
  generateLessonReportPdf({
    studentName: opts.studentName,
    content: report.content,
    dateStart: report.date_range_start,
    dateEnd: report.date_range_end,
    tier: opts.tier ?? 'free',
    labels: opts.labels,
  });
}

interface SaveScoringArgs {
  studentId: string;
  createdBy: string;
  title: string;
  dateStart: string;
  dateEnd: string;
  snapshot: ScoringSnapshot;
  generatedByStudent: boolean;
  sharedWithStudent?: boolean;
}

/** Persists a scoring report so it shows in both the admin list and the student's Reports tab. */
export async function saveScoringReport(args: SaveScoringArgs) {
  const { error } = await supabase.from('student_reports').insert({
    student_id: args.studentId,
    created_by: args.createdBy,
    title: args.title,
    date_range_start: args.dateStart,
    date_range_end: args.dateEnd,
    content: JSON.stringify(args.snapshot),
    report_type: 'scoring',
    generated_by_student: args.generatedByStudent,
    shared_with_student: args.sharedWithStudent ?? false,
  } as any);
  if (error) throw error;
}

/** Rounds bounds as a YYYY-MM-DD range (used when the student generates from Round Stats). */
export function roundsDateRange(rounds: RoundRow[]): { start: string; end: string } {
  const dates = rounds.map((r) => r.played_on).sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

/** Unified report title: "[Student name] — [date range]". */
export function reportTitle(studentName: string, start: string, end: string, locale = 'en-US'): string {
  return `${studentName} — ${formatReportRange(start, end, locale)}`;
}

/** Title shown for a stored report, always in the active language. */
export function reportDisplayTitle(report: StoredReport, studentName: string, locale: string): string {
  return reportTitle(studentName, report.date_range_start, report.date_range_end, locale);
}
