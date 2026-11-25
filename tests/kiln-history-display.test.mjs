import {test} from 'node:test';
import assert from 'node:assert/strict';
import {balanceLabel} from '../src/batches/kiln-history-display.mjs';

test('formats exact pending balances and flags overpayments',()=>{
  assert.equal(balanceLabel('1450000','350000'),'$ 11.000,00');
  assert.equal(balanceLabel('100','101'),'Requiere revisión');
  assert.equal(balanceLabel('900719925474099300','1'),'$ 9.007.199.254.740.992,99');
});
