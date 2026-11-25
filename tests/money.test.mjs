import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineTotal } from '../src/domain/money.mjs';

test('calculates a fractional quantity without floating point errors', () => {
  assert.equal(lineTotal('1.5', '4000.00'), 600000n);
});

test('rounds half a cent up for each line', () => {
  assert.equal(lineTotal('0.005', '1.00'), 1n);
  assert.equal(lineTotal('0.004', '1.00'), 0n);
});

test('rejects invalid or imprecise quantities and prices', () => {
  for (const [quantity, price] of [['0', '1'], ['-1', '1'], ['1.0001', '1'], ['1', '1.001'], ['1', '-1'], ['1', 'NaN']]) {
    assert.throws(() => lineTotal(quantity, price), RangeError);
  }
  assert.equal(lineTotal('2', '0'), 0n);
});
