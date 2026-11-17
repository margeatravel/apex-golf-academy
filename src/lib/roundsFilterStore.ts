/**
 * Tiny in-memory store for the active "holes" filter of the Stats > Trends view.
 *
 * The Scoring Report (PDF) buttons live OUTSIDE <RoundsList/> (Pro Zone Stats
 * page and the coach's student detail tab), so they need to know which filter
 * the user currently has selected without prop-drilling through big pages.
 * RoundsList publishes its filter here whenever it changes; the report buttons
 * read it right before generating the PDF.
 */

export type HolesFilter = '18' | '9';

const filters = new Map<string, HolesFilter>();

export function setHolesFilterFor(studentId: string, filter: HolesFilter) {
  filters.set(studentId, filter);
}

function normalizeFilter(value: HolesFilter | 'all' | undefined, has18: boolean, has9: boolean): HolesFilter {
  if (value === '18' || value === '9') return value;
  // Snapshots saved with the removed 'all' default back to 18 holes unless
  // the student has no 18-hole rounds but does have 9-hole ones.
  return has18 ? '18' : has9 ? '9' : '18';
}

/** True only if the user explicitly picked a filter (raw stored value). */
export function hasStoredHolesFilter(studentId: string): boolean {
  const v = filters.get(studentId) as string | undefined;
  return v === '18' || v === '9';
}

export function getHolesFilterFor(studentId: string): HolesFilter {
  return normalizeFilter(filters.get(studentId), false, false);
}

export function holesFilterLabel(filter: HolesFilter): string {
  return filter === '18' ? '18 holes' : '9 holes';
}
