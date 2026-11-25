import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createSession } from '../../src/auth/sessions.mjs';
import { recordPayment, voidPayment } from '../../src/db/payments.mjs';
import { createAuthHandlers } from '../../src/auth/http-handlers.mjs';
import { adjustFee, listAdjustableFees } from '../../src/fees/adjust-fee.mjs';
const url=process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('fee adjustment is audited, idempotent and cannot fall below payments', async () => {
  const schema=`suyai_test_${randomUUID().replaceAll('-','')}`;
  const root=new pg.Client({connectionString:url}); await root.connect(); await root.query(`CREATE SCHEMA "${schema}"`);
  const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
  try {
    for(const file of ['001_initial.sql','003_financial_foundation.sql','004_payment_idempotency.sql','005_payment_void.sql','006_auth_sessions.sql','015_fee_adjustments.sql','024_fee_tier_schedules.sql']) await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
    await pool.query('DELETE FROM fee_tier_rules');await pool.query('DELETE FROM fee_tier_schedules');
  const admin=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('admin@example.com','hash','ADMIN',false) RETURNING id")).rows[0].id;
    const student=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('ana@example.com','hash','USER') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on) VALUES ($1,'Ana','2026-11-25')",[student]);
    const fee=(await pool.query("INSERT INTO monthly_fees(student_id,period_year,period_month,original_cents,due_date) VALUES ($1,2026,11,10000,'2026-11-10') RETURNING id",[student])).rows[0].id;
    const charge=(await pool.query("INSERT INTO charges(student_id,category,monthly_fee_id,amount_cents,description) VALUES ($1,'FEE',$2,10000,'Cuota') RETURNING id",[student,fee])).rows[0].id;
    const token=await createSession(pool,admin), other=await createSession(pool,student);
    // Pago parcial histórico, registrado antes de exigir el pago completo de cuotas.
    const historical=(await pool.query("INSERT INTO payments(student_id,amount_cents,method,recorded_by) VALUES ($1,4000,'CASH',$2) RETURNING id",[student,admin])).rows[0].id;
    await pool.query('INSERT INTO payment_allocations(payment_id,charge_id,student_id,amount_cents) VALUES ($1,$2,$3,4000)',[historical,charge,student]);
    await pool.query("INSERT INTO payment_events(payment_id,actor_id,event_type) VALUES ($1,$2,'CREATED')",[historical,admin]);
    await assert.rejects(listAdjustableFees(pool,{actorToken:other,search:'Ana'}),/autoriz/i);
    const listed=await listAdjustableFees(pool,{actorToken:token,search:'Ana'});
    assert.deepEqual(listed.items.map(({id,studentName,originalCents,amountCents,paidCents})=>({id,studentName,originalCents,amountCents,paidCents})),[{id:fee,studentName:'Ana',originalCents:'10000',amountCents:'10000',paidCents:'4000'}]);
    assert.equal((await listAdjustableFees(pool,{actorToken:token,search:'sin coincidencia'})).items.length,0);
    const request={actorToken:token,feeId:fee,amountCents:7000n,reason:'Beca parcial',idempotencyKey:randomUUID()};
    await assert.rejects(adjustFee(pool,{...request,actorToken:other}),/autoriz/i);
    await assert.rejects(adjustFee(pool,{...request,amountCents:3000n,idempotencyKey:randomUUID()}),/abonado/i);
    await assert.rejects(adjustFee(pool,{...request,reason:' ',idempotencyKey:randomUUID()}),/motivo/i);
    const first=await adjustFee(pool,request); assert.equal(first.replayed,false);
    const replay=await adjustFee(pool,request); assert.equal(replay.id,first.id); assert.equal(replay.replayed,true);
    await assert.rejects(adjustFee(pool,{...request,amountCents:8000n}),/idempotencia/i);
    const original=(await pool.query('SELECT original_cents::text FROM monthly_fees WHERE id=$1',[fee])).rows[0];
    assert.equal(original.original_cents,'10000');
    const state=(await pool.query('SELECT amount_cents::text FROM charges WHERE id=$1',[charge])).rows[0]; assert.equal(state.amount_cents,'7000');
    const event=(await pool.query('SELECT previous_cents::text,new_cents::text,reason,actor_id FROM fee_adjustments')).rows;
    assert.deepEqual(event,[{previous_cents:'10000',new_cents:'7000',reason:'Beca parcial',actor_id:admin}]);
    await pool.query('UPDATE users SET must_change_password=true WHERE id=$1',[admin]);
    await assert.rejects(adjustFee(pool,{...request,amountCents:6000n,idempotencyKey:randomUUID()}),/autoriz/i);
    await pool.query('UPDATE users SET must_change_password=false WHERE id=$1',[admin]);
    const concurrentFee=(await pool.query("INSERT INTO monthly_fees(student_id,period_year,period_month,original_cents,due_date) VALUES ($1,2026,12,10000,'2026-12-10') RETURNING id",[student])).rows[0].id;
    const concurrentCharge=(await pool.query("INSERT INTO charges(student_id,category,monthly_fee_id,amount_cents,description) VALUES ($1,'FEE',$2,10000,'Cuota') RETURNING id",[student,concurrentFee])).rows[0].id;
    const outcomes=await Promise.allSettled([
      adjustFee(pool,{actorToken:token,feeId:concurrentFee,amountCents:5000n,reason:'Descuento',idempotencyKey:randomUUID()}),
      recordPayment(pool,{actorId:admin,studentId:student,idempotencyKey:randomUUID(),method:'CASH',allocations:[{chargeId:concurrentCharge,amount:10000n}]})
    ]);
    assert.equal(outcomes.filter((item)=>item.status==='fulfilled').length,1);
    assert.equal(outcomes.filter((item)=>item.status==='rejected').length,1);
    const balance=(await pool.query('SELECT c.amount_cents::bigint AS amount, COALESCE(SUM(a.amount_cents),0)::text AS paid FROM charges c LEFT JOIN payment_allocations a ON a.charge_id=c.id WHERE c.id=$1 GROUP BY c.id',[concurrentCharge])).rows[0];
    assert.ok(BigInt(balance.paid)<=BigInt(balance.amount));
    const waivedFee=(await pool.query("INSERT INTO monthly_fees(student_id,period_year,period_month,original_cents,due_date) VALUES ($1,2027,1,9000,'2027-01-10') RETURNING id",[student])).rows[0].id;
    const waivedCharge=(await pool.query("INSERT INTO charges(student_id,category,monthly_fee_id,amount_cents,description) VALUES ($1,'FEE',$2,9000,'Cuota') RETURNING id",[student,waivedFee])).rows[0].id;
    const invalidPayment=await recordPayment(pool,{actorId:admin,studentId:student,idempotencyKey:randomUUID(),method:'CASH',allocations:[{chargeId:waivedCharge,amount:9000n}]});
    await voidPayment(pool,{actorId:admin,paymentId:invalidPayment.id,reason:'Pago erróneo'});
    await adjustFee(pool,{actorToken:token,feeId:waivedFee,amountCents:0n,reason:'Bonificación completa',idempotencyKey:randomUUID()});
    assert.equal((await pool.query('SELECT amount_cents::text FROM charges WHERE id=$1',[waivedCharge])).rows[0].amount_cents,'0');
    const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,adjustFee:(data)=>adjustFee(pool,data),listAdjustableFees:(data)=>listAdjustableFees(pool,data)});
    const getList=(cookie)=>new Request('https://suyai.example/api?search=Ana',{headers:{cookie:`__Host-suyai_session=${cookie}`}});
    assert.equal((await handlers.listAdjustableFees(getList(other))).status,403);
    const listing=await handlers.listAdjustableFees(getList(token)); assert.equal(listing.status,200); assert.ok((await listing.json()).items.some(item=>item.id===fee));
    const body=JSON.stringify({feeId:fee,amountCents:'6500',reason:'Ajuste revisado',idempotencyKey:randomUUID()});
    const requestHttp=(cookie)=>new Request('https://suyai.example/api',{method:'POST',headers:{origin:'https://suyai.example','content-type':'application/json',cookie:`__Host-suyai_session=${cookie}`},body});
    assert.equal((await handlers.adjustFee(requestHttp(other))).status,403);
    assert.equal((await handlers.adjustFee(requestHttp(token))).status,200);
    await pool.query(`CREATE FUNCTION fail_adjustment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced failure'; END $$`);
    await pool.query('CREATE TRIGGER fail_adjustment BEFORE INSERT ON fee_adjustments FOR EACH ROW EXECUTE FUNCTION fail_adjustment()');
    await assert.rejects(adjustFee(pool,{...request,amountCents:6000n,idempotencyKey:randomUUID()}),/forced failure/);
    assert.equal((await pool.query('SELECT amount_cents::text FROM charges WHERE id=$1',[charge])).rows[0].amount_cents,'6500');
  } finally { await pool.end(); await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await root.end(); }
});
