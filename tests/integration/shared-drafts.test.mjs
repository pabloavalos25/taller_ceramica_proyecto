import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import pg from 'pg';
import {createSession} from '../../src/auth/sessions.mjs';import {saveDraft,getDraft,listDrafts} from '../../src/drafts/store.mjs';
import {prepareTransfer,finishTransfer} from '../../src/drafts/device-privacy.mjs';
test('comparte borradores incompletos sin generar cargos ni sobrescribir otra edición',async()=>{
 const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('TEST_DATABASE_URL requiere una base de pruebas aislada');const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  for(const file of ['001_initial.sql','003_financial_foundation.sql','006_auth_sessions.sql','021_shared_drafts.sql','022_draft_confirmation.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
  const users=[];for(const [email,role] of [['a@test.invalid','ADMIN'],['b@test.invalid','ADMIN'],['user@test.invalid','USER']])users.push((await pool.query('INSERT INTO users(email,password_hash,role,must_change_password) VALUES ($1,\'hash\',$2,false) RETURNING id',[email,role])).rows[0].id);
  const [admin,other,user]=await Promise.all(users.map(id=>createSession(pool,id)));const draftId=randomUUID(),key=randomUUID();const input={actorToken:admin,draftId,type:'MATERIAL',expectedVersion:0,idempotencyKey:key,data:{date:'',period:'',students:[]}};
  await assert.rejects(saveDraft(pool,{...input,actorToken:user}),/autoriz/i);const saved=await saveDraft(pool,input);assert.equal(saved.version,1);assert.equal((await saveDraft(pool,input)).replayed,true);
  await assert.rejects(saveDraft(pool,{...input,data:{date:'otra'}}),/clave/i);
  await assert.rejects(getDraft(pool,{actorToken:user,draftId}),/autoriz/i);
  await assert.rejects(saveDraft(pool,{...input,idempotencyKey:randomUUID(),data:{text:'x'.repeat(1048577)}}),/extenso/i);
  const read=await getDraft(pool,{actorToken:other,draftId});assert.equal(read.version,1);assert.deepEqual(read.data,input.data);assert.equal((await listDrafts(pool,{actorToken:other,type:'MATERIAL'})).items.length,1);
  const values=new Map([['suyai-kiln-draft-v1',JSON.stringify({date:'2026-11-25',period:'',reference:'',notes:'',students:[{name:'Alumna ficticia'}]})]]);
  const storage={get length(){return values.size},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const transfer=prepareTransfer(storage,storage,'KILN',randomUUID);
  const transferred=await saveDraft(pool,{...transfer,actorToken:admin});
  assert.equal((await saveDraft(pool,{...transfer,actorToken:admin})).replayed,true);
  assert.deepEqual((await getDraft(pool,{actorToken:admin,draftId:transferred.id})).data,transfer.data);
  assert.equal(finishTransfer(storage,'KILN',transfer),true);
  assert.equal(storage.getItem('suyai-kiln-draft-v1'),null);
  const a={...input,actorToken:admin,expectedVersion:1,idempotencyKey:randomUUID(),data:{date:'2026-11-25',period:'',students:[]}};const b={...a,actorToken:other,idempotencyKey:randomUUID(),data:{date:'2026-11-26',period:'',students:[]}};const result=await Promise.allSettled([saveDraft(pool,a),saveDraft(pool,b)]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.filter(x=>x.status==='rejected').length,1);
  assert.equal((await getDraft(pool,{actorToken:admin,draftId})).version,2);
  assert.equal((await listDrafts(pool,{actorToken:admin,type:'KILN'})).items.length,1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM charges')).rows[0].n,0);
 }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
