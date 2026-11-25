import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAllocations } from '../src/domain/allocations.mjs';

test('accepts a partial payment distributed among selected charges', () => {
  assert.equal(validateAllocations(7000n, [
    { chargeId: 'fee', amount: 5000n, outstanding: 10000n },
    { chargeId: 'kiln', amount: 2000n, outstanding: 2000n },
  ]), 7000n);
});

test('rejects overpayment, duplicate charges, and mismatched totals', () => {
  const valid = { chargeId: 'fee', amount: 100n, outstanding: 100n };
  assert.throws(() => validateAllocations(101n, [{ ...valid, amount: 101n }]), RangeError);
  assert.throws(() => validateAllocations(200n, [valid, valid]), RangeError);
  assert.throws(() => validateAllocations(99n, [valid]), RangeError);
  assert.throws(() => validateAllocations(0n, []), RangeError);
  assert.throws(() => validateAllocations(100n, [{ ...valid, amount: 100 }]), RangeError);
});
