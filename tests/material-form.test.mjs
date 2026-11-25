import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareMaterial,focusMaterialForm} from '../src/materials/form.mjs';
const form={name:' Pasta ',category:' Arcilla ',description:' ',unit:'KG',customUnit:'',price:'4.000,50',active:true};
test('prepares exact catalog prices and validates custom units',()=>{
  assert.deepEqual(prepareMaterial(form),{name:'Pasta',category:'Arcilla',description:null,unit:'KG',customUnit:null,priceCents:'400050',active:true});
  assert.throws(()=>prepareMaterial({...form,unit:'CUSTOM'}),/unidad/i);
  assert.equal(prepareMaterial({...form,unit:'CUSTOM',customUnit:'frasco',price:'0'}).customUnit,'frasco');
  assert.throws(()=>prepareMaterial({...form,name:' '}),/nombre/i);
  assert.throws(()=>prepareMaterial({...form,price:'-1'}),/precio/i);
});

test('lleva al formulario visible y enfoca el nombre al abrirlo',()=>{
  const calls=[];
  focusMaterialForm({scrollIntoView:options=>calls.push(['scroll',options]),querySelector:selector=>{assert.equal(selector,'input');return {focus:options=>calls.push(['focus',options])};}});
  assert.deepEqual(calls,[['scroll',{block:'start'}],['focus',{preventScroll:true}]]);
  assert.doesNotThrow(()=>focusMaterialForm(null));
  assert.doesNotThrow(()=>focusMaterialForm({scrollIntoView(){},querySelector(){return null;}}));
});
