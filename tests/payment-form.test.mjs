import {test} from 'node:test';import assert from 'node:assert/strict';import {preparePayment} from '../src/payments/form.mjs';
test('prepara asignaciones parciales en centavos exactos y rechaza sobrepagos',()=>{
 const charges=[{id:'a',outstandingCents:'1000000',inconsistent:false},{id:'b',outstandingCents:'600000',inconsistent:false}];
 const result=preparePayment({studentId:'student',method:'CASH',notes:'',amounts:{a:'5.000,00',b:'6.000,00'}},charges);
 assert.deepEqual(result.allocations,[{chargeId:'a',amountCents:'500000'},{chargeId:'b',amountCents:'600000'}]);assert.equal(result.totalCents,'1100000');
 assert.throws(()=>preparePayment({studentId:'student',method:'CASH',amounts:{a:'10.001'}},charges),/pendiente/i);
 assert.throws(()=>preparePayment({studentId:'student',method:'CASH',amounts:{}},charges),/cargo/i);
 assert.throws(()=>preparePayment({studentId:'student',method:'CASH',amounts:{a:'1'}},[{...charges[0],inconsistent:true}]),/revisión/i);
});
