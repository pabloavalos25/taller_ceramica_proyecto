import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import pg from 'pg';
import {createSession,revokeSession} from '../../src/auth/sessions.mjs';
import {listPayableCharges,recordAuthorizedPayment,listPayments,getPayment,voidAuthorizedPayment} from '../../src/payments/web.mjs';
test('protege la consulta y el registro de pagos con sesión administrativa',async()=>{
 const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('TEST_DATABASE_URL debe ser una base de pruebas aislada');const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  for(const file of ['001_initial.sql','003_financial_foundation.sql','004_payment_idempotency.sql','005_payment_void.sql','006_auth_sessions.sql','015_fee_adjustments.sql','024_fee_tier_schedules.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
  await pool.query('DELETE FROM fee_tier_rules');await pool.query('DELETE FROM fee_tier_schedules');
  const admin=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('admin@test.invalid','hash','ADMIN',false) RETURNING id")).rows[0].id;
  const student=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('alumna@test.invalid','hash','USER') RETURNING id")).rows[0].id;await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on) VALUES ($1,'Ana','2026-01-01')",[student]);
  const charge=(await pool.query("INSERT INTO charges(student_id,category,amount_cents,description) VALUES ($1,'MATERIAL',100000,'Pasta') RETURNING id",[student])).rows[0].id;
  const token=await createSession(pool,admin),userToken=await createSession(pool,student);const request={actorToken:token,studentId:student,idempotencyKey:randomUUID(),method:'CASH',allocations:[{chargeId:charge,amount:40000n}]};
  await assert.rejects(listPayableCharges(pool,{actorToken:userToken,studentId:student}),/autoriz/i);
  assert.equal((await listPayableCharges(pool,{actorToken:token,studentId:student})).items[0].outstandingCents,'100000');
  const [a,b]=await Promise.all([recordAuthorizedPayment(pool,request),recordAuthorizedPayment(pool,request)]);assert.equal(a.id,b.id);assert.equal([a,b].filter(x=>x.replayed).length,1);
  assert.equal((await listPayableCharges(pool,{actorToken:token,studentId:student})).items[0].outstandingCents,'60000');
  assert.equal((await listPayments(pool,{actorToken:token,search:'Ana'})).items.length,1);
  const detail=await getPayment(pool,{actorToken:token,paymentId:a.id});assert.equal(detail.allocations[0].amountCents,'40000');
  await assert.rejects(voidAuthorizedPayment(pool,{actorToken:userToken,paymentId:a.id,reason:'Error'}),/autoriz/i);
  const voided=await voidAuthorizedPayment(pool,{actorToken:token,paymentId:a.id,reason:'Pago duplicado'});assert.equal(voided.replayed,false);
  assert.equal((await voidAuthorizedPayment(pool,{actorToken:token,paymentId:a.id,reason:'Pago duplicado'})).replayed,true);
  assert.equal((await getPayment(pool,{actorToken:token,paymentId:a.id})).voidReason,'Pago duplicado');
  assert.equal((await listPayments(pool,{actorToken:token,status:'VOIDED'})).items.length,1);
  assert.equal((await listPayments(pool,{actorToken:token,status:'ACTIVE'})).items.length,0);
  await assert.rejects(getPayment(pool,{actorToken:userToken,paymentId:a.id}),/autoriz/i);
  await assert.rejects(voidAuthorizedPayment(pool,{actorToken:token,paymentId:a.id,reason:'Otro motivo'}),/anulado/i);
  assert.equal((await listPayableCharges(pool,{actorToken:token,studentId:student})).items[0].outstandingCents,'100000');
  await recordAuthorizedPayment(pool,{...request,idempotencyKey:randomUUID()});
  const stale={...request,idempotencyKey:randomUUID(),allocations:[{chargeId:charge,amount:60001n}]};
  await assert.rejects(recordAuthorizedPayment(pool,stale),/asignación/i);
  const attempt=()=>recordAuthorizedPayment(pool,{...request,idempotencyKey:randomUUID(),allocations:[{chargeId:charge,amount:40000n}]});
  const competing=await Promise.allSettled([attempt(),attempt()]);assert.equal(competing.filter(x=>x.status==='fulfilled').length,1);
  assert.equal((await listPayableCharges(pool,{actorToken:token,studentId:student})).items[0].outstandingCents,'20000');
  await assert.rejects(recordAuthorizedPayment(pool,{...request,actorToken:userToken,idempotencyKey:randomUUID()}),/autoriz/i);
  await revokeSession(pool,token);await assert.rejects(recordAuthorizedPayment(pool,{...request,idempotencyKey:randomUUID()}),/autoriz/i);await assert.rejects(voidAuthorizedPayment(pool,{actorToken:token,paymentId:a.id,reason:'Pago duplicado'}),/autoriz/i);
 }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
