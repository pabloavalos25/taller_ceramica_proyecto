import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFeeCronHandler} from '../src/fees/cron.mjs';

test('only a configured scheduler with the secret can generate fees',async()=>{
 let calls=0;const secret='a'.repeat(48);const run=async period=>{calls++;assert.equal(period,'2026-11');return [{created:2},{created:0}];};
 const req=authorization=>new Request('https://suyai.example/api/cron/fees',{headers:authorization?{authorization}:{}});
 for(const config of [{enabled:false,secret,startPeriod:'2026-11'},{enabled:true,secret:'',startPeriod:'2026-11'},{enabled:true,secret:'x'.repeat(31),startPeriod:'2026-11'},{enabled:true,secret,startPeriod:''},{enabled:true,secret,startPeriod:'2026-13'}]){
  assert.equal((await createFeeCronHandler({...config,run})(req(`Bearer ${secret}`))).status,503);
 }
 const handler=createFeeCronHandler({enabled:true,secret,startPeriod:'2026-11',run});
 assert.equal((await handler(req())).status,401);
 assert.equal((await handler(req(`Bearer ${'b'.repeat(48)}`))).status,401);
 assert.equal(calls,0);
 const result=await handler(req(`Bearer ${secret}`));assert.equal(result.status,200);assert.deepEqual(await result.json(),{periods:2,created:2});assert.equal(calls,1);
});
test('scheduler returns a generic error if generation fails',async()=>{
 const secret='z'.repeat(48),handler=createFeeCronHandler({enabled:true,secret,startPeriod:'2026-11',run:async()=>{throw Error('secret detail');}});
 const response=await handler(new Request('https://suyai.example/api/cron/fees',{headers:{authorization:`Bearer ${secret}`}}));
 assert.equal(response.status,503);assert.equal((await response.text()).includes('secret detail'),false);
});
