import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('administrative profiles preserve existing users and enforce unique principal and valid teacher', async () => {
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const root = new pg.Client({ connectionString: url });
  await root.connect();
  await root.query(`CREATE SCHEMA "${schema}"`);
  const db = new pg.Client({ connectionString: url, options: `-c search_path=${schema}` });
  await db.connect();
  try {
    await db.query(await readFile(new URL('../../db/migrations/001_initial.sql', import.meta.url), 'utf8'));
    const principal = (await db.query("INSERT INTO users(email,password_hash,role) VALUES ('principal@example.test','hash','ADMIN') RETURNING id")).rows[0].id;
    const teacher = (await db.query("INSERT INTO users(email,password_hash,role) VALUES ('docente@example.test','hash','ADMIN') RETURNING id")).rows[0].id;
    const student = (await db.query("INSERT INTO users(email,password_hash,role) VALUES ('alumna@example.test','hash','USER') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on) VALUES ($1,'Alumna',current_date)", [student]);
    await db.query(await readFile(new URL('../../db/migrations/025_admin_profiles.sql', import.meta.url), 'utf8'));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 3);
    assert.equal((await db.query('SELECT teacher_id FROM student_profiles WHERE user_id=$1', [student])).rows[0].teacher_id, null);
    await db.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Abril','PRINCIPAL'),($2,'Docente','TEACHER')", [principal,teacher]);
    await db.query('UPDATE student_profiles SET teacher_id=$1 WHERE user_id=$2', [teacher,student]);
    await assert.rejects(db.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Alumna','TEACHER')", [student]), { code: '23503' });
    const other = (await db.query("INSERT INTO users(email,password_hash,role) VALUES ('otro@example.test','hash','ADMIN') RETURNING id")).rows[0].id;
    await assert.rejects(db.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Otra','PRINCIPAL')", [other]), { code: '23505' });
    await assert.rejects(db.query('UPDATE student_profiles SET teacher_id=$1 WHERE user_id=$2', [student,student]), { code: '23503' });
    await assert.rejects(db.query("UPDATE admin_profiles SET display_name='   ' WHERE user_id=$1", [teacher]), { code: '23514' });
  } finally {
    await db.end();
    await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await root.end();
  }
});

test('teacher assignment history preserves prior teacher after reassignment or deactivation', async () => {
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const root = new pg.Client({ connectionString: url });
  await root.connect();
  await root.query(`CREATE SCHEMA "${schema}"`);
  const db = new pg.Client({ connectionString: url, options: `-c search_path=${schema}` });
  await db.connect();
  try {
    for (const file of ['001_initial.sql', '025_admin_profiles.sql']) await db.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
    const a = (await db.query("INSERT INTO users(email,password_hash,role) VALUES ('abril@example.test','hash','ADMIN') RETURNING id")).rows[0].id;
    const b = (await db.query("INSERT INTO users(email,password_hash,role) VALUES ('profe@example.test','hash','ADMIN') RETURNING id")).rows[0].id;
    const s = (await db.query("INSERT INTO users(email,password_hash,role) VALUES ('estudiante@example.test','hash','USER') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on) VALUES ($1,'Alumna',current_date)", [s]);
    await db.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Abril','PRINCIPAL'),($2,'Profe','TEACHER')", [a,b]);
    await db.query('INSERT INTO student_teacher_history(student_id,teacher_id,actor_id) VALUES ($1,$2,$3),($1,$3,$3)', [s,b,a]);
    await db.query('UPDATE admin_profiles SET active=false WHERE user_id=$1', [b]);
    const records = await db.query('SELECT teacher_id FROM student_teacher_history WHERE student_id=$1', [s]);
    assert.deepEqual(new Set(records.rows.map(row => row.teacher_id)), new Set([a,b]));
    await assert.rejects(db.query('DELETE FROM admin_profiles WHERE user_id=$1', [b]), { code: '23503' });
  } finally {
    await db.end();
    await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await root.end();
  }
});
