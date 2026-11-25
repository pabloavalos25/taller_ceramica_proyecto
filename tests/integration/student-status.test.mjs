import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('student state changes create a timeline of actual changes', async () => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA suyai_status_contract');
    await client.query('SET LOCAL search_path TO suyai_status_contract');
    await client.query(await readFile(new URL('../../db/migrations/001_initial.sql', import.meta.url), 'utf8'));
    const id = (await client.query("INSERT INTO users (email, password_hash, role) VALUES ('a@example.com', 'hash', 'USER') RETURNING id")).rows[0].id;
    await client.query("INSERT INTO student_profiles(user_id, full_name, enrolled_on) VALUES ($1, 'Ana', '2026-11-25')", [id]);
    await client.query(await readFile(new URL('../../db/migrations/002_student_status_history.sql', import.meta.url), 'utf8'));
    await client.query('UPDATE student_profiles SET active = false WHERE user_id = $1', [id]);
    await client.query("UPDATE student_profiles SET full_name = 'Ana M' WHERE user_id = $1", [id]);
    await client.query('UPDATE student_profiles SET active = true WHERE user_id = $1', [id]);
    const result = await client.query('SELECT active FROM student_status_history WHERE student_id = $1 ORDER BY id', [id]);
    assert.deepEqual(result.rows.map((row) => row.active), [true, false, true]);
    const second = (await client.query("INSERT INTO users (email, password_hash, role) VALUES ('b@example.com', 'hash', 'USER') RETURNING id")).rows[0].id;
    await client.query("INSERT INTO student_profiles(user_id, full_name, enrolled_on, active) VALUES ($1, 'Bea', '2026-11-25', false)", [second]);
    const initial = await client.query('SELECT active FROM student_status_history WHERE student_id = $1', [second]);
    assert.deepEqual(initial.rows.map((row) => row.active), [false]);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
