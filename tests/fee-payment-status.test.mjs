import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feePaymentStatus } from '../src/fees/payment-status.mjs';

test('distinguishes paid, pending, partial and overdue without hiding partial overdue', () => {
  assert.deepEqual(feePaymentStatus(10000n,0n,'2026-11-10','2026-11-10'),{status:'PENDING',overdue:false,balanceCents:10000n});
  assert.deepEqual(feePaymentStatus(10000n,0n,'2026-11-10','2026-11-11'),{status:'OVERDUE',overdue:true,balanceCents:10000n});
  assert.deepEqual(feePaymentStatus(10000n,4000n,'2026-11-10','2026-11-11'),{status:'PARTIAL',overdue:true,balanceCents:6000n});
  assert.deepEqual(feePaymentStatus(10000n,10000n,'2026-11-10','2026-11-11'),{status:'PAID',overdue:false,balanceCents:0n});
});

test('rejects inconsistent balances and invalid calendar dates', () => {
  assert.throws(()=>feePaymentStatus(100n,101n,'2026-11-10','2026-11-11'),RangeError);
  assert.throws(()=>feePaymentStatus(-1n,0n,'2026-11-10','2026-11-11'),RangeError);
  assert.throws(()=>feePaymentStatus(100n,0n,'2026-02-30','2026-11-11'),RangeError);
  assert.deepEqual(feePaymentStatus(0n,0n,'2026-11-10','2026-11-11'),{status:'PAID',overdue:false,balanceCents:0n});
});
