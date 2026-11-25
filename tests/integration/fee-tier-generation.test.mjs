import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {ensureTierGeneration} from '../../src/fees/ensure-tier-generation.mjs';
import {createSession} from '../../src/auth/sessions.mjs';
import {getStudentPortal} from '../../src/students/portal.mjs';
import {recordPayment} from '../../src/db/payments.mjs';

test('genera cuotas faltantes de meses con tramos y evita duplicarlas',async()=>{
 const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('TEST_DATABASE_URL debe apuntar a una base aislada');
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
 const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  for(const file of ['001_initial.sql','002_student_status_history.sql','003_financial_foundation.sql','004_payment_idempotency.sql','005_payment_void.sql','006_auth_sessions.sql','010_student_creation.sql','011_student_status_changes.sql','012_fee_price_history.sql','013_fee_due_day_history.sql','014_fee_generation.sql','015_fee_adjustments.sql','016_kiln_batches.sql','017_kiln_corrections.sql','018_material_catalog.sql','019_material_batches.sql','020_material_corrections.sql','024_fee_tier_schedules.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
  await pool.query('DELETE FROM fee_tier_rules');await pool.query('DELETE FROM fee_tier_schedules');
  const schedule=(await pool.query("INSERT INTO fee_tier_schedules(effective_period) VALUES ((date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires') - interval '1 month')::date) RETURNING id")).rows[0].id;
  await pool.query('INSERT INTO fee_tier_rules(schedule_id,start_day,amount_cents) VALUES ($1,1,4500000),($1,2,5000000)',[schedule]);
  const admin=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('admin@test.invalid','hash','ADMIN') RETURNING id")).rows[0].id;
  const student=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('student@test.invalid','hash','USER',false) RETURNING id")).rows[0].id;
  await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on,active) VALUES ($1,'Ana',(date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires')-interval '1 month')::date,true)",[student]);
  await pool.query("INSERT INTO student_fee_preferences(student_id,start_period) VALUES ($1,(date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires')-interval '1 month')::date)",[student]);
  await pool.query("INSERT INTO student_creation_events(actor_id,student_id,occurred_at) VALUES ($1,$2,(date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires')-interval '1 month'+interval '1 day') AT TIME ZONE 'America/Argentina/Buenos_Aires')",[admin,student]);
  await ensureTierGeneration(pool);await ensureTierGeneration(pool);
  const rows=(await pool.query('SELECT f.original_cents::text AS original,c.amount_cents::text AS amount FROM monthly_fees f JOIN charges c ON c.monthly_fee_id=f.id WHERE f.student_id=$1 ORDER BY f.period_year,f.period_month',[student])).rows;
  assert.equal(rows.length,2);assert.equal(rows[0].original,'4500000');assert.equal(rows[0].amount,'5000000');assert.equal(rows[1].original,'4500000');
  const current=(await pool.query("SELECT extract(day FROM statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS day,to_char(statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM') AS period")).rows[0];
  assert.equal(rows[1].amount,current.day===1?'4500000':'5000000');
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM fee_generation_runs')).rows[0].count,2);
  const token=await createSession(pool,student),portal=await getStudentPortal(pool,{actorToken:token});
  assert.equal(portal.summary.outstandingCents,current.day===1?'9500000':'10000000');
  const currentCharge=portal.charges.items.find(item=>`${item.periodYear}-${String(item.periodMonth).padStart(2,'0')}`===current.period);
  assert.ok(currentCharge);
  await assert.rejects(recordPayment(pool,{actorId:admin,studentId:student,idempotencyKey:randomUUID(),method:'CASH',allocations:[{chargeId:currentCharge.id,amount:1n}]}),/cuota.*complet/i);
  await Promise.all([ensureTierGeneration(pool),recordPayment(pool,{actorId:admin,studentId:student,idempotencyKey:randomUUID(),method:'CASH',allocations:[{chargeId:currentCharge.id,amount:BigInt(currentCharge.outstandingCents)}]})]);
  const after=await getStudentPortal(pool,{actorToken:token});assert.equal(after.summary.outstandingCents,'5000000');
  const later=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('later@test.invalid','hash','USER') RETURNING id")).rows[0].id;
  await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on,active) VALUES ($1,'Nueva',(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,true)",[later]);
  await pool.query("INSERT INTO student_fee_preferences(student_id,start_period) VALUES ($1,date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)",[later]);
  await pool.query('INSERT INTO student_creation_events(actor_id,student_id) VALUES ($1,$2)',[admin,later]);
  await ensureTierGeneration(pool);
  const added=(await pool.query('SELECT c.amount_cents::text AS amount FROM monthly_fees f JOIN charges c ON c.monthly_fee_id=f.id WHERE f.student_id=$1',[later])).rows;
  assert.equal(added.length,1);assert.equal(added[0].amount,current.day===1?'4500000':'5000000');
 }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
