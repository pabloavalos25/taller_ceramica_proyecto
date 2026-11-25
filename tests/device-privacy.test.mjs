import {test} from 'node:test';
import assert from 'node:assert/strict';
import { inspectDevice, prepareTransfer, finishTransfer, clearDevice } from '../src/drafts/device-privacy.mjs';

function storage(initial={}) {
  const data=new Map(Object.entries(initial));
  return {get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
}
test('transfer preserves the original until confirmed and does not erase newer edits',()=>{
  const local=storage({'suyai-kiln-draft-v1':JSON.stringify({date:'2026-11-25',students:[]})}),session=storage();
  const op=prepareTransfer(local,session,'KILN',()=> 'id');
  assert.equal(local.getItem('suyai-kiln-draft-v1'),JSON.stringify(op.data));
  local.setItem('suyai-kiln-draft-v1',JSON.stringify({date:'2026-11-26',students:[]}));
  assert.equal(finishTransfer(local,'KILN',op),false);
  assert.equal(JSON.parse(local.getItem('suyai-kiln-draft-v1')).date,'2026-11-26');
  const retry=prepareTransfer(local,session,'KILN',()=> 'other');
  assert.equal(retry.data.date,'2026-11-26');
});
test('cleanup refuses unfinished drafts and pending operations, and keeps unrelated data',()=>{
  const local=storage({'suyai-material-batch-draft-v1':'{"date":"2026-11-25","students":[]}','other':'keep'}),session=storage({'suyai-payment-pending-v1':'{}'});
  assert.equal(inspectDevice(local,session).pending.length,1);
  assert.throws(()=>clearDevice(local,session));
  assert.ok(local.getItem('suyai-material-batch-draft-v1'));
  session.removeItem('suyai-payment-pending-v1');
  const op=prepareTransfer(local,session,'MATERIAL',()=> 'id');
  assert.equal(finishTransfer(local,'MATERIAL',op),true);
  assert.doesNotThrow(()=>clearDevice(local,session));
  assert.equal(local.getItem('other'),'keep');
});
test('a retry reuses identifiers and neither failed storage nor pending batches discard drafts',()=>{
  const local=storage({'suyai-kiln-draft-v1':'{"date":"2026-11-25","students":[]}'}),session=storage();
  const first=prepareTransfer(local,session,'KILN',()=>crypto.randomUUID());
  assert.deepEqual(prepareTransfer(local,session,'KILN',()=>crypto.randomUUID()),first);
  assert.throws(()=>clearDevice(local,session));
  assert.ok(local.getItem('suyai-kiln-draft-v1'));
  const other=storage({'suyai-material-batch-draft-v1':'{"date":"2026-11-25","students":[]}','suyai-kiln-pending-v1':'{}'});
  assert.throws(()=>prepareTransfer(other,session,'MATERIAL',()=> 'id'));
  assert.ok(other.getItem('suyai-material-batch-draft-v1'));
});
test('malformed drafts remain protected and empty forms can be cleared',()=>{
  const local=storage({'suyai-kiln-draft-v1':'not-json','suyai-material-batch-draft-v1':'{"date":"","period":"","students":[]}'}),session=storage();
  assert.equal(inspectDevice(local,session).drafts.KILN,true);
  assert.throws(()=>clearDevice(local,session));
  assert.throws(()=>prepareTransfer(local,session,'KILN',()=> 'id'));
  assert.equal(local.getItem('suyai-kiln-draft-v1'),'not-json');
  local.removeItem('suyai-kiln-draft-v1');
  clearDevice(local,session);
  assert.equal(local.getItem('suyai-material-batch-draft-v1'),null);
});
