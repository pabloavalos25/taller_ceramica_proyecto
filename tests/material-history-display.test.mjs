import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMaterialHistory} from '../src/materials/history-display.mjs';
test('calcula importes y detecta saldos inconsistentes por registro',()=>{
  const result=summarizeMaterialHistory([{items:[{amountCents:'600000',paidCents:'100000'},{amountCents:'250000',paidCents:'0'}]}]);
  assert.deepEqual(result,{records:2,totalCents:'850000',paidCents:'100000',inconsistent:false});
  assert.equal(summarizeMaterialHistory([{items:[{amountCents:'100',paidCents:'101'},{amountCents:'1000',paidCents:'0'}]}]).inconsistent,true);
});
