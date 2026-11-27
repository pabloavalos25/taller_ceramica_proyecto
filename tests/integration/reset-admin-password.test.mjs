import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {hashPassword,verifyPassword} from '../../src/auth/passwords.mjs';
import {createSession,getSession} from '../../src/auth/sessions.mjs';
import {resetAdminPassword} from '../../src/auth/reset-admin-password.mjs';

test('reset de administrador cambia solo esa cuenta, revoca sesiones y desbloquea su acceso',async()=>{
 const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('Se requiere una base de pruebas aislada');
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
 const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  for(const file of ['001_initial.sql','006_auth_sessions.sql','007_login_throttle.sql','008_password_change_throttle.sql','025_admin_profiles.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
  const hash=await hashPassword('ClaveAnteriorSegura123!');
  const admin=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('admin@test.invalid',$1,'ADMIN') RETURNING id",[hash])).rows[0].id; await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Principal','PRINCIPAL')",[admin]);
  await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('alumna@test.invalid',$1,'USER')",[hash]);
  const token=await createSession(pool,admin),key=createHash('sha256').update('account:admin@test.invalid').digest('hex');
  await pool.query('INSERT INTO login_throttle(bucket,failures) VALUES ($1,5)',[key]);
  await assert.rejects(resetAdminPassword(pool,{email:'alumna@test.invalid',password:'ClaveNuevaSegura456!'}),/administrador/i);
  await assert.rejects(resetAdminPassword(pool,{email:'admin@test.invalid',password:'corta'}),/contraseña/i);
  assert.notEqual(await getSession(pool,token),null);
  await resetAdminPassword(pool,{email:' ADMIN@test.invalid ',password:'ClaveNuevaSegura456!'});
  const row=(await pool.query('SELECT password_hash,must_change_password FROM users WHERE id=$1',[admin])).rows[0];
  assert.equal(await verifyPassword('ClaveNuevaSegura456!',row.password_hash),true);
  assert.equal(await verifyPassword('ClaveAnteriorSegura123!',row.password_hash),false);
  assert.equal(row.must_change_password,false);assert.equal(await getSession(pool,token),null);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM login_throttle WHERE bucket=$1',[key])).rows[0].n,0);
 }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
