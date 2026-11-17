import { afterEach, describe, expect, test } from 'bun:test';
import { isTodayInCancun } from '../src/lib/cancunDate';

const originalNow = Date.now;
afterEach(() => { Date.now = originalNow; });

describe('today in America/Cancun', () => {
  test('October 13 remains today at 03:14 UTC on October 14', () => {
    Date.now = () => Date.parse('2026-10-14T03:14:00Z');
    expect(isTodayInCancun('2026-10-13')).toBe(true);
    expect(isTodayInCancun('2026-10-14')).toBe(false);
  });
  test('zoned timestamps use the Cancún day, not the UTC date', () => {
    Date.now = () => Date.parse('2026-10-14T03:14:00Z');
    expect(isTodayInCancun('2026-10-14T03:14:00Z')).toBe(true);
    expect(isTodayInCancun('2026-10-14T05:00:00Z')).toBe(false);
  });
  test('unzoned timestamps are local Cancún time', () => {
    Date.now = () => Date.parse('2026-10-14T03:14:00Z');
    expect(isTodayInCancun('2026-10-13T22:14:00')).toBe(true);
    expect(isTodayInCancun('2026-10-14T00:00:00')).toBe(false);
  });
  test('invalid or absent dates are not today', () => {
    expect(isTodayInCancun('invalid')).toBe(false);
    expect(isTodayInCancun('')).toBe(false);
  });
});