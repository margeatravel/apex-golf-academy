import { describe, expect, it } from 'vitest';
import { proPriceSteps } from '../src/lib/proPriceSteps';

describe('proPriceSteps', () => {
  it('drops $100 every 2 months from $999 and stays at $499 from month 11', () => {
    const steps = proPriceSteps();
    expect(steps.map(s => s.price)).toEqual([999, 899, 799, 699, 599, 499]);
    expect(steps[1]).toEqual({ fromMonth: 3, toMonth: 4, price: 899 });
    expect(steps[5]).toEqual({ fromMonth: 11, toMonth: null, price: 499 });
  });
});
