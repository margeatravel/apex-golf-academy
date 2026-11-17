import { jsPDF } from 'jspdf';

export interface RevenueReportInput {
  es: boolean;
  coachName: string;
  today: string;
  students: Array<{ name: string; pkgName: string; price: number; remaining: number; schedule: string }>;
  tiers: Array<{ price: number; count: number; pct: string }>;
  slots: Array<{ weekday: number; time: string; name: string; minutes: number }>;
  weekly: Array<{ week: string; hours: number }>;
  recurringHours: number;
  months: Array<{ month: string; revenue: number }>;
  year: number;
  avgMonthly: number;
  projection: Array<{ date: string; value: number }>;
  projectionTotal: number;
  horizonLabel: string;
  /** Projection with the coach's saved price scenario applied (if any). */
  scenarioTotal?: number;
  renewals?: Array<{ name: string; price: number; renewing: boolean; count: number }>;
  pending?: Array<{ name: string; pkgName: string; used: number; total: number; remaining: number; scheduled: number; pricePerClass: number; value: number }>;
  extras?: RevenueReportExtras;
}

/** Data owned by the Revenue page (KPIs, Revenue Trend, Accounts Receivable). */
export interface RevenueReportExtras {
  kpis?: { mtd: number; last30: number; last90: number; ytd: number };
  trend?: {
    periodLabel: string;
    periodTotal: number;
    monthlyYear: number;
    monthly: Array<{ month: string; revenue: number }>;
    weekly: Array<{ date: string; revenue: number }>;
    daily: Array<{ date: string; revenue: number }>;
    topStudents: Array<{ name: string; revenue: number; lessons: number }>;
  };
  receivables?: {
    total: number;
    lessonsTotal: number;
    packagesTotal: number;
    lessons: Array<{ name: string; date: string; type: string; amount: number }>;
    packages: Array<{ name: string; pkgName: string; kind: 'partial' | 'pending'; price: number; paid: number; balance: number }>;
  };
}

const BG: [number, number, number] = [13, 31, 24];
const CARD: [number, number, number] = [22, 48, 37];
const GREEN: [number, number, number] = [74, 124, 89];
const GOLD: [number, number, number] = [240, 192, 64];
const IVORY: [number, number, number] = [245, 240, 225];
const MUTED: [number, number, number] = [160, 175, 165];

const mxn = (n: number) => `$${Math.round(n).toLocaleString('en-US')} MXN`;
const short = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MEN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function buildRevenueReportPdf(d: RevenueReportInput): Blob {
  const t = (es: string, en: string) => (d.es ? es : en);
  const M = d.es ? MES : MEN;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, X = 14;
  let y = 0;

  const paintBg = () => { doc.setFillColor(...BG); doc.rect(0, 0, W, H, 'F'); };
  const footer = () => {
    doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`Apex Golf Academy · ${d.coachName} · ${d.today}`, X, H - 8);
    doc.text(String(doc.getNumberOfPages()), W - X, H - 8, { align: 'right' });
  };
  const newPage = () => { footer(); doc.addPage(); paintBg(); y = 18; };
  const ensure = (h: number) => { if (y + h > H - 16) newPage(); };
  const section = (title: string, next = 0) => {
    if (y > 30) y += 4;
    ensure(18 + next);
    doc.setFillColor(...GOLD); doc.rect(X, y - 4, 2, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...GOLD);
    doc.text(title, X + 5, y + 1); y += 9;
  };
  type Cell = string | { v: string; c?: [number, number, number]; b?: boolean };
  /** Striped table that repeats its header on page breaks. `cols` = x offsets from X; `aligns` 'r' right-aligns at next col. */
  const table = (head: string[], cols: number[], rows: Cell[][], widths: number[]) => {
    const drawHead = () => {
      doc.setFillColor(...GREEN); doc.rect(X, y, W - 2 * X, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...IVORY);
      head.forEach((h, i) => doc.text(h, X + cols[i], y + 4.8)); y += 7;
    };
    ensure(14); drawHead();
    rows.forEach((r, i) => {
      if (y + 7 > H - 16) { newPage(); drawHead(); }
      if (i % 2 === 0) { doc.setFillColor(...CARD); doc.rect(X, y, W - 2 * X, 7, 'F'); }
      r.forEach((cell, j) => {
        const c = typeof cell === 'string' ? { v: cell } : cell;
        doc.setFont('helvetica', c.b ? 'bold' : 'normal'); doc.setFontSize(8);
        doc.setTextColor(...(c.c || IVORY));
        doc.text(doc.splitTextToSize(c.v || '—', widths[j])[0] || '—', X + cols[j], y + 4.8);
      });
      y += 7;
    });
    y += 5;
  };
  const totalRow = (label: string, value: string) => {
    ensure(9);
    doc.setFillColor(...CARD); doc.setDrawColor(...GOLD); doc.setLineWidth(0.3);
    doc.roundedRect(X, y, W - 2 * X, 8, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...IVORY);
    doc.text(label, X + 3, y + 5.4);
    doc.setTextColor(...GOLD); doc.text(value, W - X - 3, y + 5.4, { align: 'right' });
    y += 11;
  };
  const note = (txt: string) => {
    ensure(7);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(txt, X, y + 3); y += 7;
  };
  const fdate = (ds: string) => { const m = Number(ds.slice(5, 7)); return m ? `${ds.slice(8, 10)} ${M[m - 1]} ${ds.slice(2, 4)}` : ds; };

  // ---- Cover header
  paintBg();
  doc.setFillColor(...BG); doc.setDrawColor(...GOLD); doc.setLineWidth(0.8);
  doc.roundedRect(X, 14, 16, 16, 3, 3, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...GOLD);
  doc.text('A', X + 8, 25, { align: 'center' });
  doc.setFontSize(20); doc.setTextColor(...IVORY);
  doc.text(t('Reporte de ingresos y horas', 'Revenue & hours report'), X + 22, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTED);
  doc.text(`${d.coachName} · ${t('Generado', 'Generated')} ${d.today}`, X + 22, 28);
  doc.setDrawColor(...GREEN); doc.setLineWidth(0.4); doc.line(X, 36, W - X, 36);
  y = 44;

  // ---- Summary cards
  const yearTotal = d.months.reduce((s, m) => s + m.revenue, 0);
  const avgHours = d.weekly.length ? d.weekly.reduce((s, w) => s + w.hours, 0) / d.weekly.length : 0;
  const cards: Array<[string, string]> = [
    [t('Alumnos activos', 'Active students'), String(d.students.length)],
    [t('Horas/semana (prom. 12 sem)', 'Hours/week (12-wk avg)'), avgHours.toFixed(1)],
    [t('Horas/semana recurrentes', 'Recurring hours/week'), d.recurringHours.toFixed(1)],
    [t('Ingreso promedio mensual', 'Avg monthly income'), mxn(d.avgMonthly)],
    [t(`Total ${d.year}`, `${d.year} total`), mxn(yearTotal)],
    [t(`Proyección (${d.horizonLabel})`, `Projection (${d.horizonLabel})`), mxn(d.projectionTotal)],
  ];
  const ex = d.extras;
  const pendingClasses = (d.pending || []).reduce((s, p) => s + p.remaining, 0);
  const pendingValue = (d.pending || []).reduce((s, p) => s + p.value, 0);
  if (ex?.kpis) {
    cards.push(
      [t('Mes en curso', 'Month to date'), mxn(ex.kpis.mtd)],
      [t('Últimos 30 días', 'Last 30 days'), mxn(ex.kpis.last30)],
      [t('Últimos 90 días', 'Last 90 days'), mxn(ex.kpis.last90)],
    );
  }
  if (ex?.receivables) cards.push([t('Por cobrar', 'Receivable'), mxn(ex.receivables.total)]);
  if (d.pending) {
    cards.push([t('Clases por dar', 'Lessons to teach'), String(pendingClasses)]);
    cards.push([t('Valor clases por dar', 'Value of lessons owed'), mxn(pendingValue)]);
  }
  const cw = (W - 2 * X - 8) / 3;
  cards.forEach(([label, val], i) => {
    const cx = X + (i % 3) * (cw + 4), cy = y + Math.floor(i / 3) * 24;
    doc.setFillColor(...CARD); doc.roundedRect(cx, cy, cw, 20, 2, 2, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(label, cx + 4, cy + 7);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(i >= 3 ? GOLD[0] : IVORY[0], i >= 3 ? GOLD[1] : IVORY[1], i >= 3 ? GOLD[2] : IVORY[2]);
    doc.text(val, cx + 4, cy + 15);
  });
  y += Math.ceil(cards.length / 3) * 24 + 6;

  // ---- Bar chart helper
  const bars = (labels: string[], vals: number[], fmt: (n: number) => string, color: [number, number, number]) => {
    const h = 55, w = W - 2 * X; ensure(h + 12);
    doc.setFillColor(...CARD); doc.roundedRect(X, y, w, h + 10, 2, 2, 'F');
    const max = Math.max(1, ...vals), n = Math.max(1, vals.length), slot = (w - 10) / n, bw = Math.min(10, slot * 0.6);
    const dense = n > 16;
    vals.forEach((v, i) => {
      const bh = (v / max) * (h - 12), bx = X + 5 + i * slot + (slot - bw) / 2, by = y + h - bh;
      doc.setFillColor(...color); if (bh > 0) doc.rect(bx, by, bw, bh, 'F');
      doc.setFontSize(6.5); doc.setTextColor(...IVORY);
      if (v > 0 && (!dense || i % 2 === 0)) doc.text(fmt(v), bx + bw / 2, by - 1.5, { align: 'center' });
      doc.setTextColor(...MUTED); if (!dense || i % 2 === 0) doc.text(labels[i], bx + bw / 2, y + h + 5, { align: 'center' });
    });
    y += h + 16;
  };

  // ---- Yearly income by month
  section(t(`Ingresos ${d.year} por mes`, `${d.year} income by month`), 71);
  bars(d.months.map((m) => M[Number(m.month.slice(5, 7)) - 1]), d.months.map((m) => m.revenue), short, GOLD);

  // ---- Revenue Trend (from the Revenue page)
  if (ex?.trend) {
    const tr = ex.trend;
    section(t(`Revenue Trend · ${tr.periodLabel}`, `Revenue Trend · ${tr.periodLabel}`), 71);
    note(`${t('Total del periodo', 'Period total')}: ${mxn(tr.periodTotal)}`);
    if (tr.weekly.length) {
      bars(tr.weekly.map((w) => w.date.slice(5).replace('-', '/')), tr.weekly.map((w) => w.revenue), short, GOLD);
    }
    section(t(`Ingresos mensuales ${tr.monthlyYear}`, `Monthly revenue ${tr.monthlyYear}`), 21);
    const cur = d.today.slice(0, 7);
    const mRows = tr.monthly.map((m, i) => {
      const prev = i > 0 ? tr.monthly[i - 1].revenue : 0;
      const delta = i > 0 && prev > 0 && m.month <= cur ? `${m.revenue >= prev ? '+' : ''}${Math.round(((m.revenue - prev) / prev) * 100)}%` : '—';
      return [M[Number(m.month.slice(5, 7)) - 1] + ' ' + m.month.slice(0, 4), { v: mxn(m.revenue), c: GOLD, b: true }, { v: delta, c: delta.startsWith('-') ? MUTED : IVORY }] as Cell[];
    });
    table([t('Mes', 'Month'), t('Ingreso', 'Revenue'), t('vs mes anterior', 'vs prev. month')], [3, 70, 130], mRows, [60, 55, 50]);
    totalRow(t(`Total ${tr.monthlyYear}`, `${tr.monthlyYear} total`), mxn(tr.monthly.reduce((s, m) => s + m.revenue, 0)));
    if (tr.daily.length) {
      section(t(`Ingresos por día · ${tr.periodLabel}`, `Daily revenue · ${tr.periodLabel}`), 21);
      table([t('Fecha', 'Date'), t('Ingreso', 'Revenue')], [3, 70], tr.daily.filter((x) => x.revenue !== 0).map((x) => [fdate(x.date), { v: mxn(x.revenue), c: GOLD }]), [60, 60]);
    }
    if (tr.topStudents.length) {
      section(t('Ingresos por alumno (top 15)', 'Revenue by student (top 15)'), 21);
      table([t('Alumno', 'Student'), t('Clases', 'Lessons'), t('Ingreso', 'Revenue')], [3, 100, 130],
        tr.topStudents.slice(0, 15).map((x) => [x.name, String(x.lessons), { v: mxn(x.revenue), c: GOLD, b: true }]), [92, 25, 50]);
    }
  }

  // ---- Projection line
  section(t(`Proyección con renovaciones · ${d.horizonLabel}`, `Projection with renewals · ${d.horizonLabel}`), 71);
  {
    const h = 55, w = W - 2 * X; ensure(h + 12);
    doc.setFillColor(...CARD); doc.roundedRect(X, y, w, h + 10, 2, 2, 'F');
    const pts = d.projection; const max = Math.max(1, ...pts.map((p) => p.value));
    const step = pts.length > 1 ? (w - 20) / (pts.length - 1) : 0;
    const P = pts.map((p, i) => [X + 10 + i * step, y + h - (p.value / max) * (h - 14)] as const);
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.8);
    for (let i = 1; i < P.length; i++) doc.line(P[i - 1][0], P[i - 1][1], P[i][0], P[i][1]);
    const every = Math.ceil(pts.length / 12);
    P.forEach(([px, py], i) => {
      doc.setFillColor(...GOLD); doc.circle(px, py, 0.9, 'F');
      if (i % every) return;
      doc.setFontSize(6.5); doc.setTextColor(...IVORY); doc.text(short(pts[i].value), px, py - 2.5, { align: 'center' });
      const ds = pts[i].date; doc.setTextColor(...MUTED);
      doc.text(`${M[Number(ds.slice(5, 7)) - 1]} ${ds.slice(8, 10) === '01' ? ds.slice(2, 4) : ds.slice(8, 10)}`, px, y + h + 5, { align: 'center' });
    });
    y += h + 16;
  }

  // ---- Projection detail
  {
    section(t('Detalle de proyección', 'Projection detail'), 21);
    table([t('Periodo', 'Period'), t('Ingreso proyectado', 'Projected revenue')], [3, 90],
      d.projection.map((p) => [fdate(p.date), { v: mxn(p.value), c: GOLD, b: true }]), [80, 70]);
    totalRow(t(`Total proyectado (${d.horizonLabel})`, `Projected total (${d.horizonLabel})`), mxn(d.projectionTotal));
    if (d.scenarioTotal != null && Math.round(d.scenarioTotal) !== Math.round(d.projectionTotal)) {
      totalRow(t('Con tu escenario de precios guardado', 'With your saved price scenario'), mxn(d.scenarioTotal));
    }
    if (d.renewals?.length) {
      section(t('Renovaciones esperadas por alumno', 'Expected renewals by student'), 21);
      table([t('Alumno', 'Student'), t('$/clase', '$/class'), t('¿Renueva?', 'Renews?'), t('Clases proyectadas', 'Projected lessons')], [3, 80, 112, 140],
        d.renewals.map((r) => [r.name, { v: r.price ? `$${Math.round(r.price).toLocaleString('en-US')}` : '—', c: GOLD }, { v: r.renewing ? t('Sí', 'Yes') : 'No', c: r.renewing ? IVORY : MUTED }, String(r.count)]), [74, 28, 25, 40]);
    }
  }

  // ---- Accounts receivable
  if (ex?.receivables) {
    const ar = ex.receivables;
    section(t('Cuentas por cobrar', 'Accounts receivable'), 21);
    if (ar.lessons.length) {
      table([t('Alumno', 'Student'), t('Fecha', 'Date'), t('Tipo', 'Type'), t('Monto', 'Amount')], [3, 80, 112, 150],
        ar.lessons.map((l) => [l.name, fdate(l.date), l.type, { v: mxn(l.amount), c: GOLD, b: true }]), [74, 30, 36, 30]);
      totalRow(t(`Clases por cobrar (${ar.lessons.length})`, `Lessons receivable (${ar.lessons.length})`), mxn(ar.lessonsTotal));
    }
    if (ar.packages.length) {
      table([t('Alumno', 'Student'), t('Paquete', 'Package'), t('Precio', 'Price'), t('Pagado', 'Paid'), t('Saldo', 'Balance')], [3, 58, 106, 132, 156],
        ar.packages.map((p) => [p.name, `${p.pkgName}${p.kind === 'partial' ? t(' (parcial)', ' (partial)') : ''}`, mxn(p.price).replace(' MXN', ''), mxn(p.paid).replace(' MXN', ''), { v: mxn(p.balance).replace(' MXN', ''), c: GOLD, b: true }]), [52, 46, 24, 22, 26]);
      totalRow(t(`Paquetes por cobrar (${ar.packages.length})`, `Packages receivable (${ar.packages.length})`), mxn(ar.packagesTotal));
    }
    if (!ar.lessons.length && !ar.packages.length) note(t('No hay nada pendiente por cobrar.', 'Nothing pending to collect.'));
    else totalRow(t('Total por cobrar', 'Total receivable'), mxn(ar.total));
  }

  // ---- Lessons still owed on active packages
  if (d.pending) {
    section(t('Clases pendientes por dar (paquetes activos)', 'Lessons still to teach (active packages)'), 21);
    if (d.pending.length) {
      table([t('Alumno', 'Student'), t('Paquete', 'Package'), t('Usadas', 'Used'), t('Rest.', 'Left'), t('Agend.', 'Booked'), t('Valor', 'Value')], [3, 56, 106, 126, 142, 160],
        d.pending.map((p) => [p.name, p.pkgName, `${p.used}/${p.total}`, { v: String(p.remaining), c: GOLD, b: true }, String(p.scheduled), { v: `$${p.value.toLocaleString('en-US')}`, c: GOLD }]), [50, 46, 18, 14, 16, 24]);
      totalRow(t(`Total: ${pendingClasses} clases (~${pendingClasses} h)`, `Total: ${pendingClasses} lessons (~${pendingClasses} h)`), mxn(pendingValue));
      note(t('Valor = precio del paquete / número de clases × clases restantes. "Agend." = ya en calendario.', 'Value = package price / lesson count × lessons left. "Booked" = already on the calendar.'));
    } else note(t('No hay clases pendientes.', 'No lessons pending.'));
  }

  // ---- Weekly hours
  section(t('Horas trabajadas por semana (últimas 12)', 'Hours worked per week (last 12)'), 71);
  bars(d.weekly.map((w) => w.week.slice(5).replace('-', '/')), d.weekly.map((w) => w.hours), (n) => n.toFixed(1), GREEN);

  // ---- Price tiers
  section(t('Cuánto cobro por clase', 'What I charge per class'));
  d.tiers.forEach((tr) => {
    ensure(9);
    doc.setFillColor(...CARD); doc.roundedRect(X, y, W - 2 * X, 7.5, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...GOLD);
    doc.text(`${mxn(tr.price)} ${t('por clase', 'per class')}`, X + 3, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...IVORY);
    doc.text(`${tr.count} ${t(tr.count === 1 ? 'alumno' : 'alumnos', tr.count === 1 ? 'student' : 'students')} · ${tr.pct}`, W - X - 3, y + 5, { align: 'right' });
    y += 9;
  });
  y += 4;

  // ---- Weekly calendar
  section(t('Mi calendario semanal (recurrente)', 'My weekly calendar (recurring)'));
  {
    const order = [1, 2, 3, 4, 5, 6, 0];
    const names = d.es ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const colW = (W - 2 * X) / 7;
    const byDay = order.map((wd) => d.slots.filter((s) => s.weekday === wd).sort((a, b) => a.time.localeCompare(b.time)));
    const rows = Math.max(1, ...byDay.map((x) => x.length));
    const blockH = 11, h = 8 + rows * (blockH + 1.5);
    ensure(Math.min(h, 200));
    const top = y;
    order.forEach((wd, i) => {
      const cx = X + i * colW;
      doc.setFillColor(...GREEN); doc.rect(cx + 0.5, top, colW - 1, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...IVORY);
      const hrs = byDay[i].reduce((a, x) => a + x.minutes, 0) / 60;
      doc.text(hrs ? `${names[wd]} · ${Number(hrs.toFixed(1))}h` : names[wd], cx + colW / 2, top + 4.2, { align: 'center' });
      byDay[i].forEach((s, j) => {
        const by = top + 8 + j * (blockH + 1.5);
        doc.setFillColor(...CARD); doc.roundedRect(cx + 0.5, by, colW - 1, blockH, 1, 1, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...GOLD);
        doc.text(s.time, cx + 2, by + 4);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...IVORY);
        doc.text(doc.splitTextToSize(s.name, colW - 3)[0], cx + 2, by + 8.5);
      });
    });
    y = top + h + 6;
    totalRow(t('Horas de trabajo por semana (horario recurrente)', 'Work hours per week (recurring schedule)'), `${d.recurringHours.toFixed(1)} h`);
    note(t('Horarios cada 2+ semanas cuentan proporcionalmente.', 'Every-2+-week slots count proportionally.'));
  }

  // ---- Students table
  section(t('Mis alumnos', 'My students'), 21);
  const cols = [X + 3, X + 55, X + 100, X + 122, X + 136];
  const head = [t('Alumno', 'Student'), t('Paquete', 'Package'), t('$/clase', '$/class'), t('Rest.', 'Left'), t('Horario', 'Schedule')];
  const drawHead = () => {
    doc.setFillColor(...GREEN); doc.rect(X, y, W - 2 * X, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...IVORY);
    head.forEach((h, i) => doc.text(h, cols[i], y + 4.8)); y += 7;
  };
  drawHead();
  d.students.forEach((s, i) => {
    if (y + 7 > H - 16) { newPage(); drawHead(); }
    if (i % 2 === 0) { doc.setFillColor(...CARD); doc.rect(X, y, W - 2 * X, 7, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...IVORY);
    doc.text(doc.splitTextToSize(s.name, 50)[0], cols[0], y + 4.8);
    doc.text(doc.splitTextToSize(s.pkgName, 42)[0], cols[1], y + 4.8);
    doc.setTextColor(...GOLD); doc.text(s.price ? `$${Math.round(s.price).toLocaleString('en-US')}` : '—', cols[2], y + 4.8);
    doc.setTextColor(...IVORY); doc.text(String(s.remaining), cols[3], y + 4.8);
    doc.text(doc.splitTextToSize(s.schedule || '—', 44)[0], cols[4], y + 4.8);
    y += 7;
  });

  footer();
  return doc.output('blob');
}
