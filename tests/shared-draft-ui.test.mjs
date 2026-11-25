import {test} from 'node:test';import assert from 'node:assert/strict';import {draftIsSynced} from '../src/drafts/ui.mjs';
test('requiere guardar cambios antes de confirmar un borrador compartido',()=>{
 const form={date:'2026-11-25',students:[{name:'Ana'}]};assert.equal(draftIsSynced(form,JSON.stringify(form)),true);assert.equal(draftIsSynced({...form,date:'2026-11-26'},JSON.stringify(form)),false);assert.equal(draftIsSynced(form,null),false);
});
