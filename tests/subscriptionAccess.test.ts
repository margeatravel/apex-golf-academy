import { describe, expect, test } from 'bun:test';
import { grantsSubscriptionAccess } from '../supabase/functions/_shared/subscriptionAccess';

describe('purchased subscription access', () => {
  test('a promotional Scratch subscription retains access while trialing', () => {
    expect(grantsSubscriptionAccess('trialing')).toBe(true);
  });
  test('an active subscription retains access', () => {
    expect(grantsSubscriptionAccess('active')).toBe(true);
  });
  test('ended and unpaid subscriptions do not gain access', () => {
    for (const status of ['canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused', 'past_due']) {
      expect(grantsSubscriptionAccess(status)).toBe(false);
    }
  });
});