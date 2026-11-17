// Pro loyalty ladder: $999 for the first 4 months, then drops $100 every 2 months until it settles at the floor.
// Must match the Stripe schedule attached in the stripe-webhook function.
export const PRO_STEP_MONTHS = 2;
export const PRO_BASE_MONTHS = 4;
export const PRO_PRICE_STEPS = [999, 899, 799, 699, 599, 499] as const;

export interface ProPriceStep { fromMonth: number; toMonth: number | null; price: number }

export function proPriceSteps(): ProPriceStep[] {
  return PRO_PRICE_STEPS.map((price, index) => {
    const fromMonth = index === 0 ? 1 : PRO_BASE_MONTHS + (index - 1) * PRO_STEP_MONTHS + 1;
    const last = index === PRO_PRICE_STEPS.length - 1;
    const toMonth = last ? null : index === 0 ? PRO_BASE_MONTHS : fromMonth + PRO_STEP_MONTHS - 1;
    return { fromMonth, toMonth, price };
  });
}

export const proStepLabel = (s: ProPriceStep, lang: 'es' | 'en' = 'es') =>
  s.toMonth === null
    ? (lang === 'es' ? `Mes ${s.fromMonth}+` : `Month ${s.fromMonth}+`)
    : (lang === 'es' ? `Meses ${s.fromMonth}-${s.toMonth}` : `Months ${s.fromMonth}-${s.toMonth}`);
