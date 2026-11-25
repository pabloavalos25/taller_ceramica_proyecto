import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthHandlers } from '../src/auth/http-handlers.mjs';

test('login rejects cross-origin and config errors without authenticating', async () => {
  let calls = 0;
  const handlers = createAuthHandlers({ origin: 'https://suyai.example', production: true, authenticate: async () => { calls++; return 'x'; } });
  const req = new Request('https://suyai.example/api/auth/login', { method: 'POST', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ana@example.com', password: 'secret' }) });
  assert.equal((await handlers.login(req)).status, 403);
  assert.equal(calls, 0);
});

test('login does not trust a client-supplied network address', async () => {
  let captured;
  const handlers = createAuthHandlers({ origin:'https://suyai.example', production:true, authenticate:async input => { captured=input; return 'A'.repeat(43); } });
  const response = await handlers.login(new Request('https://suyai.example/api/auth/login', { method:'POST', headers:{ origin:'https://suyai.example', 'content-type':'application/json', 'x-forwarded-for':'203.0.113.1' }, body:JSON.stringify({ email:'ana@example.com', password:'secret' }) }));
  assert.equal(response.status, 200);
  assert.equal(captured.source, null);
});

test('login sets an HTTP-only secure cookie and logout revokes it', async () => {
  const token = 'A'.repeat(43); let revoked = null;
  const handlers = createAuthHandlers({ origin: 'https://suyai.example', production: true, authenticate: async () => token, revokeSession: async (value) => { revoked = value; } });
  const headers = { origin: 'https://suyai.example', 'content-type': 'application/json' };
  const response = await handlers.login(new Request('https://suyai.example/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ email: 'ana@example.com', password: 'secret' }) }));
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^__Host-suyai_session=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/);
  const logout = await handlers.logout(new Request('https://suyai.example/api/auth/logout', { method: 'POST', headers: { ...headers, cookie: `__Host-suyai_session=${token}` }, body: '{}' }));
  assert.equal(logout.status, 200); assert.equal(revoked, token); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});

test('rejects oversized payloads, duplicate cookies and missing sessions', async () => {
  let called = false;
  const handlers = createAuthHandlers({ origin: 'http://localhost:3111', production: false, authenticate: async () => { called = true; return 'A'.repeat(43); }, getSession: async () => ({ role: 'ADMIN', mustChangePassword: false }) });
  const headers = { origin: 'http://localhost:3111', 'content-type': 'application/json' };
  const tooLarge = new Request('http://localhost:3111/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ email: 'x'.repeat(5000), password: 'x' }) });
  assert.equal((await handlers.login(tooLarge)).status, 400); assert.equal(called, false);
  const cookie = `suyai_session=${'A'.repeat(43)}; suyai_session=${'B'.repeat(43)}`;
  assert.equal((await handlers.session(new Request('http://localhost:3111/api/auth/session', { headers: { cookie } }))).status, 401);
  assert.equal((await handlers.session(new Request('http://localhost:3111/api/auth/session'))).status, 401);
});

test('password change requires same origin, session cookie and revokes cookie on success', async () => {
  const token = 'A'.repeat(43); let called = 0;
  const handlers = createAuthHandlers({ origin: 'https://suyai.example', production: true, changePassword: async (t, current, next) => { assert.equal(t, token); assert.equal(current, 'old password'); assert.equal(next, 'new password'); called++; } });
  const data = JSON.stringify({ currentPassword: 'old password', newPassword: 'new password' });
  const headers = { origin: 'https://suyai.example', 'content-type': 'application/json', cookie: `__Host-suyai_session=${token}` };
  assert.equal((await handlers.changePassword(new Request('https://suyai.example/api', { method: 'POST', headers: { ...headers, origin: 'https://evil.example' }, body: data }))).status, 403);
  assert.equal((await handlers.changePassword(new Request('https://suyai.example/api', { method: 'POST', headers: { origin: headers.origin, 'content-type': headers['content-type'] }, body: data }))).status, 401);
  const result = await handlers.changePassword(new Request('https://suyai.example/api', { method: 'POST', headers, body: data }));
  assert.equal(result.status, 200); assert.match(result.headers.get('set-cookie'), /Max-Age=0/); assert.equal(called, 1);
});

test('administrator reset requires origin and session and never returns the temporary password', async () => {
  const token = 'A'.repeat(43); const secret = 'contraseña temporal 123'; let calls = 0;
  const handlers = createAuthHandlers({ origin: 'https://suyai.example', production: true, resetStudentPassword: async (data) => { assert.equal(data.actorToken, token); assert.equal(data.temporaryPassword, secret); calls++; } });
  const payload = JSON.stringify({ studentId: 'student-id', temporaryPassword: secret, reason: 'solicitud de alumna' });
  const headers = { origin: 'https://suyai.example', 'content-type': 'application/json', cookie: `__Host-suyai_session=${token}` };
  assert.equal((await handlers.resetStudentPassword(new Request('https://suyai.example/api', { method: 'POST', headers: { ...headers, origin: 'https://attacker.example' }, body: payload }))).status, 403);
  assert.equal((await handlers.resetStudentPassword(new Request('https://suyai.example/api', { method: 'POST', headers: { origin: headers.origin, 'content-type': headers['content-type'] }, body: payload }))).status, 401);
  const result = await handlers.resetStudentPassword(new Request('https://suyai.example/api', { method: 'POST', headers, body: payload }));
  assert.equal(result.status, 200); assert.equal(calls, 1); assert.equal((await result.text()).includes(secret), false);
});

test('student creation requires session and passes identity from cookie, not the body', async () => {
  const token = 'A'.repeat(43); let captured;
  const handlers = createAuthHandlers({ origin: 'https://suyai.example', production: true, createStudent: async (input) => { captured = input; return 'student-id'; } });
  const headers = { origin:'https://suyai.example', 'content-type':'application/json', cookie:`__Host-suyai_session=${token}` };
  const payload = { fullName:'Ana', email:'ana@example.com', phone:'123', initialPassword:'temporal segura', enrolledOn:'2026-11-25', active:true, weekdays:[1], feeStart:'CURRENT' };
  const request = (data, overrides = {}) => new Request('https://suyai.example/api', { method:'POST', headers:{ ...headers, ...overrides }, body:JSON.stringify(data) });
  assert.equal((await handlers.createStudent(request(payload, { origin:'https://evil.example' }))).status, 403);
  assert.equal((await handlers.createStudent(request({ ...payload, actorToken:'forged' }))).status, 400);
  const res = await handlers.createStudent(request(payload));
  assert.equal(res.status, 201); assert.equal(captured.actorToken, token); assert.equal((await res.text()).includes(payload.initialPassword), false);
});

test('student status changes use the administrator session and require same-origin requests', async () => {
  const token = 'A'.repeat(43); let captured;
  const handlers = createAuthHandlers({ origin:'https://suyai.example', production:true, changeStudentStatus: async (input) => { captured = input; return { active:false }; } });
  const headers = { origin:'https://suyai.example', 'content-type':'application/json', cookie:`__Host-suyai_session=${token}` };
  const body = { studentId:'student-id', action:'DEACTIVATE' };
  const request = (data, overrides = {}) => new Request('https://suyai.example/api', { method:'POST', headers:{ ...headers, ...overrides }, body:JSON.stringify(data) });
  assert.equal((await handlers.changeStudentStatus(request(body, { origin:'https://attacker.example' }))).status, 403);
  assert.equal((await handlers.changeStudentStatus(request({ ...body, actorToken:'forged' }))).status, 400);
  const response = await handlers.changeStudentStatus(request(body));
  assert.equal(response.status, 200); assert.equal(captured.actorToken, token);
});

test('student listing uses the session cookie, validates filters and disables caching', async () => {
  const token = 'A'.repeat(43); let input;
  const handlers = createAuthHandlers({ origin:'https://suyai.example', production:true, listStudents: async (data) => { input=data; return { total:0, items:[] }; } });
  const cookie=`__Host-suyai_session=${token}`;
  assert.equal((await handlers.listStudents(new Request('https://suyai.example/api/admin/students'))).status,401);
  assert.equal((await handlers.listStudents(new Request('https://suyai.example/api/admin/students?weekday=1&weekday=2',{headers:{cookie}}))).status,400);
  const response=await handlers.listStudents(new Request('https://suyai.example/api/admin/students?weekday=2&status=ACTIVE',{headers:{cookie}}));
  assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store'); assert.equal(input.weekday,2); assert.equal(input.actorToken,token);
});

test('fee price routes use the session and exact integer cents', async () => {
  const token='A'.repeat(43); let captured;
  const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,setFeePrice:async (data)=>{captured=data;},getFeePrices:async()=>({current:null,next:null,history:[]})});
  const headers={origin:'https://suyai.example','content-type':'application/json',cookie:`__Host-suyai_session=${token}`};
  const request=(data,overrides={})=>new Request('https://suyai.example/api/admin/fee-prices',{method:'POST',headers:{...headers,...overrides},body:JSON.stringify(data)});
  assert.equal((await handlers.setFeePrice(request({mode:'SCHEDULE',amountCents:'100'},{origin:'https://evil.example'}))).status,403);
  assert.equal((await handlers.setFeePrice(request({mode:'SCHEDULE',amountCents:100}))).status,400);
  assert.equal((await handlers.setFeePrice(request({mode:'SCHEDULE',amountCents:'3500000'}))).status,200);
  assert.equal(captured.actorToken,token); assert.equal(captured.amountCents,3500000n);
  assert.equal((await handlers.getFeePrices(new Request('https://suyai.example/api/admin/fee-prices',{headers:{cookie:headers.cookie}}))).status,200);
});

test('due-day routes accept only integer days from 1 to 28 and use the admin session', async () => {
  const token='A'.repeat(43); let captured;
  const handlers=createAuthHandlers({ origin:'https://suyai.example', production:true, setDueDay:async (input)=>{captured=input;}, getDueDays:async()=>({current:null,next:null,history:[]}) });
  const headers={origin:'https://suyai.example','content-type':'application/json',cookie:`__Host-suyai_session=${token}`};
  const request=(body,extra={})=>new Request('https://suyai.example/api/admin/fee-due-day',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
  assert.equal((await handlers.setDueDay(request({mode:'INITIAL',day:10},{origin:'https://evil.example'}))).status,403);
  assert.equal((await handlers.setDueDay(request({mode:'INITIAL',day:29}))).status,400);
  assert.equal((await handlers.setDueDay(request({mode:'INITIAL',day:'10'}))).status,400);
  assert.equal((await handlers.setDueDay(request({mode:'INITIAL',day:10}))).status,200);
  assert.equal(captured.actorToken,token); assert.equal(captured.day,10);
  assert.equal((await handlers.getDueDays(new Request('https://suyai.example/api/admin/fee-due-day',{headers:{cookie:headers.cookie}}))).status,200);
});

test('fee adjustment requires admin session and sends exact cents with an idempotency key', async () => {
  const token='A'.repeat(43); let captured;
  const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,adjustFee:async(data)=>{captured=data; return {id:'adjustment-id',replayed:false};}});
  const headers={origin:'https://suyai.example','content-type':'application/json',cookie:`__Host-suyai_session=${token}`};
  const payload={feeId:'fee-id',amountCents:'7000',reason:'Beca',idempotencyKey:'request-id'};
  const request=(body,extra={})=>new Request('https://suyai.example/api',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
  assert.equal((await handlers.adjustFee(request(payload,{origin:'https://evil.example'}))).status,403);
  assert.equal((await handlers.adjustFee(request({...payload,amountCents:7000}))).status,400);
  const response=await handlers.adjustFee(request(payload)); assert.equal(response.status,200);
  assert.equal(captured.actorToken,token); assert.equal(captured.amountCents,7000n);
});

test('adjustable fees query requires a session and validates pagination', async () => {
  let captured; const token='A'.repeat(43);
  const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,listAdjustableFees:async input=>{captured=input; return {items:[],hasMore:false};}});
  const request=(query='',cookie='')=>new Request(`https://suyai.example/api?${query}`,{headers:{cookie}});
  assert.equal((await handlers.listAdjustableFees(request())).status,401);
  const cookie=`__Host-suyai_session=${token}`;
  assert.equal((await handlers.listAdjustableFees(request('offset=-1',cookie))).status,400);
  assert.equal((await handlers.listAdjustableFees(request('search=Ana&offset=50',cookie))).status,200);
  assert.equal(captured.actorToken,token); assert.equal(captured.search,'Ana'); assert.equal(captured.offset,50);
});

test('kiln batch endpoint requires the session and trusted origin',async()=>{
  const token='A'.repeat(43); let received;
  const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,saveKilnBatch:async value=>{received=value;return {id:'batch',replayed:false};}});
  const request=(origin,cookie)=>new Request('https://suyai.example/api/admin/kiln-batches',{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify({idempotencyKey:'key',batch:{type:'KILN'}})});
  assert.equal((await handlers.saveKilnBatch(request('https://evil.example',`__Host-suyai_session=${token}`))).status,403);
  assert.equal((await handlers.saveKilnBatch(request('https://suyai.example',''))).status,401);
  assert.equal((await handlers.saveKilnBatch(request('https://suyai.example',`__Host-suyai_session=${token}`))).status,200);
  assert.equal(received.actorToken,token);
});

test('material batch endpoint requires the session and trusted origin',async()=>{
  const token='A'.repeat(43);let received;
  const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,saveMaterialBatch:async value=>{received=value;return {id:'batch'};}});
  const request=(origin,cookie)=>new Request('https://suyai.example/api/admin/material-batches',{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify({idempotencyKey:'key',batch:{type:'MATERIAL'}})});
  assert.equal((await handlers.saveMaterialBatch(request('https://evil.example',`__Host-suyai_session=${token}`))).status,403);
  assert.equal((await handlers.saveMaterialBatch(request('https://suyai.example',''))).status,401);
  assert.equal((await handlers.saveMaterialBatch(request('https://suyai.example',`__Host-suyai_session=${token}`))).status,200);
  assert.equal(received.actorToken,token);
});

test('payment endpoints require trusted origin and session, and pass exact amounts',async()=>{
  const token='A'.repeat(43);let captured;const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,listPayableCharges:async input=>{captured=input;return {items:[]};},recordAuthorizedPayment:async input=>{captured=input;return {id:'payment'};}});
  const get=cookie=>new Request('https://suyai.example/api/admin/payments?studentId=11111111-1111-4111-8111-111111111111',{headers:{cookie}});
  assert.equal((await handlers.payableCharges(get(''))).status,401);assert.equal((await handlers.payableCharges(get(`__Host-suyai_session=${token}`))).status,200);
  const post=(origin,cookie)=>new Request('https://suyai.example/api/admin/payments',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({studentId:'student',idempotencyKey:'key',method:'CASH',allocations:[{chargeId:'charge',amountCents:'40000'}]})});
  assert.equal((await handlers.recordPayment(post('https://evil.example',`__Host-suyai_session=${token}`))).status,403);
  assert.equal((await handlers.recordPayment(post('https://suyai.example',`__Host-suyai_session=${token}`))).status,200);
  assert.equal(captured.actorToken,token);assert.equal(captured.allocations[0].amount,40000n);
});

test('payment history and void endpoints require session and trusted origin',async()=>{
 const token='A'.repeat(43);let captured;const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,listPayments:async input=>{captured=input;return {items:[]};},getPayment:async()=>null,voidAuthorizedPayment:async input=>{captured=input;return {id:input.paymentId};}});
 const get=cookie=>new Request('https://suyai.example/api/admin/payment-history?search=Ana&status=VOIDED',{headers:{cookie}});
 assert.equal((await handlers.paymentHistory(get(''))).status,401);assert.equal((await handlers.paymentHistory(get(`__Host-suyai_session=${token}`))).status,200);assert.equal(captured.status,'VOIDED');
 const post=(origin,cookie)=>new Request('https://suyai.example/api/admin/payment-history',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({paymentId:'id',reason:'Duplicado'})});
 assert.equal((await handlers.voidPayment(post('https://evil.example',`__Host-suyai_session=${token}`))).status,403);assert.equal((await handlers.voidPayment(post('https://suyai.example',`__Host-suyai_session=${token}`))).status,200);assert.equal(captured.actorToken,token);
});

test('student portal accepts only pagination and gets identity from session',async()=>{
 const token='A'.repeat(43);let captured;const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,getStudentPortal:async input=>{captured=input;return {profile:{name:'Ana'}};}});
 const request=(query,cookie=`__Host-suyai_session=${token}`)=>new Request(`https://suyai.example/api/student/portal?${query}`,{headers:{cookie}});
 assert.equal((await handlers.studentPortal(request('',''))).status,401);
 assert.equal((await handlers.studentPortal(request('studentId=otra'))).status,400);
 assert.equal((await handlers.studentPortal(request('chargesOffset=50&paymentsOffset=0'))).status,200);
 assert.equal(captured.actorToken,token);assert.equal(captured.chargesOffset,50);assert.equal(Object.hasOwn(captured,'studentId'),false);
});

test('material correction requires trusted origin and passes exact cents',async()=>{
 const token='A'.repeat(43);let captured;const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,correctMaterialItem:async input=>{captured=input;return {id:'event'};}});
 const request=(origin,cookie)=>new Request('https://suyai.example/api/admin/material-corrections',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({itemId:'id',action:'ADJUST',amountCents:'7000',reason:'Error',idempotencyKey:'key'})});
 assert.equal((await handlers.correctMaterialItem(request('https://evil.example',`__Host-suyai_session=${token}`))).status,403);
 assert.equal((await handlers.correctMaterialItem(request('https://suyai.example',''))).status,401);
 assert.equal((await handlers.correctMaterialItem(request('https://suyai.example',`__Host-suyai_session=${token}`))).status,200);assert.equal(captured.actorToken,token);assert.equal(captured.amountCents,7000n);
});

test('shared draft endpoints use session and require trusted origin for mutations',async()=>{
 const token='A'.repeat(43);let captured;const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,listDrafts:async input=>{captured=input;return {items:[]};},getDraft:async()=>null,saveDraft:async input=>{captured=input;return {version:1};},confirmDraft:async input=>{captured=input;return {batchId:'batch'};}});
 const get=cookie=>new Request('https://suyai.example/api/admin/drafts?type=KILN',{headers:{cookie}});assert.equal((await handlers.draftQuery(get(''))).status,401);assert.equal((await handlers.draftQuery(get(`__Host-suyai_session=${token}`))).status,200);assert.equal(captured.actorToken,token);
 const post=(origin,cookie,body)=>new Request('https://suyai.example/api/admin/drafts',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)});
 const input={action:'CONFIRM',draftId:'id',expectedVersion:1,idempotencyKey:'key'};assert.equal((await handlers.draftMutation(post('https://evil.example',`__Host-suyai_session=${token}`,input))).status,403);assert.equal((await handlers.draftMutation(post('https://suyai.example',`__Host-suyai_session=${token}`,input))).status,200);assert.equal(captured.expectedVersion,1);
});

test('kiln history validates filters and resolves identity from session',async()=>{
  let captured; const token='A'.repeat(43);
  const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,listKilnBatches:async input=>{captured=input;return {items:[],hasMore:false};},getKilnBatch:async input=>{captured=input;return null;}});
  const request=(q,cookie=`__Host-suyai_session=${token}`)=>new Request(`https://suyai.example/api?${q}`,{headers:{cookie}});
  assert.equal((await handlers.kilnHistory(request('',''))).status,401);
  assert.equal((await handlers.kilnHistory(request('offset=-2'))).status,400);
  assert.equal((await handlers.kilnHistory(request('period=2026-11&offset=50'))).status,200);
  assert.equal(captured.actorToken,token);assert.equal(captured.period,'2026-11');assert.equal(captured.offset,50);
  assert.equal((await handlers.kilnHistory(request('batchId=123e4567-e89b-42d3-a456-426614174000'))).status,404);
});

test('material history requires a session and validates filters',async()=>{
  const token='A'.repeat(43);let captured;
  const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,listMaterialBatches:async input=>{captured=input;return {items:[],hasMore:false};},getMaterialBatch:async()=>null});
  const request=(q,cookie=`__Host-suyai_session=${token}`)=>new Request(`https://suyai.example/api?${q}`,{headers:{cookie}});
  assert.equal((await handlers.materialHistory(request('',''))).status,401);
  assert.equal((await handlers.materialHistory(request('offset=-1'))).status,400);
  assert.equal((await handlers.materialHistory(request('period=2026-11&offset=50'))).status,200);
  assert.equal(captured.actorToken,token);assert.equal(captured.period,'2026-11');assert.equal(captured.offset,50);
});

test('kiln correction requires same-origin, session, exact cents and allowed fields',async()=>{
  const token='A'.repeat(43);let captured;
  const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,correctKilnItem:async input=>{captured=input;return {id:'event',replayed:false};}});
  const body={itemId:'item',action:'ADJUST',amountCents:'7000',reason:'Corrección',idempotencyKey:'key'};
  const request=(payload,origin='https://suyai.example',cookie=`__Host-suyai_session=${token}`)=>new Request('https://suyai.example/api',{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(payload)});
  assert.equal((await handlers.correctKilnItem(request(body,'https://evil.example'))).status,403);
  assert.equal((await handlers.correctKilnItem(request(body,'https://suyai.example',''))).status,401);
  assert.equal((await handlers.correctKilnItem(request({...body,amountCents:7000}))).status,400);
  assert.equal((await handlers.correctKilnItem(request(body))).status,200);assert.equal(captured.actorToken,token);assert.equal(captured.amountCents,7000n);
});

test('material catalog routes validate session, origin, filters and exact prices',async()=>{
  const token='A'.repeat(43);let captured;
  const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,saveMaterial:async input=>{captured=input;return {id:'m',replayed:false};},listMaterials:async input=>{captured=input;return {items:[],hasMore:false};}});
  const payload={idempotencyKey:'key',material:{name:'Pasta',category:'Arcilla',description:null,unit:'KG',customUnit:null,priceCents:'400000',active:true}};
  const post=(body,origin='https://suyai.example',cookie=`__Host-suyai_session=${token}`)=>new Request('https://suyai.example/api',{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)});
  assert.equal((await handlers.saveMaterial(post(payload,'https://evil.example'))).status,403);
  assert.equal((await handlers.saveMaterial(post({...payload,material:{...payload.material,priceCents:400000}}))).status,400);
  assert.equal((await handlers.saveMaterial(post(payload))).status,200);assert.equal(captured.material.priceCents,400000n);assert.equal(captured.actorToken,token);
  const get=q=>new Request(`https://suyai.example/api?${q}`,{headers:{cookie:`__Host-suyai_session=${token}`}});
  assert.equal((await handlers.listMaterials(get('offset=-1'))).status,400);
  assert.equal((await handlers.listMaterials(get('search=pasta&active=ACTIVE'))).status,200);assert.equal(captured.search,'pasta');
});
