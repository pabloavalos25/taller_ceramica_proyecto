import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createSession } from '../../src/auth/sessions.mjs';
import { assignStudentTeacher, listStudentTeacherHistory } from '../../src/students/teacher-assignment.mjs';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('authorized reassignment records history and rejects inactive or unauthorized actors', async () => {
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const root = new pg.Client({ connectionString: url }); await root.connect();
  await root.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    for (const file of ['001_initial.sql','006_auth_sessions.sql','025_admin_profiles.sql']) await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
    const a=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('abril@example.test','hash','ADMIN',false) RETURNING id")).rows[0].id;
    const t=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('teacher@example.test','hash','ADMIN',false) RETURNING id")).rows[0].id;
    const s=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('student@example.test','hash','USER') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Abril','PRINCIPAL'),($2,'Profe','TEACHER')",[a,t]);
    await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on) VALUES ($1,'Alumna',current_date)",[s]);
    const principalToken=await createSession(pool,a); const teacherToken=await createSession(pool,t);
    await assignStudentTeacher(pool,{actorToken:principalToken,studentId:s,teacherId:t});
    await assignStudentTeacher(pool,{actorToken:teacherToken,studentId:s,teacherId:a});
    const result=await pool.query('SELECT teacher_id FROM student_teacher_history WHERE student_id=$1 ORDER BY assigned_at,id',[s]);
    assert.deepEqual(new Set(result.rows.map(row=>row.teacher_id)),new Set([a,t]));
    await pool.query('UPDATE admin_profiles SET active=false WHERE user_id=$1',[t]);
    await assert.rejects(assignStudentTeacher(pool,{actorToken:principalToken,studentId:s,teacherId:t}));
    await assert.rejects(assignStudentTeacher(pool,{actorToken:teacherToken,studentId:s,teacherId:t}));
    assert.equal((await pool.query('SELECT teacher_id FROM student_profiles WHERE user_id=$1',[s])).rows[0].teacher_id,a);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM student_teacher_history WHERE student_id=$1',[s])).rows[0].n,2);
    const history=await listStudentTeacherHistory(pool,{actorToken:principalToken,studentId:s});
    assert.deepEqual(history.items.map(item=>item.teacherName),['Abril','Profe']);
    assert.equal(history.items[1].teacherActive,false);
    await assert.rejects(listStudentTeacherHistory(pool,{actorToken:teacherToken,studentId:s}),/autoriz/i);
  } finally { await pool.end(); await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await root.end(); }
});
