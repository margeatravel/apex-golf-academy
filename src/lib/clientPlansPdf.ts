import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import { proPriceSteps, proStepLabel } from './proPriceSteps';
import { proLessonDiscounts, proSavingsRange, type ClientLessonPricing } from './clientPlanDiscounts';

// Print tokens mirror the dark glass aesthetic: deep green page, translucent
// glass cards, ivory ink and gold accents. Plan cards keep their own color.
const palette = {
  background: [34, 74, 56], backgroundTop: [52, 102, 78], glass: [255, 255, 255], edge: [170, 205, 182],
  reflection: [225, 242, 230], gold: [240, 192, 64], ivory: [248, 246, 240], muted: [196, 214, 202],
} as const;
const LADDER_HEIGHT = 46;
const money = (pesos: number) => `$${pesos.toLocaleString('en-US', { maximumFractionDigits: 2 })} MXN`;

// Some plan accents (deep green) are too dark to read as text on a glass card.
const isDarkColor = (c: [number, number, number]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] < 110;
const mixColor = (c: [number, number, number], withColor: [number, number, number], amount: number): [number, number, number] =>
  c.map((channel, index) => Math.round(channel * (1 - amount) + withColor[index] * amount)) as [number, number, number];
const textAccent = (c: [number, number, number]): [number, number, number] =>
  isDarkColor(c) ? mixColor(c, [235, 240, 232], 0.55) : c;

// Modern geometric font embedded into the PDF; falls back to Helvetica offline.
const POPPINS_BASE = 'https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/';
let fontCache: { normal: { name: string; data: string }; bold: { name: string; data: string } } | null = null;
const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};
const loadPoppins = async () => {
  if (fontCache) return fontCache;
  const files = ['Poppins-Regular.ttf', 'Poppins-Bold.ttf'] as const;
  const [normal, bold] = await Promise.all(files.map(async name => {
    const response = await fetch(POPPINS_BASE + name);
    if (!response.ok) throw new Error(`font ${response.status}`);
    return { name, data: toBase64(await response.arrayBuffer()) };
  }));
  fontCache = { normal, bold };
  return fontCache;
};

export async function createClientPlansPdf(): Promise<Blob> {
  // Customer document deliberately never loads customers, payments or price history.
  const { data: plans, error } = await supabase.from('billing_plans')
    .select('name, description, features, price_amount, billing_interval, tier_key, color')
    .eq('is_active', true).eq('plan_type', 'subscription').order('sort_order');
  if (error) throw error;
  if (!plans?.length) throw new Error('No hay planes activos');

  const { data: session } = await supabase.auth.getSession();
  const coachId = session.session?.user.id;
  const proDiscounts: string[] = [];
  let proSavings: string | null = null;
  if (coachId && plans.some(p => p.tier_key === 'pro')) {
    const { data, error: pricingError } = await supabase.from('coach_lesson_pricing')
      .select('pricing').eq('coach_id', coachId).maybeSingle();
    if (pricingError) throw pricingError;
    const pricing = data?.pricing as ClientLessonPricing | null;
    proLessonDiscounts(pricing).forEach(({ lessons, percent }) => {
      proDiscounts.push(`${percent.toLocaleString('es-MX')}% de descuento · ${lessons === 1 ? 'Lesson individual' : `paquete de ${lessons} Lessons`}`);
    });
    // Same value range the plans page shows for Pro.
    const range = proSavingsRange(pricing);
    const pesos = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
    if (range) {
      proSavings = range.lower === range.upper
        ? `Te ahorras ${pesos(range.lower)} MXN`
        : `Te ahorras ${pesos(range.lower)} – ${pesos(range.upper)} MXN`;
    }
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  let font: 'poppins' | 'helvetica' = 'helvetica';
  try {
    const fonts = await loadPoppins();
    doc.addFileToVFS(fonts.normal.name, fonts.normal.data);
    doc.addFont(fonts.normal.name, 'poppins', 'normal');
    doc.addFileToVFS(fonts.bold.name, fonts.bold.data);
    doc.addFont(fonts.bold.name, 'poppins', 'bold');
    font = 'poppins';
  } catch { /* Helvetica fallback keeps the download working offline. */ }
  const setFont = (style: 'normal' | 'bold') => doc.setFont(font, style);

  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 32;
  const innerWidth = width - margin * 2;
  const gap = 12;
  const columnWidth = (innerWidth - gap) / 2;
  let y = 116;
  let page = 0;
  const pageBackground = (section: string) => {
    page++;
    doc.setFillColor(...palette.background); doc.rect(0, 0, width, height, 'F');
    // Soft vertical light falloff + glow orbs for a lighter, glassier page.
    for (let band = 0; band < 24; band++) {
      doc.setGState(doc.GState({ opacity: 0.05 }));
      doc.setFillColor(...palette.backgroundTop); doc.rect(0, 0, width, height * (1 - band / 24), 'F');
    }
    doc.setGState(doc.GState({ opacity: 0.08 }));
    doc.setFillColor(...palette.gold); doc.circle(width - 60, 70, 140, 'F');
    doc.setFillColor(...palette.reflection); doc.circle(40, height - 80, 180, 'F');
    doc.setGState(doc.GState({ opacity: 1 }));
    setFont('bold'); doc.setFontSize(27); doc.setTextColor(...palette.gold);
    doc.text('MARGEA', margin, 48);
    setFont('normal'); doc.setFontSize(8); doc.setTextColor(...palette.muted);
    doc.text('GOLF ACADEMY', margin + 132, 47);
    doc.setFontSize(18); doc.setTextColor(...palette.ivory); doc.text(section, margin, 82);
    doc.setDrawColor(...palette.edge); doc.setLineWidth(0.5); doc.line(margin, 96, width - margin, 96);
    doc.setFontSize(8); doc.setTextColor(...palette.muted);
    doc.text('margeagolfacademy.com', margin, height - 22);
    doc.text(String(page).padStart(2, '0'), width - margin, height - 22, { align: 'right' });
    y = 112;
  };
  const benefitsOf = (plan: typeof plans[number]) => [...(Array.isArray(plan.features)
    ? plan.features.filter((f): f is string => typeof f === 'string' && !/^\s*(No incluye:|Not included:)/i.test(f)).map(f => f.trim())
    : []), ...(plan.tier_key === 'pro' ? proDiscounts : [])];
  const accentOf = (plan: typeof plans[number]): [number, number, number] => {
    const hex = plan.color?.replace('#', '');
    if (!hex || !/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return [...palette.gold];
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  };
  const measure = (plan: typeof plans[number], cardWidth: number) => {
    setFont('normal'); doc.setFontSize(9);
    const description: string[] = plan.description ? doc.splitTextToSize(plan.description, cardWidth - 28) : [];
    const rows: string[][] = benefitsOf(plan).map(f => doc.splitTextToSize(f, cardWidth === innerWidth ? columnWidth - 40 : cardWidth - 40));
    const half = Math.ceil(rows.length / 2);
    const rowsHeight = (items: string[][]) => items.reduce((sum, row) => sum + row.length * 11 + 4, 0);
    const savings = plan.tier_key === 'pro' && proSavings ? 12 : 0;
    const ladder = plan.tier_key === 'pro' ? LADDER_HEIGHT : 0;
    const cardHeight = 78 + savings + ladder + description.length * 11 + (cardWidth === innerWidth ? Math.max(rowsHeight(rows.slice(0, half)), rowsHeight(rows.slice(half))) : rowsHeight(rows));
    return { description, rows, cardHeight };
  };
  const surface = (x: number, top: number, w: number, h: number, accent: [number, number, number]) => {
    // Translucent frosted card tinted by the plan color.
    const tint = palette.glass.map((base, index) => Math.round(base * 0.8 + accent[index] * 0.2)) as [number, number, number];
    doc.setGState(doc.GState({ opacity: 0.14 }));
    doc.setFillColor(...tint); doc.roundedRect(x, top, w, h, 10, 10, 'F');
    doc.setGState(doc.GState({ opacity: 0.1 }));
    doc.setFillColor(...palette.glass); doc.roundedRect(x, top, w, Math.min(40, h / 3), 10, 10, 'F');
    doc.setGState(doc.GState({ opacity: 0.6 }));
    doc.setDrawColor(...palette.edge); doc.setLineWidth(0.6); doc.roundedRect(x, top, w, h, 10, 10, 'S');
    doc.setGState(doc.GState({ opacity: 1 }));
    doc.setDrawColor(...palette.reflection); doc.setLineWidth(1); doc.line(x + 12, top + 1.5, x + w - 12, top + 1.5);
    doc.setDrawColor(...accent); doc.setLineWidth(2.4); doc.line(x + 14, top + 1.5, x + 52, top + 1.5);
  };
  const renderLadder = (x: number, top: number, w: number) => {
    setFont('bold'); doc.setFontSize(7.5); doc.setTextColor(...palette.gold);
    doc.text('TU PRECIO BAJA CADA 2 MESES HASTA $499/MES', x, top + 8);
    const steps = proPriceSteps();
    const chipGap = 4;
    const chipW = (w - chipGap * (steps.length - 1)) / steps.length;
    steps.forEach((s, i) => {
      const cx = x + i * (chipW + chipGap);
      const final = i === steps.length - 1;
      doc.setGState(doc.GState({ opacity: final ? 0.25 : 0.12 }));
      doc.setFillColor(...((final ? palette.gold : palette.glass) as readonly [number, number, number])); doc.roundedRect(cx, top + 13, chipW, 26, 5, 5, 'F');
      doc.setGState(doc.GState({ opacity: 1 }));
      setFont('normal'); doc.setFontSize(6); doc.setTextColor(...palette.muted);
      doc.text(proStepLabel(s), cx + chipW / 2, top + 22, { align: 'center' });
      setFont('bold'); doc.setFontSize(9); doc.setTextColor(...((final ? palette.gold : palette.ivory) as readonly [number, number, number]));
      doc.text(`$${s.price}`, cx + chipW / 2, top + 34, { align: 'center' });
    });
  };
  const renderPlan = (plan: typeof plans[number], x: number, top: number, cardWidth: number, cardHeight: number) => {
    const { description, rows } = measure(plan, cardWidth);
    const accent = textAccent(accentOf(plan));
    surface(x, top, cardWidth, cardHeight, accentOf(plan));
    setFont('bold'); doc.setFontSize(13); doc.setTextColor(...accent);
    doc.text(plan.name, x + 14, top + 23);
    const amount = plan.price_amount / 100;
    doc.setFontSize(20); doc.setTextColor(...palette.ivory);
    doc.text(amount > 0 ? money(amount) : 'Gratis', x + 14, top + 48);
    setFont('normal'); doc.setFontSize(7); doc.setTextColor(...palette.muted);
    doc.text(amount > 0 ? (plan.billing_interval === 'year' ? 'POR AÑO' : plan.billing_interval === 'month' ? 'POR MES' : 'PAGO ÚNICO') : 'SIN COSTO', x + 14, top + 60);
    const savings = plan.tier_key === 'pro' ? proSavings : null;
    if (savings) {
      setFont('bold'); doc.setFontSize(9); doc.setTextColor(...palette.gold);
      doc.text(savings, x + 14, top + 74);
    }
    let textY = top + (savings ? 89 : 77);
    if (plan.tier_key === 'pro') { renderLadder(x + 14, textY - 8, cardWidth - 28); textY += LADDER_HEIGHT; }
    setFont('normal'); doc.setFontSize(9);
    description.forEach(line => { doc.text(line, x + 14, textY); textY += 11; });
    textY += 4;
    const benefitsY = textY;
    const half = Math.ceil(rows.length / 2);
    rows.forEach((row, index) => {
      const columnX = cardWidth === innerWidth && index >= half ? x + columnWidth + gap : x;
      if (cardWidth === innerWidth && index === half) textY = benefitsY;
      doc.setFillColor(...accent); doc.circle(columnX + 16, textY - 3, 1.4, 'F');
      doc.setTextColor(...palette.ivory);
      row.forEach(line => { doc.text(line, columnX + 24, textY); textY += 11; });
      textY += 4;
    });
  };
  pageBackground('Membresías · precios y beneficios');
  const memberships = plans.filter(plan => plan.tier_key);
  for (let index = 0; index < memberships.length; index += 2) {
    const pair = memberships.slice(index, index + 2);
    const cardWidth = pair.length === 1 ? innerWidth : columnWidth;
    const rowHeight = Math.max(...pair.map(plan => measure(plan, cardWidth).cardHeight));
    if (y + rowHeight > height - 42) { doc.addPage(); pageBackground('Membresías · precios y beneficios'); }
    pair.forEach((plan, column) => renderPlan(plan, margin + column * (columnWidth + gap), y, cardWidth, rowHeight));
    y += rowHeight + gap;
  }
  return doc.output('blob');
}

export async function deliverClientPlansPdf(blob: Blob) {
  const filename = 'Apex-Planes-para-clientes.pdf';
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Planes Margea Golf Academy' }); return; }
    catch (error) { if ((error as DOMException).name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
