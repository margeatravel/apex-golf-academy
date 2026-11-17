import jsPDF from 'jspdf';
import { generateScoringReport, type ReportTier } from '@/lib/generateScoringReport';
import { parseScoringSnapshot, type StoredReport } from '@/lib/studentReports';

/**
 * Builds the EXACT same PDF the download produces, but as a Blob so it can be
 * shown in an embedded viewer.
 *
 * `generateScoringReport` ends with `doc.save(...)` and must not be modified,
 * so we temporarily intercept jsPDF's `save` to capture the document instead of
 * triggering a file download. The interception is always restored.
 */
export function buildScoringReportBlob(params: {
  studentName: string;
  handicap: number | null;
  rounds: any[];
  holesFilter?: any;
  tier?: ReportTier | null;
}): Blob {
  const proto = (jsPDF as any).prototype;
  const originalSave = proto.save;
  let blob: Blob | null = null;
  proto.save = function patchedSave(this: any) {
    blob = this.output('blob') as Blob;
    return this;
  };
  try {
    generateScoringReport(params as any);
  } finally {
    proto.save = originalSave;
  }
  if (!blob) throw new Error('Scoring PDF could not be generated');
  return blob;
}

/** Same PDF as `downloadStoredReport` for a stored scoring report, as a Blob. */
export function buildStoredScoringReportBlob(
  report: StoredReport,
  opts: { studentName: string; tier?: ReportTier | null },
): Blob {
  const snap = parseScoringSnapshot(report.content);
  if (!snap) throw new Error('Report data unavailable');
  return buildScoringReportBlob({
    studentName: snap.studentName || opts.studentName,
    handicap: snap.handicap ?? null,
    rounds: snap.rounds,
    holesFilter: snap.holesFilter === '9' || snap.holesFilter === '18' ? snap.holesFilter : 'both',
    tier: snap.tier ?? opts.tier ?? 'free',
  });
}
