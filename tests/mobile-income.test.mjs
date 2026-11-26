import test from 'node:test';
import assert from 'node:assert/strict';
import {hasIncome} from '../src/admin/mobile-income.mjs';

test('recognizes an empty six-month income history', () => {
  assert.equal(hasIncome([{amountCents:'0'}, {amountCents:'0'}]), false);
  assert.equal(hasIncome([]), false);
});

test('recognizes income even when other months are zero', () => {
  assert.equal(hasIncome([{amountCents:'0'}, {amountCents:'12500'}]), true);
  assert.equal(hasIncome([{amountCents:'1'}]), true);
});
