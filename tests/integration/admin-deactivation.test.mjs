import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createSession } from '../../src/auth/sessions.mjs';
import { deactivateTeacher, createTeacher, listTeachers, provisionPrincipal } from '../../src/auth/admin-management.mjs';

const url=process.env.TEST_DATABASE_URL;
if(!url)throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');
test('principal can revoke a teacher while retaining student assignment and prior history',async()=>{
  const schema=`suyai_test_${randomUUID().replaceAll('-','')}`;
  const root=new pg.Client({connectionString:url}); await root.connect(); await root.query(`CREATE SCHEMA "${schema}"`);
  const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
  try {
    for(const file of ['001_initial.sql','006_auth_sessions.sql','025_admin_profiles.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
    const a=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('a@example.test','hash','ADMIN',false) RETURNING id")).rows[0].id;
    const t=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('t@example.test','hash','ADMIN',false) RETURNING id")).rows[0].id;
    const s=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('s@example.test','hash','USER') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Abril','PRINCIPAL'),($2,'Profe','TEACHER')",[a,t]);
    await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on,teacher_id) VALUES ($1,'Alumna',current_date,$2)",[s,t]);
    await pool.query('INSERT INTO student_teacher_history(student_id,teacher_id,actor_id) VALUES ($1,$2,$3)',[s,t,a]);
    const principalToken=await createSession(pool,a), teacherToken=await createSession(pool,t);
    await assert.rejects(deactivateTeacher(pool,{actorToken:teacherToken,teacherId:a}));
    await assert.rejects(deactivateTeacher(pool,{actorToken:principalToken,teacherId:a}));
    await deactivateTeacher(pool,{actorToken:principalToken,teacherId:t});
    assert.equal((await pool.query('SELECT active FROM admin_profiles WHERE user_id=$1',[t])).rows[0].active,false);
    assert.equal((await pool.query('SELECT teacher_id FROM student_profiles WHERE user_id=$1',[s])).rows[0].teacher_id,t);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM student_teacher_history WHERE teacher_id=$1',[t])).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',[t])).rows[0].n,0);
    const items=(await listTeachers(pool,{actorToken:principalToken})).items;
    assert.equal(items.find(item=>item.id===t).active,false);
    await assert.rejects(listTeachers(pool,{actorToken:teacherToken}));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM admin_access_events WHERE actor_id=$1 AND target_id=$2 AND event_type='DEACTIVATED'",[a,t])).rows[0].n,1);
  } finally { await pool.end(); await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await root.end(); }
});

test('principal provisioning requires the exact existing admin and never replaces another principal',async()=>{
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
 const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  for(const file of ['001_initial.sql','025_admin_profiles.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
  const a=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('a@example.test','hash','ADMIN') RETURNING id")).rows[0].id;
  await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('s@example.test','hash','USER')");
  await assert.rejects(provisionPrincipal(pool,{email:'s@example.test',displayName:'Abril'}));
  await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('other@example.test','hash','ADMIN')");
  await assert.rejects(provisionPrincipal(pool,{email:'a@example.test',displayName:'Abril'}),/otras cuentas/i);
  await pool.query("DELETE FROM users WHERE email='other@example.test'");
  assert.equal(await provisionPrincipal(pool,{email:'a@example.test',displayName:'Abril'}),a);
  assert.equal(await provisionPrincipal(pool,{email:'a@example.test',displayName:'Abril'}),a);
  await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('b@example.test','hash','ADMIN')");
  await assert.rejects(provisionPrincipal(pool,{email:'b@example.test',displayName:'Otro'}));
 }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});

test('only principal can create an administrator with a temporary password',async()=>{
  const schema=`suyai_test_${randomUUID().replaceAll('-','')}`;
  const root=new pg.Client({connectionString:url}); await root.connect(); await root.query(`CREATE SCHEMA "${schema}"`);
  const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
  try {
    for(const file of ['001_initial.sql','006_auth_sessions.sql','025_admin_profiles.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
    const a=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('a@example.test','hash','ADMIN',false) RETURNING id")).rows[0].id;
    const t=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('t@example.test','hash','ADMIN',false) RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Abril','PRINCIPAL'),($2,'Profe','TEACHER')",[a,t]);
    const principalToken=await createSession(pool,a), teacherToken=await createSession(pool,t);
    const input={email:'nuevo@example.test',displayName:'Docente',temporaryPassword:'ClaveTemporal_8264!'};
    await assert.rejects(createTeacher(pool,{actorToken:teacherToken,...input}));
    const id=await createTeacher(pool,{actorToken:principalToken,...input});
    const result=await pool.query('SELECT u.role,u.must_change_password,u.password_hash,p.display_name,p.access_level FROM users u JOIN admin_profiles p ON p.user_id=u.id WHERE u.id=$1',[id]);
    assert.equal(result.rows[0].role,'ADMIN'); assert.equal(result.rows[0].must_change_password,true);
    assert.equal(result.rows[0].access_level,'TEACHER'); assert.equal(result.rows[0].display_name,'Docente');
    assert.notEqual(result.rows[0].password_hash,input.temporaryPassword);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM admin_access_events WHERE actor_id=$1 AND target_id=$2 AND event_type='CREATED'",[a,id])).rows[0].n,1);
    await assert.rejects(createTeacher(pool,{actorToken:principalToken,...input}));
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE email='nuevo@example.test'")).rows[0].n,1);
  } finally { await pool.end(); await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await root.end(); }
});
