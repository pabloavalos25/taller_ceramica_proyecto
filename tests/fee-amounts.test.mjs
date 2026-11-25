import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArsCents, formatArsCents } from '../src/fees/amounts.mjs';

test('parses Argentine amounts exactly as integer cents', () => {
  assert.equal(parseArsCents('35.000,50'),'3500050');
  assert.equal(parseArsCents('40000'),'4000000');
  assert.equal(parseArsCents('0,5'),'50');
  assert.equal(formatArsCents('3500050'),'$ 35.000,50');
});

test('rejects ambiguous grouping, negative and imprecise amounts', () => {
  for (const value of ['', '-1', '1.23', '1,234', '1e3', '1.000.00', '999999999999999999999999999999']) assert.throws(()=>parseArsCents(value), RangeError);
  assert.equal(parseArsCents('0'),'0');
});
