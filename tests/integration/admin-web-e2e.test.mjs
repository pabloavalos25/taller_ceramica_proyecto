import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {hashPassword} from '../../src/auth/passwords.mjs';
const url=process.env.TEST_DATABASE_URL;if(!url)throw new Error('TEST_DATABASE_URL debe apuntar a base aislada');
test('isolated web login, teacher permissions, assignment and deactivation',async()=>{
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
 const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});let server;
 const base='http://127.0.0.1:3118', origin='https://suyai.test', password='EjemploSeguro_123456!';
 try{
  const dir=new URL('../../db/migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await pool.query(await readFile(new URL(file,dir),'utf8'));
  const principal=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('a@example.test',$1,'ADMIN',false) RETURNING id",[await hashPassword(password)])).rows[0].id;
  const teacher=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('t@example.test',$1,'ADMIN',false) RETURNING id",[await hashPassword(password)])).rows[0].id;
  await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Abril','PRINCIPAL'),($2,'Docente','TEACHER')",[principal,teacher]);
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3118'],{env:{...process.env,NODE_ENV:'test',AUTH_WEB_ENABLED:'true',APP_ORIGIN:origin,DATABASE_URL:url,PGOPTIONS:`-c search_path=${schema}`},stdio:'ignore'});
  let ready=false;for(let i=0;i<60;i++){try{await fetch(base);ready=true;break;}catch{await new Promise(r=>setTimeout(r,150));}}
  assert.ok(ready,'servidor local no inició');
  async function login(email){const response=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
  const a=await login('a@example.test'),t=await login('t@example.test');
  const dashboard=await fetch(`${base}/admin`,{headers:{cookie:a}});assert.equal(dashboard.status,200);assert.match(await dashboard.text(),/Te damos la bienvenida, Abril/);
  const summary=await fetch(`${base}/api/admin/summary`,{headers:{cookie:t}});assert.equal(summary.status,200);const teacherSummary=await summary.json();for(const field of ['monthlyIncome','incomeCents','outstandingCents','inconsistent'])assert.equal(Object.hasOwn(teacherSummary,field),false);
  const principalSummary=await fetch(`${base}/api/admin/summary`,{headers:{cookie:a}});assert.equal(principalSummary.status,200);const principalData=await principalSummary.json();for(const field of ['monthlyIncome','incomeCents','outstandingCents','inconsistent'])assert.equal(Object.hasOwn(principalData,field),true);
  const price=await fetch(`${base}/api/admin/fee-tiers`,{method:'POST',headers:{cookie:t,origin,'content-type':'application/json'},body:JSON.stringify({tiers:[{startDay:1,amountCents:'1000'}]})});assert.equal(price.status,403);
  const student={fullName:'Alumna',email:'s@example.test',phone:'123',initialPassword:'TemporalSegura_123!',enrolledOn:'2026-11-26',active:true,weekdays:[1],feeStart:'CURRENT',branch:'GODOY_CRUZ',teacherId:teacher};
  const created=await fetch(`${base}/api/admin/students`,{method:'POST',headers:{cookie:a,origin,'content-type':'application/json'},body:JSON.stringify(student)});assert.equal(created.status,201);const id=(await created.json()).id;
  const filtered=await fetch(`${base}/api/admin/students?teacherId=${teacher}`,{headers:{cookie:a}});assert.equal(filtered.status,200);assert.ok((await filtered.json()).items.some(item=>item.id===id));
  const material=(await pool.query("INSERT INTO materials(name,category,unit,price_cents) VALUES ('Arcilla','Material','KG',5000) RETURNING id")).rows[0].id;
  const postBatch=(path,batch)=>fetch(`${base}/api/admin/${path}`,{method:'POST',headers:{cookie:t,origin,'content-type':'application/json'},body:JSON.stringify({idempotencyKey:randomUUID(),batch})});
  const kiln={type:'KILN',date:'2026-11-26',period:'2026-11',students:[{studentId:id,items:[{name:'Taza',firingType:'BISQUE',quantity:'1',unitPrice:'100.00'}]}]};
  assert.equal((await postBatch('kiln-batches',kiln)).status,200);
  const materialBatch={type:'MATERIAL',date:'2026-11-26',period:'2026-11',students:[{studentId:id,items:[{materialId:material,name:'Arcilla',quantity:'1',unitPrice:'1.00'}]}]};
  assert.equal((await postBatch('material-batches',materialBatch)).status,409);
  assert.equal(Number((await pool.query('SELECT count(*) FROM material_batches')).rows[0].count),0);
  materialBatch.students[0].items[0].unitPrice='50.00';
  assert.equal((await postBatch('material-batches',materialBatch)).status,200);
  assert.equal((await pool.query('SELECT unit_price_cents::text FROM material_batch_items')).rows[0].unit_price_cents,'5000');
  const revoke=await fetch(`${base}/api/admin/teachers`,{method:'DELETE',headers:{cookie:a,origin,'content-type':'application/json'},body:JSON.stringify({teacherId:teacher})});assert.equal(revoke.status,200);
  assert.equal((await fetch(`${base}/api/auth/session`,{headers:{cookie:t}})).status,401);
  assert.equal((await pool.query('SELECT teacher_id FROM student_profiles WHERE user_id=$1',[id])).rows[0].teacher_id,teacher);
 }finally{if(server){server.kill();await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});}await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
