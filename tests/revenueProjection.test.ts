import { describe, expect, test } from 'bun:test';
import { pricePerClass, projectMonth } from '../src/lib/revenueProjection';

describe('revenue projection', () => {
  test('price per class = package price / package size', () => {
    expect(pricePerClass({ id: 'p', price: 10000, package_size: 10 })).toBe(1000);
  });

  test('8 lessons of a $10,000 / 10 package in the month = $8,000', () => {
    const lessons = Array.from({ length: 8 }, (_, i) => ({
      student_id: 's', lesson_date: `2026-11-${String(i + 1).padStart(2, '0')}`, status: 'scheduled', package_id: 'p', revenue: null,
    }));
    const r = projectMonth(lessons, [{ id: 'p', price: 10000, package_size: 10 }], '2026-11');
    expect(r.total).toBe(8000);
  });

  test('cancelled and skipped lessons do not count', () => {
    const r = projectMonth([
      { student_id: 's', lesson_date: '2026-11-02', status: 'cancelled', package_id: 'p', revenue: null },
      { student_id: 's', lesson_date: '2026-11-03', status: 'scheduled', package_id: 'p', revenue: null, skipped: true },
      { student_id: 's', lesson_date: '2026-11-04', status: 'scheduled', package_id: null, revenue: 1200 },
    ], [{ id: 'p', price: 10000, package_size: 10 }], '2026-11');
    expect(r.total).toBe(1200);
  });
});

import { projectBuckets } from '../src/lib/revenueProjection';
describe('projectBuckets', () => {
  test('groups future scheduled lessons by month at package price per class', () => {
    const pk = [{ id: 'p', price: 10000, package_size: 10 }];
    const r = projectBuckets([
      { student_id: 's', lesson_date: '2026-10-20', status: 'completed', package_id: 'p', revenue: null },
      { student_id: 's', lesson_date: '2026-10-27', status: 'scheduled', package_id: 'p', revenue: null },
      { student_id: 's', lesson_date: '2026-11-03', status: 'scheduled', package_id: 'p', revenue: null },
      { student_id: 's', lesson_date: '2026-11-05', status: 'scheduled', package_id: 'p', revenue: null },
    ], pk, '2026-10-25', 'monthly');
    expect(r).toEqual([{ date: '2026-10-01', revenue: 1000 }, { date: '2026-11-01', revenue: 2000 }]);
  });
});

import { hasRenewedBefore, projectRenewalDates } from '../src/lib/revenueProjection';
describe('renewals', () => {
  test('renewed before only with more than one package', () => {
    expect(hasRenewedBefore([{}])).toBe(false);
    expect(hasRenewedBefore([{}, {}])).toBe(true);
  });
  test('weekly Tuesday slot after Oct 27 2026 until Nov 18 adds Nov 3, 10, 17', () => {
    const r = projectRenewalDates([{ weekday: 2, interval_weeks: 1, interval_anchor: null, paused_until: null, starts_on: null }], '2026-10-27', '2026-11-18');
    expect(r).toEqual(['2026-11-03', '2026-11-10', '2026-11-17']);
  });
  test('every 2 weeks respects anchor', () => {
    const r = projectRenewalDates([{ weekday: 2, interval_weeks: 2, interval_anchor: '2026-10-27', paused_until: null, starts_on: null }], '2026-10-27', '2026-11-25');
    expect(r).toEqual(['2026-11-10', '2026-11-24']);
  });
});

import { scenarioPrice as _sp } from '../src/lib/revenueProjection';
describe('scenarioPrice', () => {
  test('raises only the overridden tier', () => {
    expect(_sp(450, { '450': 700 })).toBe(700);
    expect(_sp(800, { '450': 700 })).toBe(800);
  });
});

import { PRICE_STEPS } from '../src/lib/revenueProjection';
describe('scenario price steps', () => {
  test('offers $1,000 to $2,000 in $50 steps and nothing outside', () => {
    expect(PRICE_STEPS[0]).toBe(1000);
    expect(PRICE_STEPS[PRICE_STEPS.length - 1]).toBe(2000);
    expect(PRICE_STEPS).toEqual([1000, 1050, 1100, 1150, 1200, 1250, 1300, 1350, 1400, 1450, 1500, 1550, 1600, 1650, 1700, 1750, 1800, 1850, 1900, 1950, 2000]);
    expect(PRICE_STEPS.every((v) => v >= 1000 && v <= 2000 && v % 50 === 0)).toBe(true);
  });
});

import { tierShareLabel, tierSharePercent } from '../src/lib/revenueProjection';
describe('price tier share', () => {
  test('4 of 12 students is 33.3%', () => {
    expect(tierShareLabel(4, 12)).toBe('33.3%');
    expect(tierSharePercent(4, 12)).toBe(33.3);
  });
  test('1 of 12 students is 8.3% and 12 of 12 is 100%', () => {
    expect(tierShareLabel(1, 12)).toBe('8.3%');
    expect(tierShareLabel(12, 12)).toBe('100%');
  });
  test('zero students or no total is 0%', () => {
    expect(tierShareLabel(0, 12)).toBe('0%');
    expect(tierShareLabel(3, 0)).toBe('0%');
  });
});
