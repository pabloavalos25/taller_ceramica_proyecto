import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createSession} from '../../src/auth/sessions.mjs';
import {saveKilnBatch} from '../../src/batches/kiln-batches.mjs';
import {listKilnBatches,getKilnBatch} from '../../src/batches/kiln-history.mjs';
import {recordPayment,voidPayment} from '../../src/db/payments.mjs';
import {createAuthHandlers} from '../../src/auth/http-handlers.mjs';

const url=process.env.TEST_DATABASE_URL;
if(!url) throw Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');
test('saves all kiln charges atomically, authorizes and prevents duplicate retries',async()=>{
  const schema=`suyai_test_${randomUUID().replaceAll('-','')}`;
  const root=new pg.Client({connectionString:url}); await root.connect(); await root.query(`CREATE SCHEMA "${schema}"`);
  const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
  try {
    for(const file of ['001_initial.sql','003_financial_foundation.sql','004_payment_idempotency.sql','005_payment_void.sql','006_auth_sessions.sql','016_kiln_batches.sql','017_kiln_corrections.sql','015_fee_adjustments.sql','024_fee_tier_schedules.sql']) await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
    await pool.query('DELETE FROM fee_tier_rules');await pool.query('DELETE FROM fee_tier_schedules');
  const admin=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('admin@example.com','hash','ADMIN',false) RETURNING id")).rows[0].id;
    const alice=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('ana@example.com','hash','USER') RETURNING id")).rows[0].id;
    const bea=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('bea@example.com','hash','USER') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on,active) VALUES ($1,'Ana','2026-01-01',true),($2,'Bea','2026-01-01',false)",[alice,bea]);
    const token=await createSession(pool,admin), studentToken=await createSession(pool,alice);
    const batch={type:'KILN',date:'2026-11-25',period:'2026-11',reference:'H1',notes:'Prueba',students:[
      {studentId:alice,items:[{name:'Taza',firingType:'BISQUE',quantity:'1',unitPrice:'3500.00'},{name:'Plato',firingType:'GLAZE',quantity:'2',unitPrice:'2500.00'}]},
      {studentId:bea,confirmInactive:true,items:[{name:'Maceta',firingType:'GLAZE',quantity:'1',unitPrice:'6000.00'}]},
    ]};
    const req={actorToken:token,idempotencyKey:randomUUID(),batch};
    await assert.rejects(saveKilnBatch(pool,{...req,actorToken:studentToken}),/autoriz/i);
    const noConfirm=structuredClone(batch); noConfirm.students[1].confirmInactive=false;
    await assert.rejects(saveKilnBatch(pool,{...req,batch:noConfirm}),/inactiva/i);
    assert.equal(Number((await pool.query('SELECT count(*) FROM charges')).rows[0].count),0);
    const [a,b]=await Promise.all([saveKilnBatch(pool,req),saveKilnBatch(pool,req)]);
    assert.equal(a.id,b.id); assert.equal([a,b].filter(x=>x.replayed).length,1);
    const charges=await pool.query('SELECT student_id,amount_cents::text AS amount FROM charges ORDER BY amount_cents');
    assert.deepEqual(charges.rows.map(x=>x.amount),['350000','500000','600000']);
    assert.equal(charges.rows.filter(x=>x.student_id===alice).length,2);
    await assert.rejects(listKilnBatches(pool,{actorToken:studentToken}),/autoriz/i);
    await assert.rejects(getKilnBatch(pool,{actorToken:studentToken,batchId:a.id}),/autoriz/i);
    const initialHistory=await listKilnBatches(pool,{actorToken:token,period:'2026-11'});
    assert.equal(initialHistory.items.length,1); assert.equal(initialHistory.items[0].totalCents,'1450000'); assert.equal(initialHistory.items[0].paidCents,'0'); assert.equal(initialHistory.items[0].records,3);
    assert.equal((await listKilnBatches(pool,{actorToken:token,period:'2026-12'})).items.length,0);
    const detail=await getKilnBatch(pool,{actorToken:token,batchId:a.id});
    assert.equal(detail.students.length,2); assert.equal(detail.students.find(x=>x.id===alice).items.length,2);
    const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,listKilnBatches:input=>listKilnBatches(pool,input),getKilnBatch:input=>getKilnBatch(pool,input)});
    const historyRequest=(session,query)=>new Request(`https://suyai.example/api?${query}`,{headers:{cookie:`__Host-suyai_session=${session}`}});
    assert.equal((await handlers.kilnHistory(historyRequest(studentToken,''))).status,403);
    const response=await handlers.kilnHistory(historyRequest(token,`batchId=${a.id}`)); assert.equal(response.status,200); assert.equal((await response.json()).students.length,2);
    const chargeId=(await pool.query('SELECT charge_id FROM kiln_batch_items WHERE student_id=$1 LIMIT 1',[alice])).rows[0].charge_id;
    const payment=await recordPayment(pool,{actorId:admin,studentId:alice,idempotencyKey:randomUUID(),method:'CASH',allocations:[{chargeId,amount:100000n}]});
    assert.equal((await listKilnBatches(pool,{actorToken:token})).items[0].paidCents,'100000');
    await voidPayment(pool,{actorId:admin,paymentId:payment.id,reason:'Pago incorrecto'});
    assert.equal((await listKilnBatches(pool,{actorToken:token})).items[0].paidCents,'0');
    assert.equal(await getKilnBatch(pool,{actorToken:token,batchId:randomUUID()}),null);
    assert.equal(Number((await pool.query('SELECT count(*) FROM kiln_batch_items')).rows[0].count),3);
    const existing=(await pool.query('SELECT id FROM kiln_batch_items LIMIT 1')).rows[0].id;
    await assert.rejects(pool.query('UPDATE kiln_batch_items SET unit_price_cents=0,subtotal_cents=0,zero_price_reason=NULL WHERE id=$1',[existing]));
    await assert.rejects(saveKilnBatch(pool,{...req,batch:{...batch,reference:'otra'}}),/idempotencia/i);
    await pool.query("CREATE FUNCTION fail_kiln_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name='Plato' THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END $$");
    await pool.query('CREATE TRIGGER fail_kiln_item BEFORE INSERT ON kiln_batch_items FOR EACH ROW EXECUTE FUNCTION fail_kiln_item()');
    await assert.rejects(saveKilnBatch(pool,{...req,idempotencyKey:randomUUID()}),/forced failure/);
    assert.equal(Number((await pool.query('SELECT count(*) FROM kiln_batches')).rows[0].count),1);
    assert.equal(Number((await pool.query('SELECT count(*) FROM charges')).rows[0].count),3);
  } finally {await pool.end(); await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await root.end();}
});
