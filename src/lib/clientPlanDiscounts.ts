export interface ClientLessonPricing {
  individual_price?: number;
  pro_individual_price?: number;
  packages?: { lessons: number; price?: number; pro_price?: number }[];
  additional_products?: { price?: number }[];
}

export function proLessonDiscounts(pricing: ClientLessonPricing | null): { lessons: number; percent: number }[] {
  const candidates = [
    { lessons: 1, price: pricing?.individual_price, pro_price: pricing?.pro_individual_price },
    ...(pricing?.packages ?? []),
  ];
  return candidates.flatMap(({ lessons, price, pro_price }) => {
    if (lessons <= 0 || !Number.isFinite(price) || !Number.isFinite(pro_price) ||
      price === undefined || pro_price === undefined || price <= 0 || pro_price < 0 || pro_price >= price) return [];
    return [{ lessons, percent: Math.round((1 - pro_price / price) * 1000) / 10 }];
  });
}

// Mirrors the Pro value range shown on the plans page: package savings against
// standard pricing plus one free monthly video analysis.
export function proSavingsRange(pricing: ClientLessonPricing | null): { lower: number; upper: number } | null {
  if (!pricing) return null;
  const pkg = (lessons: number) => pricing.packages?.find(p => p.lessons === lessons);
  const video = pricing.additional_products?.[0]?.price;
  const bonus = Number.isFinite(video) && (video as number) > 0 ? (video as number) : 0;
  const saving = (p?: { price?: number; pro_price?: number }) =>
    p && Number.isFinite(p.price) && Number.isFinite(p.pro_price)
      ? (p.price as number) - (p.pro_price as number) + bonus : NaN;
  const lower = saving(pkg(10));
  const upper = saving(pkg(30));
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower <= 0 || upper <= 0) return null;
  return { lower, upper: Math.max(lower, upper) };
}