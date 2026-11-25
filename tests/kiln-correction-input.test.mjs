import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareCorrection} from '../src/batches/correction-input.mjs';

test('prepares exact correction amounts and requires a reason',()=>{
  assert.deepEqual(prepareCorrection('ADJUST','3.500,25','Descuento','100000'),{amountCents:'350025',reason:'Descuento'});
  assert.deepEqual(prepareCorrection('VOID','','Error de carga','0'),{amountCents:'0',reason:'Error de carga'});
  assert.throws(()=>prepareCorrection('ADJUST','900','Motivo','100000'),/abonado/i);
  assert.throws(()=>prepareCorrection('VOID','',' ','0'),/motivo/i);
  assert.throws(()=>prepareCorrection('VOID','','Error','1'),/abonado/i);
});
