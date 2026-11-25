import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTierGenerationGate} from '../src/fees/tier-generation-gate.mjs';

test('solo una sesión válida del rol esperado puede iniciar generación',async()=>{
 let runs=0;
 const sessions={admin:{role:'ADMIN',mustChangePassword:false},student:{role:'USER',mustChangePassword:false},temporary:{role:'USER',mustChangePassword:true}};
 const gate=createTierGenerationGate({loadSession:async token=>sessions[token]??null,run:async()=>{runs++;}});
 await gate('missing','ADMIN');await gate('student','ADMIN');await gate('temporary','USER');assert.equal(runs,0);
 await gate('admin','ADMIN');await gate('student','USER');assert.equal(runs,2);
});

test('comparte la ejecución simultánea y permite reintentar tras fallar',async()=>{
 let runs=0,release;const blocked=new Promise(resolve=>{release=resolve;});
 const gate=createTierGenerationGate({loadSession:async()=>({role:'ADMIN',mustChangePassword:false}),run:async()=>{runs++;await blocked;}});
 const first=gate('one','ADMIN'),second=gate('two','ADMIN');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(runs,1);release();await Promise.all([first,second]);
 let attempts=0;const retry=createTierGenerationGate({loadSession:async()=>({role:'ADMIN',mustChangePassword:false}),run:async()=>{if(++attempts===1)throw Error('temporal');}});
 await assert.rejects(retry('one','ADMIN'),/temporal/);await retry('one','ADMIN');assert.equal(attempts,2);
});
