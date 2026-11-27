import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {syncFeeTiers} from '../../src/fees/sync-tiers.mjs';
import {createSession} from '../../src/auth/sessions.mjs';
import {adjustFee} from '../../src/fees/adjust-fee.mjs';
import {recordPayment} from '../../src/db/payments.mjs';

test('recalcula cuotas impagas una sola vez, respeta pagos completos y ajustes individuales',async()=>{
 const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('TEST_DATABASE_URL debe apuntar a una base aislada');
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
 const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  for(const file of ['001_initial.sql','003_financial_foundation.sql','004_payment_idempotency.sql','005_payment_void.sql','006_auth_sessions.sql','015_fee_adjustments.sql','024_fee_tier_schedules.sql','025_admin_profiles.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
  const admin=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('admin@test.invalid','hash','ADMIN',false) RETURNING id")).rows[0].id; await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Principal','PRINCIPAL')",[admin]);
  const student=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('student@test.invalid','hash','USER',false) RETURNING id")).rows[0].id;
  await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on) VALUES ($1,'Ana','2026-01-01')",[student]);
  async function fee(period){const [year,month]=period.split('-').map(Number);const f=(await pool.query("INSERT INTO monthly_fees(student_id,period_year,period_month,original_cents,due_date) VALUES ($1,$2,$3,4500000,($4 || '-10')::date) RETURNING id",[student,year,month,period])).rows[0].id;const c=(await pool.query("INSERT INTO charges(student_id,category,monthly_fee_id,amount_cents,description) VALUES ($1,'FEE',$2,4500000,'Cuota') RETURNING id",[student,f])).rows[0].id;return {fee:f,charge:c};}
  const unpaid=await fee('2026-12'),paid=await fee('2027-01'),special=await fee('2027-02'),concurrent=await fee('2027-03');
  await recordPayment(pool,{actorId:admin,studentId:student,idempotencyKey:randomUUID(),method:'CASH',allocations:[{chargeId:paid.charge,amount:4500000n}]});
  const token=await createSession(pool,admin);await adjustFee(pool,{actorToken:token,feeId:special.fee,amountCents:3000000n,reason:'Importe acordado',idempotencyKey:randomUUID()});
  const run=async()=>{const client=await pool.connect();try{await client.query('BEGIN');await syncFeeTiers(client,{asOf:'2026-12-11'});await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}};
  await Promise.all([run(),run()]);await run();
  assert.equal((await pool.query('SELECT amount_cents::text AS amount FROM charges WHERE id=$1',[unpaid.charge])).rows[0].amount,'5000000');
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM fee_tier_events WHERE charge_id=$1',[unpaid.charge])).rows[0].count,1);
  const second=await pool.connect();try{await second.query('BEGIN');await syncFeeTiers(second,{asOf:'2027-03-01'});await second.query('COMMIT');}finally{second.release();}
  const amounts=(await pool.query('SELECT id,amount_cents::text AS amount FROM charges ORDER BY id')).rows;
  const byId=Object.fromEntries(amounts.map(row=>[row.id,row.amount]));
  assert.equal(byId[unpaid.charge],'7500000');assert.equal(byId[paid.charge],'4500000');assert.equal(byId[special.charge],'3000000');
  const raceSync=async()=>{const c=await pool.connect();try{await c.query('BEGIN');await syncFeeTiers(c,{asOf:'2027-03-11',chargeIds:[concurrent.charge]});await c.query('COMMIT');}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}};
  const [recalculation,payment]=await Promise.allSettled([raceSync(),recordPayment(pool,{actorId:admin,studentId:student,idempotencyKey:randomUUID(),method:'CASH',allocations:[{chargeId:concurrent.charge,amount:4500000n}]})]);assert.equal(recalculation.status,'fulfilled');
  const race=(await pool.query("SELECT c.amount_cents::text AS amount,COALESCE((SELECT sum(a.amount_cents) FROM payment_allocations a WHERE a.charge_id=c.id),0)::text AS paid FROM charges c WHERE c.id=$1",[concurrent.charge])).rows[0];
  if(payment.status==='fulfilled')assert.deepEqual(race,{amount:'4500000',paid:'4500000'});else assert.deepEqual(race,{amount:'5000000',paid:'0'});
  const failed=await fee('2027-04');await pool.query("CREATE FUNCTION fail_tier_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced failure'; END $$");await pool.query('CREATE TRIGGER fail_tier_event BEFORE INSERT ON fee_tier_events FOR EACH ROW EXECUTE FUNCTION fail_tier_event()');
  const rollback=await pool.connect();try{await rollback.query('BEGIN');await assert.rejects(syncFeeTiers(rollback,{asOf:'2027-04-11',chargeIds:[failed.charge]}),/forced failure/);await rollback.query('ROLLBACK');}finally{rollback.release();}
  assert.equal((await pool.query('SELECT amount_cents::text AS amount FROM charges WHERE id=$1',[failed.charge])).rows[0].amount,'4500000');
 }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
