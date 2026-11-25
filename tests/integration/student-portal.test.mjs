import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import pg from 'pg';
import {createSession,revokeSession} from '../../src/auth/sessions.mjs';import {recordPayment,voidPayment} from '../../src/db/payments.mjs';import {getStudentPortal} from '../../src/students/portal.mjs';import {saveMaterialBatch} from '../../src/materials/batches.mjs';import {correctMaterialItem} from '../../src/materials/corrections.mjs';
import {getAdminSummary} from '../../src/students/admin-summary.mjs';
test('cada alumna consulta únicamente sus datos, pagos vigentes y anulados',async()=>{
 const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('TEST_DATABASE_URL debe ser una base aislada');const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  for(const file of ['001_initial.sql','003_financial_foundation.sql','004_payment_idempotency.sql','005_payment_void.sql','006_auth_sessions.sql','016_kiln_batches.sql','017_kiln_corrections.sql','018_material_catalog.sql','019_material_batches.sql','020_material_corrections.sql','015_fee_adjustments.sql','024_fee_tier_schedules.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
  await pool.query('DELETE FROM fee_tier_rules');await pool.query('DELETE FROM fee_tier_schedules');
  const admin=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('admin@test.invalid','hash','ADMIN',false) RETURNING id")).rows[0].id;
  const ids=[];for(const [email,name,active] of [['ana@test.invalid','Ana',true],['bea@test.invalid','Bea',false]]){const id=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ($1,'hash','USER',false) RETURNING id",[email])).rows[0].id;ids.push(id);await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on,active) VALUES ($1,$2,'2026-01-01',$3)",[id,name,active]);}
  const a=(await pool.query("INSERT INTO charges(student_id,category,amount_cents,description) VALUES ($1,'MATERIAL',600000,'Pasta Ana') RETURNING id",[ids[0]])).rows[0].id;await pool.query("INSERT INTO charges(student_id,category,amount_cents,description) VALUES ($1,'KILN',900000,'Pieza privada Bea')",[ids[1]]);
  const pay=await recordPayment(pool,{actorId:admin,studentId:ids[0],idempotencyKey:randomUUID(),method:'CASH',allocations:[{chargeId:a,amount:200000n}]});
  const ana=await createSession(pool,ids[0]),bea=await createSession(pool,ids[1]),adminToken=await createSession(pool,admin);
  const summary=await getAdminSummary(pool,{actorToken:adminToken});assert.equal(summary.outstandingCents,'1300000');assert.equal(summary.incomeCents,'200000');assert.equal(summary.recentPayments[0].studentName,'Ana');await assert.rejects(getAdminSummary(pool,{actorToken:ana}),/autoriz/i);
  assert.equal(summary.monthlyIncome.length,6);assert.equal(summary.monthlyIncome.at(-1).amountCents,'200000');assert.equal(summary.monthlyIncome.at(-2).amountCents,'0');
  const result=await getStudentPortal(pool,{actorToken:ana});assert.equal(result.profile.name,'Ana');assert.equal(result.summary.outstandingCents,'400000');assert.equal(result.charges.items[0].description,'Pasta Ana');assert.equal(result.payments.items.length,1);
  assert.deepEqual(result.summary.byCategory,{FEE:'0',KILN:'0',MATERIAL:'400000'});
  const other=await getStudentPortal(pool,{actorToken:bea});assert.equal(other.profile.active,false);assert.equal(other.charges.items[0].description,'Pieza privada Bea');assert.equal(other.payments.items.length,0);
  assert.deepEqual(other.summary.byCategory,{FEE:'0',KILN:'900000',MATERIAL:'0'});
  await assert.rejects(getStudentPortal(pool,{actorToken:adminToken}),/autoriz/i);
  await pool.query('UPDATE users SET must_change_password=true WHERE id=$1',[ids[1]]);await assert.rejects(getStudentPortal(pool,{actorToken:bea}),/autoriz/i);
  await pool.query('UPDATE users SET must_change_password=false WHERE id=$1',[ids[1]]);
  const mat=(await pool.query("INSERT INTO materials(name,category,unit,price_cents) VALUES ('Arcilla','Arcilla','KG',10000) RETURNING id")).rows[0].id;
  await saveMaterialBatch(pool,{actorToken:adminToken,idempotencyKey:randomUUID(),batch:{type:'MATERIAL',date:'2026-11-25',period:'2026-11',students:[{studentId:ids[0],items:[{materialId:mat,name:'Arcilla',quantity:'1',unitPrice:'100.00'}]}]}});
  const materialItem=(await pool.query('SELECT id FROM material_batch_items')).rows[0].id;await correctMaterialItem(pool,{actorToken:adminToken,itemId:materialItem,action:'VOID',amountCents:0n,reason:'Error',idempotencyKey:randomUUID()});
  assert.equal((await getStudentPortal(pool,{actorToken:ana})).charges.items.find(x=>x.description==='Arcilla').voided,true);
  await voidPayment(pool,{actorId:admin,paymentId:pay.id,reason:'Error'});const after=await getStudentPortal(pool,{actorToken:ana});assert.equal(after.summary.outstandingCents,'600000');assert.equal(after.payments.items[0].voided,true);
  const afterVoid=await getAdminSummary(pool,{actorToken:adminToken});assert.equal(afterVoid.outstandingCents,'1500000');assert.equal(afterVoid.incomeCents,'0');assert.equal(afterVoid.recentPayments[0].voided,true);
  assert.equal(afterVoid.monthlyIncome.at(-1).amountCents,'0');
  await pool.query("INSERT INTO monthly_fees(student_id,period_year,period_month,original_cents,due_date) VALUES ($1,2026,11,100000,'2026-11-10')",[ids[0]]);
  assert.equal((await getStudentPortal(pool,{actorToken:ana})).summary.inconsistent,true);
  await revokeSession(pool,ana);await assert.rejects(getStudentPortal(pool,{actorToken:ana}),/autoriz/i);
 }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
