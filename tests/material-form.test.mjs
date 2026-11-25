import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareMaterial} from '../src/materials/form.mjs';
const form={name:' Pasta ',category:' Arcilla ',description:' ',unit:'KG',customUnit:'',price:'4.000,50',active:true};
test('prepares exact catalog prices and validates custom units',()=>{
  assert.deepEqual(prepareMaterial(form),{name:'Pasta',category:'Arcilla',description:null,unit:'KG',customUnit:null,priceCents:'400050',active:true});
  assert.throws(()=>prepareMaterial({...form,unit:'CUSTOM'}),/unidad/i);
  assert.equal(prepareMaterial({...form,unit:'CUSTOM',customUnit:'frasco',price:'0'}).customUnit,'frasco');
  assert.throws(()=>prepareMaterial({...form,name:' '}),/nombre/i);
  assert.throws(()=>prepareMaterial({...form,price:'-1'}),/precio/i);
});
