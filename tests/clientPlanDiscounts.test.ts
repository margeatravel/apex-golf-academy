import { describe, expect, it } from 'bun:test';
import { proLessonDiscounts, proSavingsRange } from '../src/lib/clientPlanDiscounts';

const PRICING = {
  individual_price: 1600, pro_individual_price: 1350,
  packages: [{ lessons: 10, price: 14850, pro_price: 12500 },
    { lessons: 20, price: 26500, pro_price: 22500 }, { lessons: 30, price: 34650, pro_price: 30500 }],
  additional_products: [{ price: 550 }],
};

describe('Pro PDF discounts from configured prices', () => {
  it('compares each Pro rate against its corresponding standard rate', () => {
    expect(proLessonDiscounts({ individual_price: 1600, pro_individual_price: 1350,
      packages: [{ lessons: 10, price: 14850, pro_price: 12500 },
        { lessons: 20, price: 26500, pro_price: 22500 }, { lessons: 30, price: 34650, pro_price: 30500 }],
    })).toEqual([{ lessons: 1, percent: 15.6 }, { lessons: 10, percent: 15.8 },
      { lessons: 20, percent: 15.1 }, { lessons: 30, percent: 12 }]);
  });
  it('does not invent discounts for missing, invalid or non-discounted prices', () => {
    expect(proLessonDiscounts(null)).toEqual([]);
    expect(proLessonDiscounts({ individual_price: 0, pro_individual_price: 100,
      packages: [{ lessons: 10, price: 100, pro_price: 100 }, { lessons: 20, price: 100 },
        { lessons: 30, price: 100, pro_price: -10 }],
    })).toEqual([]);
  });
});

describe('Pro savings range in the client PDF', () => {
  it('adds package savings plus one free video analysis, from the 10- and 30-lesson packages', () => {
    expect(proSavingsRange(PRICING)).toEqual({ lower: 2350 + 550, upper: 4150 + 550 });
  });
  it('returns no savings without complete package prices', () => {
    expect(proSavingsRange(null)).toBeNull();
    expect(proSavingsRange({ packages: [{ lessons: 10, price: 14850 }] })).toBeNull();
    expect(proSavingsRange({ packages: [{ lessons: 10, price: 100, pro_price: 100 },
      { lessons: 30, price: 100, pro_price: 100 }] })).toBeNull();
  });
});