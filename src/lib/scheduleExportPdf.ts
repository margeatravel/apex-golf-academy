import jsPDF from 'jspdf';

const BG: [number, number, number] = [13, 31, 24];
const GOLD: [number, number, number] = [240, 192, 64];
const IVORY: [number, number, number] = [245, 240, 232];
const MUTED: [number, number, number] = [170, 180, 170];

function clean(s: string): string {
  return (s ?? '').replace(/[\u2013\u2014]/g, '-').replace(/[^\x00-\xFF]/g, '');
}

export interface PdfTable {
  title: string;
  subtitle: string;
  columns: { label: string; width: number }[];
  rows: string[][];
  footer?: string;
}

/** Simple dark Apex-styled table PDF. */
export function buildTablePdf(t: PdfTable): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 14;
  const paintBg = () => { doc.setFillColor(...BG); doc.rect(0, 0, W, H, 'F'); };
  const header = () => {
    paintBg();
    doc.setTextColor(...GOLD); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text('APEX', M, 18);
    doc.setTextColor(...IVORY); doc.setFontSize(14);
    doc.text(clean(t.title), M, 27);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text(clean(t.subtitle), M, 33);
    let x = M;
    doc.setFillColor(28, 52, 40); doc.rect(M, 38, W - 2 * M, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...GOLD); doc.setFontSize(9);
    t.columns.forEach((c) => { doc.text(clean(c.label), x + 2, 43.5); x += c.width; });
    return 50;
  };
  let y = header();
  doc.setFontSize(9);
  t.rows.forEach((r, i) => {
    if (y > H - 18) { doc.addPage(); y = header(); }
    if (i % 2 === 0) { doc.setFillColor(20, 42, 32); doc.rect(M, y - 4.5, W - 2 * M, 7, 'F'); }
    let x = M;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...IVORY);
    r.forEach((cell, ci) => {
      const w = t.columns[ci].width;
      const txt = doc.splitTextToSize(clean(cell), w - 3)[0] ?? '';
      doc.text(txt, x + 2, y);
      x += w;
    });
    y += 7;
  });
  if (t.footer) {
    if (y > H - 18) { doc.addPage(); y = header(); }
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...GOLD);
    doc.text(clean(t.footer), M, y + 4);
  }
  return doc.output('blob');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
