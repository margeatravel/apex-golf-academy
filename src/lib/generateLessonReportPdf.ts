import jsPDF from 'jspdf';
import { getPdfTierTheme, type ReportTier } from '@/lib/generateScoringReport';

type RGB = [number, number, number];

/** Strip characters jsPDF helvetica cannot render. */
function sanitize(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x00-\xFF]/g, '');
}

type Line = { text: string; level: 'h1' | 'h2' | 'h3' | 'body' | 'bullet' };

function toLines(md: string): Line[] {
  const out: Line[] = [];
  for (const raw of md.split('\n')) {
    const line = sanitize(raw.trim());
    if (!line) { out.push({ text: '', level: 'body' }); continue; }
    if (line.startsWith('### ')) out.push({ text: line.slice(4).replace(/\*\*/g, ''), level: 'h3' });
    else if (line.startsWith('## ')) out.push({ text: line.slice(3).replace(/\*\*/g, ''), level: 'h2' });
    else if (line.startsWith('# ')) out.push({ text: line.slice(2).replace(/\*\*/g, ''), level: 'h1' });
    else if (/^[-*]\s+/.test(line)) out.push({ text: line.replace(/^[-*]\s+/, '').replace(/\*\*/g, ''), level: 'bullet' });
    else out.push({ text: line.replace(/\*\*/g, ''), level: 'body' });
  }
  return out;
}

export interface LessonReportPdfParams {
  studentName: string;
  content: string;
  dateStart: string;
  dateEnd: string;
  /** Same tier value the in-app badge uses. */
  tier?: ReportTier | null;
  /** Localized labels so the PDF matches the UI language. */
  labels?: { eyebrow?: string; period?: string; fileName?: string };
}

/**
 * Lesson Report PDF — uses the same visual template as the Scoring Report
 * (header band, tier accent, typography, footer). Content is unchanged.
 */
export function generateLessonReportPdf({
  studentName,
  content,
  dateStart,
  dateEnd,
  tier = 'free',
  labels,
}: LessonReportPdfParams) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 40;
  const CW = W - MARGIN * 2;

  const T = getPdfTierTheme(tier);
  const HEADER: RGB = T.header;
  const ACCENT: RGB = T.accent;
  const CHART: RGB = T.chart;
  const tint = (alpha: number): RGB => [
    Math.round(255 + (CHART[0] - 255) * alpha),
    Math.round(255 + (CHART[1] - 255) * alpha),
    Math.round(255 + (CHART[2] - 255) * alpha),
  ];

  // ---------- Header band (same as Scoring Report) ----------
  const HDR_H = 104;
  doc.setFillColor(...HEADER);
  doc.rect(0, 0, W, HDR_H, 'F');
  doc.setFillColor(...ACCENT);
  doc.rect(0, HDR_H - 5, W, 5, 'F');

  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(1);
  doc.roundedRect(MARGIN, 20, 26, 26, 6, 6, 'S');
  doc.setTextColor(...ACCENT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('A', MARGIN + 13, 39, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('Apex Golf Academy', MARGIN + 36, 31);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(235, 235, 235);
  doc.text('by Santiago Castilla', MARGIN + 36, 42);

  doc.setFontSize(8);
  doc.setTextColor(230, 230, 230);
  doc.text(sanitize(labels?.eyebrow || 'LESSON REPORT').toUpperCase(), MARGIN, 62);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(sanitize(studentName), MARGIN, 84);

  const badgeX = MARGIN + doc.getTextWidth(sanitize(studentName)) + 12;
  doc.setFontSize(8);
  const badgeW = doc.getTextWidth(T.label.toUpperCase()) + 16;
  doc.setFillColor(...ACCENT);
  doc.roundedRect(badgeX, 71, badgeW, 15, 7.5, 7.5, 'F');
  doc.setTextColor(30, 30, 30);
  doc.text(T.label.toUpperCase(), badgeX + badgeW / 2, 81.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(210, 210, 210);
  doc.text(sanitize(labels?.period || 'PERIOD').toUpperCase(), W - MARGIN, 40, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(sanitize(`${dateStart} — ${dateEnd}`), W - MARGIN, 51, { align: 'right' });

  // ---------- Body ----------
  let y = HDR_H + 30;
  const newPage = () => { doc.addPage(); y = MARGIN + 4; };
  const need = (h: number) => { if (y + h > H - 56) newPage(); };

  for (const line of toLines(content)) {
    if (!line.text) { y += 5; continue; }

    if (line.level === 'h1') {
      need(34);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(...HEADER);
      const wrapped = doc.splitTextToSize(line.text, CW) as string[];
      wrapped.forEach((w) => { doc.text(w, MARGIN, y); y += 18; });
      doc.setFillColor(...ACCENT);
      doc.rect(MARGIN, y - 6, 46, 3, 'F');
      y += 16;
      continue;
    }

    if (line.level === 'h2') {
      need(30);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...HEADER);
      doc.text(line.text, MARGIN, y);
      doc.setFillColor(...ACCENT);
      doc.rect(MARGIN, y + 5, 36, 2.5, 'F');
      y += 22;
      continue;
    }

    if (line.level === 'h3') {
      need(20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(70, 70, 70);
      doc.text(line.text, MARGIN, y);
      y += 15;
      continue;
    }

    if (line.level === 'bullet') {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      const innerX = MARGIN + 16;
      const wrapped = doc.splitTextToSize(line.text, CW - 22) as string[];
      const blockH = wrapped.length * 12 + 8;
      need(blockH);
      doc.setFillColor(...tint(0.07));
      doc.roundedRect(MARGIN, y - 10, CW, blockH, 5, 5, 'F');
      doc.setFillColor(...CHART);
      doc.circle(MARGIN + 8, y - 3, 2, 'F');
      doc.setTextColor(55, 55, 55);
      wrapped.forEach((w) => { doc.text(w, innerX, y); y += 12; });
      y += 6;
      continue;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(55, 55, 55);
    const wrapped = doc.splitTextToSize(line.text, CW) as string[];
    need(wrapped.length * 12);
    wrapped.forEach((w) => { doc.text(w, MARGIN, y); y += 12; });
    y += 4;
  }

  // ---------- Footer ----------
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(232, 232, 232);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, H - 32, W - MARGIN, H - 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text('Apex Golf Academy   ·   margeagolfacademy.com', MARGIN, H - 20);
    doc.text(`Page ${p} of ${pageCount}`, W - MARGIN, H - 20, { align: 'right' });
  }

  const fileSafe = studentName.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'student';
  doc.save(`${labels?.fileName || 'lesson-report'}_${fileSafe}_${dateStart}.pdf`);
}
