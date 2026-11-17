// Centralized tier-based theming so the header, page background and
// bottom navbar all share the same color language.
//
// The color + opacity for each tier now comes from billing_plans
// (columns `color` and `color_opacity`, keyed by `tier_key`).
// AuthContext loads them once and pushes them here via setTierThemeColors().
//
// Each tier returns four values:
//   - headerBg: background for sticky top header
//   - navBg:    background for the floating bottom navbar pill
//   - border:   accent border color (used for borderTop/borderBottom)
//   - badge:    solid color used by the tier badge

export type TierKey = 'free' | 'member' | 'scratch' | 'pro' | 'apex' | string;

export interface TierTheme {
  headerBg: string;
  navBg: string;
  border: string;
  badge: string;
}

export interface TierColorSpec {
  color: string;
  opacity: number;
}

const NEUTRAL_HEADER = 'rgba(18,18,20,0.55)';
const NEUTRAL_NAV = 'rgba(28,28,30,0.85)';

const NEUTRAL_THEME: TierTheme = {
  headerBg: 'rgba(210,210,215,0.22)',
  navBg: 'rgba(210,210,215,0.28)',
  border: 'rgba(190,190,200,0.35)',
  badge: '#9CA3AF',
};

// Fallbacks preserve the historical look until billing_plans loads.
const FALLBACK_COLORS: Record<string, TierColorSpec> = {
  scratch: { color: '#4A7C59', opacity: 0.30 },
  pro: { color: '#C9A84C', opacity: 0.40 },
  apex: { color: '#2E86C1', opacity: 0.55 },
  family: { color: '#F97316', opacity: 0.45 },
};

let TIER_COLORS: Record<string, TierColorSpec> = { ...FALLBACK_COLORS };

export function setTierThemeColors(map: Record<string, TierColorSpec>) {
  TIER_COLORS = { ...FALLBACK_COLORS, ...map };
}

export function getTierColorSpec(tier: TierKey | undefined | null): TierColorSpec | null {
  if (!tier) return null;
  const key = String(tier).toLowerCase();
  if (key === 'free' || key === 'member') return null;
  return TIER_COLORS[key] || null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Builds the exact theme the student portal renders for a given color + opacity. */
export function buildTierTheme(color: string, opacity: number): TierTheme {
  const rgb = hexToRgb(color);
  if (!rgb) return NEUTRAL_THEME;
  const a = Math.min(0.9, Math.max(0.05, Number(opacity) || 0.45));
  const tint = `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
  const borderAlpha = Math.min(0.95, a + 0.3);
  return {
    headerBg: `linear-gradient(${tint}, ${tint}), ${NEUTRAL_HEADER}`,
    navBg: `linear-gradient(${tint}, ${tint}), ${NEUTRAL_NAV}`,
    border: `rgba(${rgb.r},${rgb.g},${rgb.b},${borderAlpha})`,
    badge: color,
  };
}

export function getTierTheme(tier: TierKey | undefined | null): TierTheme {
  const spec = getTierColorSpec(tier);
  if (!spec) return NEUTRAL_THEME;
  return buildTierTheme(spec.color, spec.opacity);
}
