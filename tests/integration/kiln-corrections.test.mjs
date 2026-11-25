import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createSession} from '../../src/auth/sessions.mjs';
import {saveKilnBatch} from '../../src/batches/kiln-batches.mjs';
import {correctKilnItem} from '../../src/batches/kiln-corrections.mjs';
import {recordPayment,voidPayment} from '../../src/db/payments.mjs';
import {getKilnBatch} from '../../src/batches/kiln-history.mjs';
import {createAuthHandlers} from '../../src/auth/http-handlers.mjs';

const url=process.env.TEST_DATABASE_URL;
if(!url)throw Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');
test('kiln financial corrections preserve history and cannot invalidate payments',async()=>{
  const schema=`suyai_test_${randomUUID().replaceAll('-','')}`;
  const root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
  const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
  try{
    for(const file of ['001_initial.sql','003_financial_foundation.sql','004_payment_idempotency.sql','005_payment_void.sql','006_auth_sessions.sql','016_kiln_batches.sql','017_kiln_corrections.sql','015_fee_adjustments.sql','024_fee_tier_schedules.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
    await pool.query('DELETE FROM fee_tier_rules');await pool.query('DELETE FROM fee_tier_schedules');
  const admin=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('admin@example.com','hash','ADMIN',false) RETURNING id")).rows[0].id;
    const student=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('ana@example.com','hash','USER') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on) VALUES ($1,'Ana','2026-01-01')",[student]);
    const token=await createSession(pool,admin),other=await createSession(pool,student);
    const saved=await saveKilnBatch(pool,{actorToken:token,idempotencyKey:randomUUID(),batch:{type:'KILN',date:'2026-11-25',period:'2026-11',students:[{studentId:student,items:[{name:'Taza',firingType:'BISQUE',quantity:'1',unitPrice:'100.00'}]}]}});
    const item=(await pool.query('SELECT id,charge_id FROM kiln_batch_items')).rows[0];
    const payment=await recordPayment(pool,{actorId:admin,studentId:student,idempotencyKey:randomUUID(),method:'CASH',allocations:[{chargeId:item.charge_id,amount:4000n}]});
    const req={actorToken:token,itemId:item.id,action:'ADJUST',amountCents:7000n,reason:'Corrección',idempotencyKey:randomUUID()};
    await assert.rejects(correctKilnItem(pool,{...req,actorToken:other}),/autoriz/i);
    await assert.rejects(correctKilnItem(pool,{...req,amountCents:3000n,idempotencyKey:randomUUID()}),/abonado/i);
    await assert.rejects(correctKilnItem(pool,{...req,action:'VOID',amountCents:0n,idempotencyKey:randomUUID()}),/abonado/i);
    const first=await correctKilnItem(pool,req);const replay=await correctKilnItem(pool,req);assert.equal(replay.id,first.id);assert.equal(replay.replayed,true);
    const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,correctKilnItem:input=>correctKilnItem(pool,input)});
    const request=session=>new Request('https://suyai.example/api/admin/kiln-corrections',{method:'POST',headers:{origin:'https://suyai.example','content-type':'application/json',cookie:`__Host-suyai_session=${session}`},body:JSON.stringify({itemId:item.id,action:req.action,amountCents:'7000',reason:req.reason,idempotencyKey:req.idempotencyKey})});
    assert.equal((await handlers.correctKilnItem(request(other))).status,403);
    const replayHttp=await handlers.correctKilnItem(request(token));assert.equal(replayHttp.status,200);assert.equal((await replayHttp.json()).replayed,true);
    await assert.rejects(correctKilnItem(pool,{...req,amountCents:8000n}),/idempotencia/i);
    const itemAfter=(await pool.query('SELECT subtotal_cents::text FROM kiln_batch_items WHERE id=$1',[item.id])).rows[0];assert.equal(itemAfter.subtotal_cents,'10000');
    assert.equal((await pool.query('SELECT amount_cents::text FROM charges WHERE id=$1',[item.charge_id])).rows[0].amount_cents,'7000');
    assert.equal((await pool.query('SELECT reason FROM kiln_item_corrections')).rows[0].reason,'Corrección');
    await voidPayment(pool,{actorId:admin,paymentId:payment.id,reason:'Registro erróneo'});
    await correctKilnItem(pool,{...req,action:'VOID',amountCents:0n,reason:'Pieza anulada',idempotencyKey:randomUUID()});
    await assert.rejects(correctKilnItem(pool,{...req,amountCents:8000n,idempotencyKey:randomUUID()}),/anulad/i);
    assert.equal((await pool.query('SELECT amount_cents::text FROM charges WHERE id=$1',[item.charge_id])).rows[0].amount_cents,'0');
    const history=(await getKilnBatch(pool,{actorToken:token,batchId:saved.id})).students[0].items[0];
    assert.equal(history.voided,true);assert.equal(history.corrections.length,2);assert.equal(history.corrections[0].reason,'Corrección');
    await saveKilnBatch(pool,{actorToken:token,idempotencyKey:randomUUID(),batch:{type:'KILN',date:'2026-11-25',period:'2026-11',students:[{studentId:student,items:[{name:'Plato',firingType:'GLAZE',quantity:'1',unitPrice:'100.00'}]}]}});
    const second=(await pool.query("SELECT id,charge_id FROM kiln_batch_items WHERE name='Plato'")).rows[0];
    const outcomes=await Promise.allSettled([
      correctKilnItem(pool,{...req,itemId:second.id,amountCents:5000n,idempotencyKey:randomUUID()}),
      recordPayment(pool,{actorId:admin,studentId:student,idempotencyKey:randomUUID(),method:'CASH',allocations:[{chargeId:second.charge_id,amount:8000n}]})
    ]);
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
    const balance=(await pool.query('SELECT c.amount_cents::text AS amount,COALESCE(sum(a.amount_cents),0)::text AS paid FROM charges c LEFT JOIN payment_allocations a ON a.charge_id=c.id WHERE c.id=$1 GROUP BY c.id',[second.charge_id])).rows[0];
    assert.ok(BigInt(balance.paid)<=BigInt(balance.amount));
    await pool.query("CREATE FUNCTION fail_kiln_correction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced failure'; END $$");
    await pool.query('CREATE TRIGGER fail_kiln_correction BEFORE INSERT ON kiln_item_corrections FOR EACH ROW EXECUTE FUNCTION fail_kiln_correction()');
    await assert.rejects(correctKilnItem(pool,{...req,itemId:second.id,amountCents:9000n,idempotencyKey:randomUUID()}),/forced failure/);
    assert.equal((await pool.query('SELECT amount_cents::text AS amount FROM charges WHERE id=$1',[second.charge_id])).rows[0].amount,balance.amount);
  }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
