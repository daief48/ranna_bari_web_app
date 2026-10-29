import { describe, expect, it } from 'vitest';

import { deliveryFeeFor } from '../src/logic/stores.js';

/* "Inside" and "outside" are measured against the shop's own division — a
   shop in Chattogram charges its inside fee to Chattogram, not to Dhaka. */
describe('deliveryFeeFor', () => {
  const ctg = { deliveryFee: 60, homeDivision: 'Chattogram', deliveryFeeInsideDhaka: 60, deliveryFeeOutsideDhaka: 150 };

  it('charges the inside fee to the shop’s own division', () => {
    expect(deliveryFeeFor(ctg, { division: 'Chattogram' })).toBe(60);
    expect(deliveryFeeFor(ctg, { district: 'Cumilla' })).toBe(60);
  });

  it('charges the outside fee to everywhere else — Dhaka included', () => {
    expect(deliveryFeeFor(ctg, { division: 'Dhaka' })).toBe(150);
    expect(deliveryFeeFor(ctg, { division: 'Sylhet' })).toBe(150);
  });

  it('still reads a shop with no home division as Dhaka', () => {
    const old = { deliveryFee: 100, deliveryFeeInsideDhaka: 100, deliveryFeeOutsideDhaka: 170 };
    expect(deliveryFeeFor(old, { division: 'Dhaka' })).toBe(100);
    expect(deliveryFeeFor(old, { division: 'Chattogram' })).toBe(170);
  });

  it('charges one flat fee when neither specific fee is set', () => {
    expect(deliveryFeeFor({ deliveryFee: 40, homeDivision: 'Chattogram' }, { division: 'Dhaka' })).toBe(40);
  });
});
