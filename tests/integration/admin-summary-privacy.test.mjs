import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir,readFile } from 'node:fs/promises';
import pg from 'pg';
import { createSession } from '../../src/auth/sessions.mjs';
import { getAdminSummary } from '../../src/students/admin-summary.mjs';
const url=process.env.TEST_DATABASE_URL;
if(!url)throw new Error('TEST_DATABASE_URL debe apuntar a base aislada');
test('income graph data is provided only to principal and inactive profiles are refused',async()=>{
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url}); await root.connect(); await root.query(`CREATE SCHEMA "${schema}"`);
 const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
 try {
  const dir=new URL('../../db/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(name=>name.endsWith('.sql')).sort())await pool.query(await readFile(new URL(file,dir),'utf8'));
  const a=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('a@example.test','hash','ADMIN',false) RETURNING id")).rows[0].id;
  const t=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('t@example.test','hash','ADMIN',false) RETURNING id")).rows[0].id;
  await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Abril','PRINCIPAL'),($2,'Profe','TEACHER')",[a,t]);
  const p=await getAdminSummary(pool,{actorToken:await createSession(pool,a)});
  const token=await createSession(pool,t); const q=await getAdminSummary(pool,{actorToken:token});
  assert.equal(p.monthlyIncome.length,6);
  assert.equal(Object.hasOwn(p,'incomeCents'),true);
  assert.equal(Object.hasOwn(p,'outstandingCents'),true);
  assert.equal(Object.hasOwn(p,'inconsistent'),true);
  assert.equal(Object.hasOwn(q,'monthlyIncome'),false);
  assert.equal(Object.hasOwn(q,'incomeCents'),false);
  assert.equal(Object.hasOwn(q,'outstandingCents'),false);
  assert.equal(Object.hasOwn(q,'inconsistent'),false);
  assert.deepEqual(q.recentPayments,[]);
  await pool.query('UPDATE admin_profiles SET active=false WHERE user_id=$1',[t]);
  await assert.rejects(getAdminSummary(pool,{actorToken:token}),/autoriz/i);
 }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
