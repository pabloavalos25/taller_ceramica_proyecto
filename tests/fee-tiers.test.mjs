import {test} from 'node:test';
import assert from 'node:assert/strict';
import {feeAmountForDate,validateFeeTiers} from '../src/fees/fee-tiers.mjs';

const tiers=[{startDay:1,amountCents:'4500000'},{startDay:11,amountCents:'5000000'},{startDay:21,amountCents:'6000000'},{startDay:31,amountCents:'7500000'}];

test('progressive fee amounts follow local calendar days and stop at the end of their month',()=>{
  for(const [date,expected] of [['2026-12-01','4500000'],['2026-12-10','4500000'],['2026-12-11','5000000'],['2026-12-20','5000000'],['2026-12-21','6000000'],['2026-12-30','6000000'],['2026-12-31','7500000'],['2027-01-15','7500000']]) assert.equal(feeAmountForDate({period:'2026-12',date,tiers}),expected);
  assert.equal(feeAmountForDate({period:'2027-02',date:'2027-03-01',tiers}),'6000000');
  assert.equal(feeAmountForDate({period:'2028-02',date:'2028-03-01',tiers}),'6000000');
  assert.equal(feeAmountForDate({period:'2027-04',date:'2027-05-01',tiers}),'6000000');
});

test('configuration requires ordered days and nondecreasing exact integer amounts',()=>{
  assert.deepEqual(validateFeeTiers(tiers),tiers);
  assert.throws(()=>validateFeeTiers([{startDay:2,amountCents:'4500000'}]),/tramo/i);
  assert.throws(()=>validateFeeTiers([{startDay:1,amountCents:'500'},{startDay:11,amountCents:'400'}]),/importe/i);
  assert.throws(()=>validateFeeTiers([{startDay:1,amountCents:'1'},{startDay:1,amountCents:'2'}]),/día/i);
  assert.throws(()=>validateFeeTiers([{startDay:1,amountCents:'9223372036854775808'}]),/importe/i);
  assert.throws(()=>validateFeeTiers([{startDay:1,amountCents:'1.00'}]),/importe/i);
  assert.throws(()=>feeAmountForDate({period:'2026-12',date:'2026-11-30',tiers}),/fecha/i);
  assert.throws(()=>feeAmountForDate({period:'2027-02',date:'2027-02-29',tiers}),/fecha/i);
});
