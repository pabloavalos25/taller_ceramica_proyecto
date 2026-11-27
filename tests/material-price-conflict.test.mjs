import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAuthHandlers} from '../src/auth/http-handlers.mjs';

test('precio de material desactualizado devuelve conflicto tanto en carga directa como en borrador',async()=>{
 const conflict=()=>{const e=new Error('El precio cambió; volvé a seleccionar el material');e.code='PRICE';throw e;};
 const handlers=createAuthHandlers({origin:'https://suyai.test',production:false,saveMaterialBatch:conflict,confirmDraft:conflict});
 const request=body=>new Request('https://suyai.test/api',{method:'POST',headers:{origin:'https://suyai.test','content-type':'application/json',cookie:`suyai_session=${'a'.repeat(43)}`},body:JSON.stringify(body)});
 const direct=await handlers.saveMaterialBatch(request({idempotencyKey:'key',batch:{}}));
 assert.equal(direct.status,409);
 assert.match((await direct.json()).error,/precio cambió/i);
 const draft=await handlers.draftMutation(request({action:'CONFIRM',draftId:'id',expectedVersion:1,idempotencyKey:'key'}));
 assert.equal(draft.status,409);
 assert.match((await draft.json()).error,/precio cambió/i);
});
