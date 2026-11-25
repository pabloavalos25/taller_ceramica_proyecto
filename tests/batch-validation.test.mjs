import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBatch } from '../src/domain/batch-validation.mjs';

const student='123e4567-e89b-42d3-a456-426614174000';
const kiln=()=>({type:'KILN',date:'2026-11-25',period:'2026-11',students:[{studentId:student,items:[{name:'Taza',firingType:'BISQUE',quantity:'2',unitPrice:'2500.00'}]}]});
test('validates a kiln batch and computes each line and total on the server',()=>{
  const result=validateBatch(kiln());
  assert.equal(result.students[0].items[0].subtotalCents,500000n);
  assert.equal(result.totalCents,500000n);
});
test('rejects duplicate students and incomplete kiln records',()=>{
  const duplicate=kiln(); duplicate.students.push({...duplicate.students[0],studentId:student.toUpperCase()});
  assert.throws(()=>validateBatch(duplicate),/duplicad/i);
  const incomplete=kiln(); incomplete.students[0].items[0].name='  ';
  assert.throws(()=>validateBatch(incomplete),RangeError);
});
test('sums students and supports fractional material quantities with line rounding',()=>{
  const second='123e4567-e89b-42d3-a456-426614174001';
  const batch={type:'MATERIAL',date:'2024-02-29',period:'2024-02',students:[
    {studentId:student,items:[{name:'Pasta',materialId:second,quantity:'1.5',unitPrice:'4000.00'}]},
    {studentId:second,items:[{name:'Esmalte',materialId:second,quantity:'0.005',unitPrice:'1.00'}]},
  ]};
  const result=validateBatch(batch);
  assert.equal(result.students[0].subtotalCents,600000n); assert.equal(result.totalCents,600001n); assert.equal(result.records,2);
});
test('rejects invalid dates, fractional pieces, zero prices without justification and empty blocks',()=>{
  const invalidDate=kiln(); invalidDate.date='2026-02-29'; assert.throws(()=>validateBatch(invalidDate),RangeError);
  const fractional=kiln(); fractional.students[0].items[0].quantity='1.5'; assert.throws(()=>validateBatch(fractional),RangeError);
  const zero=kiln(); zero.students[0].items[0].unitPrice='0'; assert.throws(()=>validateBatch(zero),/precio cero/i);
  zero.students[0].items[0].zeroPriceReason='Bonificación'; assert.equal(validateBatch(zero).totalCents,0n);
  const empty=kiln(); empty.students[0].items=[]; assert.throws(()=>validateBatch(empty),RangeError);
  const oversized={type:'MATERIAL',date:'2026-11-25',period:'2026-11',students:[{studentId:student,items:[{name:'Pasta',materialId:student,quantity:'0.001',unitPrice:'92233720368547758.08'}]}]};
  assert.throws(()=>validateBatch(oversized),RangeError);
});
