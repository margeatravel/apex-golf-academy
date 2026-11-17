import { describe, it, expect } from 'vitest';
import { lessonMinutes, weeklyHours, averageMonthly, recurringWeeklyHours } from '../src/lib/revenueReportData';

describe('revenue report data', () => {
  it('Playing Lesson counts 120 min when no duration', () => {
    expect(lessonMinutes({ lesson_type: 'Playing Lesson' })).toBe(120);
    expect(lessonMinutes({ lesson_type: 'Range' })).toBe(60);
  });
  it('sums hours per week', () => {
    const w = weeklyHours([
      { lesson_date: '2026-10-20', duration_minutes: 60 },
      { lesson_date: '2026-10-22', lesson_type: 'Playing Lesson' },
    ], '2026-10-25', 2);
    expect(w).toEqual([{ week: '2026-10-12', hours: 0 }, { week: '2026-10-19', hours: 3 }]);
  });
  it('average monthly ignores future months', () => {
    expect(averageMonthly([
      { month: '2026-09', revenue: 10000 }, { month: '2026-10', revenue: 20000 }, { month: '2026-11', revenue: 0 },
    ], '2026-10-25')).toBe(15000);
  });
  it('biweekly slot counts half', () => {
    expect(recurringWeeklyHours([{ duration_minutes: 60, interval_weeks: 2 }, { duration_minutes: 60 }])).toBe(1.5);
  });
});

import { pendingPackageRows } from '../src/lib/revenueReportData';
import { computePackageCounts } from '../src/lib/lessonPackageUsage';

describe('pending lessons on active packages', () => {
  const names = new Map([['u1', 'Ana'], ['u2', 'Beto']]);
  const pkgs = [
    { id: 'p1', user_id: 'u1', is_active: true, package_size: 10, price: 15000, classes_remaining: 10 },
    { id: 'p2', user_id: 'u2', is_active: false, package_size: 10, price: 15000 },
  ];
  const lessons = [
    { id: 'l1', package_id: 'p1', status: 'completed', lesson_date: '2026-01-05', lesson_type: 'Range' },
    { id: 'l2', package_id: 'p1', status: 'completed', lesson_date: '2026-01-12', lesson_type: 'Playing Lesson' },
  ];
  it('counts remaining from taken lessons, not stored counters, and skips inactive packages', () => {
    const rows = pendingPackageRows(pkgs, lessons, names, computePackageCounts);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Ana');
    expect(rows[0].remaining).toBe(7); // Playing Lesson uses 2 slots
  });
  it('values pending lessons at package price / package size', () => {
    const rows = pendingPackageRows(pkgs, lessons, names, computePackageCounts);
    expect(rows[0].value).toBe(10500);
  });
});
