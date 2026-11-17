import { describe, expect, it } from 'bun:test';
import { isPendingRedemption, scopeRedemptions } from '../src/lib/redemptionInbox';

describe('coach redemption inbox', () => {
  it('keeps only assigned students, not another coach’s students', () => {
    expect(scopeRedemptions([{ user_id: 'mine' }, { user_id: 'other-coach' }], ['mine'])).toEqual([{ user_id: 'mine' }]);
  });
  it('does not expose any student when the coach has no assigned students', () => {
    expect(scopeRedemptions([{ user_id: 'other-coach' }], [])).toEqual([]);
  });
  it('pending fulfillment requires attention, while fulfilled rewards do not', () => {
    expect(isPendingRedemption('pending')).toBe(true);
    expect(isPendingRedemption('completed')).toBe(false);
    expect(isPendingRedemption('fulfilled')).toBe(false);
  });
});