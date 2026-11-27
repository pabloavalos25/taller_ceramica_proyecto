import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import pg from 'pg';
import {createSession} from '../../src/auth/sessions.mjs';
import {saveMaterialBatch} from '../../src/materials/batches.mjs';
import {saveKilnBatch} from '../../src/batches/kiln-batches.mjs';
import {saveDraft,confirmDraft} from '../../src/drafts/store.mjs';

const url=process.env.TEST_DATABASE_URL;
if(!url)throw Error('TEST_DATABASE_URL debe apuntar a una base aislada');

test('docente registra horno y materiales con precio autorizado, incluso por borrador compartido',async()=>{
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});
 await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
 const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  const dir=new URL('../../db/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort())await pool.query(await readFile(new URL(file,dir),'utf8'));
  const principal=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('principal@test.invalid','hash','ADMIN',false) RETURNING id")).rows[0].id;
  const teacher=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('teacher@test.invalid','hash','ADMIN',false) RETURNING id")).rows[0].id;
  await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Abril','PRINCIPAL'),($2,'Profe','TEACHER')",[principal,teacher]);
  const student=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('student@test.invalid','hash','USER') RETURNING id")).rows[0].id;
  await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on) VALUES ($1,'Alumna',current_date)",[student]);
  const material=(await pool.query("INSERT INTO materials(name,category,unit,price_cents) VALUES ('Arcilla','Material','KG',5000) RETURNING id")).rows[0].id;
  const token=await createSession(pool,teacher);
  const kiln={type:'KILN',date:'2026-11-26',period:'2026-11',students:[{studentId:student,items:[{name:'Taza',firingType:'BISQUE',quantity:'2',unitPrice:'100.00'}]}]};
  await saveKilnBatch(pool,{actorToken:token,idempotencyKey:randomUUID(),batch:kiln});
  const batch={type:'MATERIAL',date:'2026-11-26',period:'2026-11',students:[{studentId:student,items:[{materialId:material,name:'Arcilla',quantity:'2',unitPrice:'1.00'}]}]};
  await assert.rejects(saveMaterialBatch(pool,{actorToken:token,idempotencyKey:randomUUID(),batch}),/precio/i);
  assert.equal(Number((await pool.query('SELECT count(*) FROM material_batches')).rows[0].count),0);
  batch.students[0].items[0].unitPrice='50.00';
  const key=randomUUID();await saveMaterialBatch(pool,{actorToken:token,idempotencyKey:key,batch});
  assert.equal((await saveMaterialBatch(pool,{actorToken:token,idempotencyKey:key,batch})).replayed,true);
  await pool.query('UPDATE materials SET price_cents=7000 WHERE id=$1',[material]);
  assert.equal((await pool.query('SELECT unit_price_cents::text FROM material_batch_items')).rows[0].unit_price_cents,'5000');
  await assert.rejects(saveMaterialBatch(pool,{actorToken:token,idempotencyKey:randomUUID(),batch}),/precio/i);
  const draftId=randomUUID(),data={date:'2026-11-26',period:'2026-11',students:[{id:student,name:'Alumna',active:true,items:[{materialId:material,name:'Arcilla',quantity:'1',price:'1,00',zeroPriceReason:''}]}]};
  await saveDraft(pool,{actorToken:token,draftId,type:'MATERIAL',expectedVersion:0,idempotencyKey:randomUUID(),data});
  await assert.rejects(confirmDraft(pool,{actorToken:token,draftId,expectedVersion:1,idempotencyKey:randomUUID()}),/precio/i);
  assert.equal((await pool.query('SELECT status FROM shared_drafts WHERE id=$1',[draftId])).rows[0].status,'OPEN');
  data.students[0].items[0].price='70,00';
  await saveDraft(pool,{actorToken:token,draftId,type:'MATERIAL',expectedVersion:1,idempotencyKey:randomUUID(),data});
  await confirmDraft(pool,{actorToken:token,draftId,expectedVersion:2,idempotencyKey:randomUUID()});
  assert.deepEqual((await pool.query('SELECT unit_price_cents::text FROM material_batch_items ORDER BY unit_price_cents')).rows.map(x=>x.unit_price_cents),['5000','7000']);
  assert.equal((await pool.query('SELECT price_cents::text FROM materials WHERE id=$1',[material])).rows[0].price_cents,'7000');
 }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
