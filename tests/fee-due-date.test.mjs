import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueDateForPeriod } from '../src/fees/due-date.mjs';

test('computes due dates for months and leap years without local timezone drift', () => {
  assert.equal(dueDateForPeriod(2026,11,10,'LAST_DAY'),'2026-11-10');
  assert.equal(dueDateForPeriod(2026,2,31,'LAST_DAY'),'2026-02-28');
  assert.equal(dueDateForPeriod(2028,2,30,'LAST_DAY'),'2028-02-29');
  assert.equal(dueDateForPeriod(5,1,1,'LAST_DAY'),'0005-01-01');
});

test('requires an explicit policy and rejects invalid dates', () => {
  assert.equal(dueDateForPeriod(2026,2,28,'MAX_28'),'2026-02-28');
  assert.throws(()=>dueDateForPeriod(2026,1,29,'MAX_28'),RangeError);
  assert.throws(()=>dueDateForPeriod(2026,2,29),RangeError);
  assert.throws(()=>dueDateForPeriod(2026,13,1,'LAST_DAY'),RangeError);
  assert.throws(()=>dueDateForPeriod(2026,2,0,'LAST_DAY'),RangeError);
});
