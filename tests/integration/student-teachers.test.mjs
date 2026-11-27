import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir,readFile } from 'node:fs/promises';
import pg from 'pg';
import { createSession } from '../../src/auth/sessions.mjs';
import { createStudent } from '../../src/students/create-student.mjs';
import { listStudents } from '../../src/students/list-students.mjs';
const url=process.env.TEST_DATABASE_URL;
if(!url)throw new Error('TEST_DATABASE_URL debe apuntar a base aislada');
test('student is created with one active teacher and filtered by teacher',async()=>{
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url}); await root.connect(); await root.query(`CREATE SCHEMA "${schema}"`);
 const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
 try {
  const dir=new URL('../../db/migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(name=>name.endsWith('.sql')).sort())await pool.query(await readFile(new URL(file,dir),'utf8'));
  const a=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('a@example.test','hash','ADMIN',false) RETURNING id")).rows[0].id;
  const t=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('t@example.test','hash','ADMIN',false) RETURNING id")).rows[0].id;
  await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Abril','PRINCIPAL'),($2,'Profe','TEACHER')",[a,t]);
  const token=await createSession(pool,a), input={actorToken:token,fullName:'Alumna',email:'s@example.test',phone:'123',initialPassword:'TemporalSegura_123!',enrolledOn:'2026-11-26',active:true,weekdays:[1],feeStart:'CURRENT',branch:'GODOY_CRUZ',teacherId:t};
  const id=await createStudent(pool,input);
  assert.equal((await pool.query('SELECT teacher_id FROM student_profiles WHERE user_id=$1',[id])).rows[0].teacher_id,t);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM student_teacher_history WHERE student_id=$1 AND teacher_id=$2',[id,t])).rows[0].n,1);
  assert.equal((await listStudents(pool,{actorToken:token,teacherId:t})).items[0].id,id);
  assert.equal((await listStudents(pool,{actorToken:token,teacherId:a})).items.length,0);
  await pool.query('UPDATE admin_profiles SET active=false WHERE user_id=$1',[t]);
  await assert.rejects(createStudent(pool,{...input,email:'other@example.test'}),/profesor/i);
 }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
