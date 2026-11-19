import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

const GREEN: [number, number, number] = [13, 31, 24];
const GOLD: [number, number, number] = [240, 192, 64];
const IVORY: [number, number, number] = [245, 240, 225];

const money = (cents: number) => `$${Math.round((cents || 0) / 100).toLocaleString('en-US')} MXN`;
const interval = (i?: string) => (i === 'year' ? '/año' : i === 'month' ? '/mes' : '');

export async function downloadPlansPdf() {
  const { data, error } = await supabase
    .from('billing_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  const plans = (data || []) as any[];

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const bg = () => { doc.setFillColor(...GREEN); doc.rect(0, 0, W, H, 'F'); };
  bg();
  doc.setTextColor(...GOLD); doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
  doc.text('Margea Golf Academy', M, 60);
  doc.setTextColor(...IVORY); doc.setFontSize(13); doc.setFont('helvetica', 'normal');
  doc.text('Planes, precios y beneficios', M, 82);
  doc.setDrawColor(...GOLD); doc.line(M, 94, W - M, 94);
  let y = 124;

  // Resumen de clientes
  const today = new Date().toISOString().slice(0, 10);
  const [profRes, pkgRes, lesRes, subRes] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('class_packages').select('user_id').eq('is_active', true).is('archived_at', null),
    supabase.from('lessons').select('student_id').eq('status', 'scheduled').gte('lesson_date', today),
    supabase.from('subscriptions').select('student_id, student_email, plan_name, status').in('status', ['active', 'trialing']),
  ]);
  const active = new Set<string>();
  (pkgRes.data || []).forEach((r: any) => r.user_id && active.add(r.user_id));
  (lesRes.data || []).forEach((r: any) => r.student_id && active.add(r.student_id));
  const subs = (subRes.data || []) as any[];
  const subKeys = new Set(subs.map((s) => s.student_id || s.student_email));
  const byPlan: Record<string, number> = {};
  subs.forEach((s) => { const k = s.plan_name || 'Sin nombre'; byPlan[k] = (byPlan[k] || 0) + 1; });
  const rows: [string, string][] = [
    ['Usuarios totales', String(profRes.count ?? 0)],
    ['Clientes con clases o paquete activo', String(active.size)],
    ['Clientes pagando suscripción', String(subKeys.size)],
    ...Object.entries(byPlan).sort((a, b) => b[1] - a[1]).map(([k, v]) => [`   · ${k}`, String(v)] as [string, string]),
  ];
  const sh = 34 + rows.length * 16;
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.8);
  doc.roundedRect(M, y, W - 2 * M, sh, 8, 8, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...GOLD);
  doc.text('Resumen de clientes', M + 12, y + 22);
  let ry = y + 42;
  doc.setFontSize(11);
  rows.forEach(([l, v]) => {
    doc.setFont('helvetica', l.startsWith('   ') ? 'normal' : 'bold'); doc.setTextColor(...IVORY);
    doc.text(l, M + 12, ry); doc.setTextColor(...GOLD); doc.text(v, W - M - 12, ry, { align: 'right' });
    ry += 16;
  });
  y += sh + 18;

  // Historial de precios
  const { data: hist } = await (supabase as any).from('billing_plan_price_history')
    .select('plan_name, old_amount, new_amount, changed_at').order('changed_at', { ascending: false });
  const hrows = (hist || []) as any[];
  if (hrows.length) {
    const hh = 52 + hrows.length * 16;
    doc.roundedRect(M, y, W - 2 * M, hh, 8, 8, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...GOLD);
    doc.text('Historial de ajustes de precios', M + 12, y + 22);
    doc.setFontSize(9); doc.setTextColor(180, 180, 165);
    ['Fecha', 'Plan', 'Antes', 'Ahora'].forEach((t, i) => doc.text(t, [M + 12, M + 100, W - M - 150, W - M - 12][i], y + 38, i >= 2 ? { align: 'right' } : undefined));
    let hy = y + 54; doc.setFontSize(10.5);
    hrows.forEach((r) => {
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...IVORY);
      doc.text(new Date(r.changed_at).toLocaleDateString('es-MX'), M + 12, hy);
      doc.text(String(r.plan_name || ''), M + 100, hy);
      doc.setTextColor(170, 170, 160); doc.text(money(r.old_amount), W - M - 150, hy, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...GOLD); doc.text(money(r.new_amount), W - M - 12, hy, { align: 'right' });
      hy += 16;
    });
    y += hh + 18;
  }

  // Lo que pagan realmente (pago directo, sin comisión de Stripe)
  const direct: [string, string][] = [
    ['1 clase individual', '$1,550 MXN'],
    ['10 clases ($1,400 c/u)', '$14,000 MXN'],
    ['20 clases ($1,250 c/u)', '$25,000 MXN'],
    ['30 clases ($1,100 c/u)', '$33,000 MXN'],
  ];
  const { data: pk } = await supabase.from('class_packages')
    .select('package_size, price, amount_paid, is_active, archived_at');
  const groups: Record<number, { act: number; tot: number; sum: number; cls: number }> = {};
  ((pk || []) as any[]).forEach((r) => {
    const n = Number(r.package_size) || 0; if (!n || n === 7) return;
    const paid = Number(r.price) || Number(r.amount_paid) || 0;
    const g = (groups[n] ||= { act: 0, tot: 0, sum: 0, cls: 0 });
    g.tot++; if (r.is_active && !r.archived_at) g.act++;
    if (paid > 0) { g.sum += paid; g.cls += n; }
  });
  const sizes = Object.keys(groups).map(Number).sort((a, b) => a - b);
  const allSum = sizes.reduce((a, k) => a + groups[k].sum, 0);
  const allCls = sizes.reduce((a, k) => a + groups[k].cls, 0);
  const peso = (n: number) => `$${Math.round(n).toLocaleString('en-US')} MXN`;
  const rh = 70 + direct.length * 15 + 30 + sizes.length * 15 + 26;
  if (y + rh > H - M) { doc.addPage(); bg(); y = M; }
  doc.setDrawColor(...GOLD); doc.roundedRect(M, y, W - 2 * M, rh, 8, 8, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...GOLD);
  doc.text('Lo que pagan realmente', M + 12, y + 22);
  doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(180, 180, 165);
  doc.text('Pago directo (sin comisión de Stripe). En la página es un poco más por la comisión.', M + 12, y + 36);
  let dy = y + 54; doc.setFontSize(10.5);
  direct.forEach(([l, v]) => {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...IVORY); doc.text(l, M + 12, dy);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...GOLD); doc.text(v, W - M - 12, dy, { align: 'right' });
    dy += 15;
  });
  dy += 12;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(180, 180, 165);
  doc.text('Según tus registros', M + 12, dy);
  ['Activos', 'Total', 'Prom. paquete', 'Por clase'].forEach((t, i) => doc.text(t, [W - M - 300, W - M - 240, W - M - 110, W - M - 12][i], dy, { align: 'right' }));
  dy += 16; doc.setFontSize(10.5);
  sizes.forEach((k) => {
    const g = groups[k];
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...IVORY);
    doc.text(`Paquete de ${k}`, M + 12, dy);
    doc.text(String(g.act), W - M - 300, dy, { align: 'right' });
    doc.text(String(g.tot), W - M - 240, dy, { align: 'right' });
    const paidCount = g.cls / k;
    doc.text(paidCount ? peso(g.sum / paidCount) : '—', W - M - 110, dy, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...GOLD);
    doc.text(g.cls ? peso(g.sum / g.cls) : '—', W - M - 12, dy, { align: 'right' });
    dy += 15;
  });
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...IVORY);
  doc.text('Promedio real por clase', M + 12, dy + 6);
  doc.setTextColor(...GOLD); doc.text(allCls ? peso(allSum / allCls) : '—', W - M - 12, dy + 6, { align: 'right' });
  y += rh + 18;

  const { data: auth } = await supabase.auth.getUser();
  const { data: cps } = await supabase.from('coach_lesson_pricing').select('coach_id, pricing');
  const cp: any = ((cps || []) as any[]).find((r) => r.coach_id === auth.user?.id)?.pricing || (cps as any)?.[0]?.pricing;
  const peso0 = (n: number) => `$${Math.round(n).toLocaleString('en-US')} MXN`;
  const proPrices: string[] = [];
  if (cp) {
    if (cp.pro_individual_price) proPrices.push(`1 clase: ${peso0(cp.pro_individual_price)}${cp.individual_price ? ` (normal ${peso0(cp.individual_price)})` : ''}`);
    (cp.packages || []).forEach((k: any) => {
      if (k.pro_price && k.lessons) proPrices.push(`${k.lessons} clases: ${peso0(k.pro_price)} (${peso0(k.pro_price / k.lessons)} c/u)${k.price ? ` · normal ${peso0(k.price)}` : ''}`);
    });
  }

  for (const p of plans) {
    const feats: string[] = [...(p.features || [])];
    if (p.tier_key === 'pro' && proPrices.length) feats.push('Precios de clases con Pro:', ...proPrices.map((x) => `   ${x}`));
    const excl: string[] = p.excluded_features || [];
    const descLines = p.description ? doc.splitTextToSize(String(p.description), W - 2 * M - 24) : [];
    const featLines = feats.flatMap((f) => doc.splitTextToSize(`+  ${f}`, W - 2 * M - 24));
    const exclLines = excl.flatMap((f) => doc.splitTextToSize(`–  ${f}`, W - 2 * M - 24));
    const h = 50 + descLines.length * 13 + (featLines.length + exclLines.length) * 14 + 10;
    if (y + h > H - M) { doc.addPage(); bg(); y = M; }
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.8);
    doc.roundedRect(M, y, W - 2 * M, h, 8, 8, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...GOLD);
    doc.text(String(p.name || ''), M + 12, y + 24);
    const price = Number(p.price_amount || 0) > 0 ? `${money(p.price_amount)}${interval(p.billing_interval)}` : 'Gratis';
    doc.setTextColor(...IVORY); doc.text(price, W - M - 12, y + 24, { align: 'right' });
    let yy = y + 42;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(10);
    descLines.forEach((l: string) => { doc.text(l, M + 12, yy); yy += 13; });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
    featLines.forEach((l: string) => { doc.setTextColor(...IVORY); doc.text(l, M + 12, yy); yy += 14; });
    exclLines.forEach((l: string) => { doc.setTextColor(150, 150, 140); doc.text(l, M + 12, yy); yy += 14; });
    y += h + 14;
  }

  doc.setFontSize(9); doc.setTextColor(...GOLD);
  doc.text(`margeagolfacademy.com · ${new Date().toLocaleDateString('es-MX')}`, M, H - 20);
  doc.save('Apex-Planes.pdf');
}
