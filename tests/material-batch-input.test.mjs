import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialBatchPayload} from '../src/materials/batch-input.mjs';

test('prepara cantidades decimales y precios exactos para el consumo',()=>{
  const result=materialBatchPayload({date:'2026-11-25',period:'2026-11',students:[{id:'11111111-1111-4111-8111-111111111111',items:[{materialId:'22222222-2222-4222-8222-222222222222',name:'Pasta',quantity:'1,5',price:'4.000,00',zeroPriceReason:''}]}]});
  assert.equal(result.students[0].items[0].quantity,'1.5');
  assert.equal(result.students[0].items[0].unitPrice,'4000.00');
});

test('rechaza cantidad inválida y precio cero sin motivo',()=>{
  const form={date:'2026-11-25',period:'2026-11',students:[{id:'11111111-1111-4111-8111-111111111111',items:[{materialId:'22222222-2222-4222-8222-222222222222',name:'Pasta',quantity:'0',price:'10,00',zeroPriceReason:''}]}]};
  assert.throws(()=>materialBatchPayload(form),RangeError);
  form.students[0].items[0].quantity='0,5'; form.students[0].items[0].price='0';
  assert.throws(()=>materialBatchPayload(form),RangeError);
  form.students[0].items[0].zeroPriceReason='Cortesía';
  assert.equal(materialBatchPayload(form).students[0].items[0].unitPrice,'0.00');
});

test('indica qué dato falta para revisar la carga',()=>{
  const form={date:'',period:'',students:[]};
  assert.throws(()=>materialBatchPayload(form),/fecha de consumo/i);
  form.date='2026-11-25';assert.throws(()=>materialBatchPayload(form),/período de cobro/i);
  form.period='2026-11';assert.throws(()=>materialBatchPayload(form),/agregá.*alumna/i);
  form.students=[{id:'11111111-1111-4111-8111-111111111111',name:'Lucía',items:[{materialId:'',name:'',quantity:'1',price:'',zeroPriceReason:''}]}];
  assert.throws(()=>materialBatchPayload(form),/seleccioná.*material.*Lucía/i);
  Object.assign(form.students[0].items[0],{materialId:'22222222-2222-4222-8222-222222222222',name:'Pasta',price:'4000',quantity:'0'});
  assert.throws(()=>materialBatchPayload(form),/cantidad.*Lucía/i);
  form.students[0].items[0].quantity='1';form.students[0].items[0].price='';
  assert.throws(()=>materialBatchPayload(form),/precio.*Lucía/i);
});
