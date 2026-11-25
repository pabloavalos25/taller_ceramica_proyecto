import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodsBetween } from '../src/fees/periods.mjs';

test('returns inclusive ordered periods across year boundaries', () => {
  assert.deepEqual(periodsBetween('2026-11','2027-02'), ['2026-11','2026-12','2027-01','2027-02']);
  assert.deepEqual(periodsBetween('2026-03','2026-03'), ['2026-03']);
});

test('rejects invalid, reverse and excessive ranges', () => {
  for (const [a,b] of [['2026-13','2027-01'],['0000-01','0001-01'],['2027-01','2026-12'],['1900-01','2000-01']]) assert.throws(()=>periodsBetween(a,b),RangeError);
});
