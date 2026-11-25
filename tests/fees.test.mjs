import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextPeriod, feeApplies } from '../src/domain/fees.mjs';

test('the next fee period crosses the year boundary', () => {
  assert.deepEqual(nextPeriod(2026, 12), { year: 2027, month: 1 });
});

test('a fee applies only to active students from their billing start period', () => {
  assert.equal(feeApplies({ activeAtPeriod: true, startYear: 2026, startMonth: 12 }, 2027, 1), true);
  assert.equal(feeApplies({ activeAtPeriod: true, startYear: 2026, startMonth: 12 }, 2026, 11), false);
  assert.equal(feeApplies({ activeAtPeriod: false, startYear: 2026, startMonth: 1 }, 2026, 12), false);
});

test('advances ordinary periods and rejects invalid dates', () => {
  assert.deepEqual(nextPeriod(2026, 5), { year: 2026, month: 6 });
  assert.throws(() => nextPeriod(2026, 13), RangeError);
  assert.throws(() => nextPeriod(9999, 12), RangeError);
  assert.throws(() => feeApplies({ activeAtPeriod: true, startYear: 2026, startMonth: 0 }, 2026, 1), RangeError);
});
