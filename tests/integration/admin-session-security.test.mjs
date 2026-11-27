import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { authenticate } from '../../src/auth/login.mjs';
import { hashPassword } from '../../src/auth/passwords.mjs';
import { getSession } from '../../src/auth/sessions.mjs';
import { createSession } from '../../src/auth/sessions.mjs';
import { deactivateTeacher } from '../../src/auth/admin-management.mjs';

const url=process.env.TEST_DATABASE_URL;
if(!url)throw new Error('TEST_DATABASE_URL debe apuntar a base aislada');
test('administrative identity and disabled accounts fail closed',async()=>{
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url}); await root.connect(); await root.query(`CREATE SCHEMA "${schema}"`);
 const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
 try {
  for(const file of ['001_initial.sql','006_auth_sessions.sql','007_login_throttle.sql','025_admin_profiles.sql']) await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
  const pw='UnaContraseñaSegura_123!';
  const id=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('a@example.test',$1,'ADMIN',false) RETURNING id",[await hashPassword(pw)])).rows[0].id;
  assert.equal(await authenticate(pool,{email:'a@example.test',password:pw,source:null}),null);
  await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Abril','PRINCIPAL')",[id]);
  const token=await authenticate(pool,{email:'a@example.test',password:pw,source:null});
  const session=await getSession(pool,token);
  assert.equal(session.displayName,'Abril'); assert.equal(session.accessLevel,'PRINCIPAL');
  await pool.query('UPDATE admin_profiles SET active=false WHERE user_id=$1',[id]);
  assert.equal(await getSession(pool,token),null);
  assert.equal(await authenticate(pool,{email:'a@example.test',password:pw,source:null}),null);
 } finally {await pool.end(); await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await root.end();}
});

test('deactivation and login serialize in either order without leaving active sessions',async()=>{
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url}); await root.connect(); await root.query(`CREATE SCHEMA "${schema}"`);
 const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
 let resume;
 try {
  for(const file of ['001_initial.sql','006_auth_sessions.sql','007_login_throttle.sql','025_admin_profiles.sql']) await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
  const pw='UnaContraseñaSegura_123!';
  const a=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('a@example.test','hash','ADMIN',false) RETURNING id")).rows[0].id;
  const id=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('t@example.test',$1,'ADMIN',false) RETURNING id",[await hashPassword(pw)])).rows[0].id;
  await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Abril','PRINCIPAL'),($2,'Profe','TEACHER')",[a,id]);
  const principal=await createSession(pool,a);let locked;
  const acquired=new Promise(resolve=>{locked=resolve;}),proceed=new Promise(resolve=>{resume=resolve;});
  const controlled={async connect(){const client=await pool.connect();return {async query(sql,args){const result=await client.query(sql,args);if(sql.startsWith('SELECT active FROM admin_profiles')){locked();await proceed;}return result;},release(){client.release();}};}};
  const login=authenticate(controlled,{email:'t@example.test',password:pw,source:null});await acquired;
  const deactivation=deactivateTeacher(pool,{actorToken:principal,teacherId:id});
  resume();const token=await login;await deactivation;
  assert.equal(await getSession(pool,token),null);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',[id])).rows[0].n,0);
  assert.equal(await authenticate(pool,{email:'t@example.test',password:pw,source:null}),null);
 }finally{if(resume)resume();await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});

test('login overlapping an uncommitted deactivation cannot create a session',async()=>{
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
 const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});let resume;
 try{
  for(const file of ['001_initial.sql','006_auth_sessions.sql','007_login_throttle.sql','025_admin_profiles.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
  const pw='UnaContraseñaSegura_123!';
  const a=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('a@example.test','hash','ADMIN',false) RETURNING id")).rows[0].id;
  const id=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('t@example.test',$1,'ADMIN',false) RETURNING id",[await hashPassword(pw)])).rows[0].id;
  await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Abril','PRINCIPAL'),($2,'Profe','TEACHER')",[a,id]);
  const principal=await createSession(pool,a);let locked,loginRead;
  const updated=new Promise(resolve=>{locked=resolve;}),read=new Promise(resolve=>{loginRead=resolve;}),proceed=new Promise(resolve=>{resume=resolve;});
  const wrapped=(pauseUpdate)=>({async connect(){const client=await pool.connect();return {async query(sql,args){const result=await client.query(sql,args);if(pauseUpdate&&sql.startsWith('UPDATE admin_profiles SET active=false')){locked();await proceed;}if(!pauseUpdate&&sql.startsWith('SELECT id, password_hash, role FROM users'))loginRead();return result;},release(){client.release();}};}});
  const deactivation=deactivateTeacher(wrapped(true),{actorToken:principal,teacherId:id});await updated;
  const login=authenticate(wrapped(false),{email:'t@example.test',password:pw,source:null});await read;
  resume();await deactivation;assert.equal(await login,null);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',[id])).rows[0].n,0);
 }finally{if(resume)resume();await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
