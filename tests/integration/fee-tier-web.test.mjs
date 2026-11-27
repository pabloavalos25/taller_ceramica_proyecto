import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import pg from 'pg';
import {createSession} from '../../src/auth/sessions.mjs';
import {createStudent} from '../../src/students/create-student.mjs';
import {webAuthHandlers} from '../../src/auth/web.mjs';

test('el recorrido web genera y cobra la cuota actual completa con el tramo vigente',async()=>{
 const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('TEST_DATABASE_URL debe apuntar a una base aislada');
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
 const isolated=new URL(url);isolated.searchParams.set('options',`-c search_path=${schema}`);
 const pool=new pg.Pool({connectionString:isolated.toString()});
 const prior={DATABASE_URL:process.env.DATABASE_URL,APP_ORIGIN:process.env.APP_ORIGIN,AUTH_WEB_ENABLED:process.env.AUTH_WEB_ENABLED,NODE_ENV:process.env.NODE_ENV};
 try{
  assert.equal((await pool.query('SELECT current_schema() AS schema')).rows[0].schema,schema);
  const dir=new URL('../../db/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(name=>name.endsWith('.sql')).sort())await pool.query(await readFile(new URL(file,dir),'utf8'));
  await pool.query('DELETE FROM fee_tier_rules');await pool.query('DELETE FROM fee_tier_schedules');
  const schedule=(await pool.query("INSERT INTO fee_tier_schedules(effective_period) VALUES (date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) RETURNING id")).rows[0].id;
  await pool.query('INSERT INTO fee_tier_rules(schedule_id,start_day,amount_cents) VALUES ($1,1,4500000),($1,2,5000000)',[schedule]);
  const admin=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('admin@web.invalid','hash','ADMIN',false) RETURNING id")).rows[0].id; await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Principal','PRINCIPAL')",[admin]);
  const adminToken=await createSession(pool,admin);
  const today=(await pool.query("SELECT to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD') AS day")).rows[0].day;
  const student=await createStudent(pool,{actorToken:adminToken,fullName:'Alumna de prueba',email:'student@web.invalid',phone:'123456',initialPassword:'ClaveTemporal2026!',enrolledOn:today,active:true,weekdays:[1],feeStart:'CURRENT',branch:'GODOY_CRUZ',teacherId:admin});
  await pool.query('UPDATE users SET must_change_password=false WHERE id=$1',[student]);const studentToken=await createSession(pool,student);
  process.env.DATABASE_URL=isolated.toString();process.env.APP_ORIGIN='http://localhost:3111';process.env.AUTH_WEB_ENABLED='true';process.env.NODE_ENV='test';
  const handlers=webAuthHandlers(),adminCookie=`suyai_session=${adminToken}`,studentCookie=`suyai_session=${studentToken}`;
  const list=await handlers.listStudents(new Request('http://localhost:3111/api/admin/students',{headers:{cookie:adminCookie}}));assert.equal(list.status,200);
  const listBody=await list.json(),expected=Number(today.slice(8,10))===1?'4500000':'5000000';assert.equal(listBody.items[0].balanceCents,expected);
  const payable=await handlers.payableCharges(new Request(`http://localhost:3111/api/admin/payments?studentId=${student}`,{headers:{cookie:adminCookie}}));assert.equal(payable.status,200);const charge=(await payable.json()).items[0];assert.equal(charge.outstandingCents,expected);
  const request=amount=>new Request('http://localhost:3111/api/admin/payments',{method:'POST',headers:{cookie:adminCookie,origin:'http://localhost:3111','content-type':'application/json'},body:JSON.stringify({studentId:student,idempotencyKey:randomUUID(),method:'CASH',allocations:[{chargeId:charge.id,amountCents:amount}]})});
  const partial=await handlers.recordPayment(request('1'));assert.equal(partial.status,409);assert.match((await partial.json()).error,/cuota.*completa/i);
  assert.equal((await handlers.recordPayment(request(expected))).status,200);
  const portal=await handlers.studentPortal(new Request('http://localhost:3111/api/student/portal',{headers:{cookie:studentCookie}}));assert.equal(portal.status,200);assert.equal((await portal.json()).summary.outstandingCents,'0');
 }finally{
  for(const [key,value] of Object.entries(prior))if(value===undefined)delete process.env[key];else process.env[key]=value;
  await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();
 }
});
