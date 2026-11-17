// Pure helpers for the Apex revenue & hours PDF report.

export function lessonMinutes(l: { duration_minutes?: number | null; lesson_type?: string | null }): number {
  if (l.duration_minutes && l.duration_minutes > 0) return l.duration_minutes;
  return /playing/i.test(l.lesson_type || '') ? 120 : 60;
}

/** Hours per ISO week (keyed by Monday YYYY-MM-DD) for the last `weeks` weeks ending at the week of `today`. */
export function weeklyHours(
  lessons: Array<{ lesson_date: string; duration_minutes?: number | null; lesson_type?: string | null }>,
  today: string,
  weeks = 12,
): Array<{ week: string; hours: number }> {
  const monday = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, dd));
    const wd = (dt.getUTCDay() + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - wd);
    return dt.toISOString().slice(0, 10);
  };
  const start = new Date(monday(today) + 'T00:00:00Z');
  const keys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(start); d.setUTCDate(d.getUTCDate() - i * 7);
    keys.push(d.toISOString().slice(0, 10));
  }
  const map = new Map(keys.map((k) => [k, 0]));
  for (const l of lessons) {
    const k = monday(l.lesson_date);
    if (map.has(k)) map.set(k, map.get(k)! + lessonMinutes(l) / 60);
  }
  return keys.map((week) => ({ week, hours: Math.round(map.get(week)! * 10) / 10 }));
}

export function average(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

/** Average monthly income over months that already ended or are in progress (ignores future months). */
export function averageMonthly(months: Array<{ month: string; revenue: number }>, today: string): number {
  const cur = today.slice(0, 7);
  const past = months.filter((m) => m.month <= cur);
  return average(past.map((m) => m.revenue));
}

/** Weekly hours from active recurring slots (cadence aware: every N weeks counts 1/N). */
export function recurringWeeklyHours(slots: Array<{ duration_minutes?: number | null; lesson_type?: string | null; interval_weeks?: number | null }>): number {
  return Math.round(slots.reduce((s, x) => s + lessonMinutes(x) / 60 / Math.max(1, x.interval_weeks || 1), 0) * 10) / 10;
}

export interface PendingPackageRow {
  name: string;
  pkgName: string;
  used: number;
  total: number;
  remaining: number;
  scheduled: number;
  pricePerClass: number;
  value: number;
}

/**
 * Lessons still owed on active packages, using the canonical package counts
 * (stored counters can drift). Packages with nothing left are omitted.
 */
export function pendingPackageRows(
  pkgs: Array<{ id: string; user_id: string; is_active?: boolean | null; package_name?: string | null; package_size?: number | null; classes_used?: number | null; classes_remaining?: number | null; price?: number | null }>,
  lessons: any[],
  names: Map<string, string>,
  counts: (pkg: any, lessons: any[]) => { total: number; used: number; scheduled: number; remaining: number },
  es = true,
): PendingPackageRow[] {
  const byPkg = new Map<string, any[]>();
  for (const l of lessons) {
    if (!l?.package_id) continue;
    const arr = byPkg.get(l.package_id) || [];
    arr.push(l);
    byPkg.set(l.package_id, arr);
  }
  return pkgs
    .filter((p) => p.is_active)
    .map((p) => {
      const c = counts(p, byPkg.get(p.id) || []);
      const ppc = c.total > 0 ? (Number(p.price) || 0) / c.total : 0;
      return {
        name: names.get(p.user_id) || '—',
        pkgName: p.package_name || `${c.total} ${es ? 'clases' : 'lessons'}`,
        used: c.used,
        total: c.total,
        remaining: c.remaining,
        scheduled: c.scheduled,
        pricePerClass: ppc,
        value: Math.round(ppc * c.remaining),
      };
    })
    .filter((r) => r.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name));
}
