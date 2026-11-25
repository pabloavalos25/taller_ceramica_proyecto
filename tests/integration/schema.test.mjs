import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('initial migration enforces student email and fee invariants', async () => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA suyai_test_contract');
    await client.query('SET LOCAL search_path TO suyai_test_contract');
    const migration = await readFile(new URL('../../db/migrations/001_initial.sql', import.meta.url), 'utf8');
    await client.query(migration);
    const user = await client.query("INSERT INTO users (email, password_hash, role) VALUES ('ana@example.com', 'test-hash', 'USER') RETURNING id");
    const id = user.rows[0].id;
    await client.query('INSERT INTO student_profiles (user_id, full_name, enrolled_on) VALUES ($1, $2, $3)', [id, 'Ana', '2026-11-25']);
    await client.query('INSERT INTO monthly_fees (student_id, period_year, period_month, original_cents, due_date) VALUES ($1, 2026, 11, 3500000, $2)', [id, '2026-11-30']);
    async function rejected(sql, params, code) {
      await client.query('SAVEPOINT expected_error');
      try { await client.query(sql, params); assert.fail('Expected database constraint failure'); }
      catch (error) { assert.equal(error.code, code); }
      finally { await client.query('ROLLBACK TO SAVEPOINT expected_error'); }
    }
    await rejected("INSERT INTO users (email, password_hash, role) VALUES ('ana@example.com', 'hash', 'USER')", [], '23505');
    await rejected("INSERT INTO users (email, password_hash, role) VALUES ('ANA@example.com', 'hash', 'USER')", [], '23514');
    await rejected('INSERT INTO monthly_fees (student_id, period_year, period_month, original_cents, due_date) VALUES ($1, 2026, 11, 1, $2)', [id, '2026-11-30'], '23505');
    await rejected('INSERT INTO monthly_fees (student_id, period_year, period_month, original_cents, due_date) VALUES ($1, 2026, 13, 1, $2)', [id, '2026-11-30'], '23514');
    await rejected('INSERT INTO monthly_fees (student_id, period_year, period_month, original_cents, due_date) VALUES ($1, 2026, 12, -1, $2)', [id, '2026-12-31'], '23514');
    await client.query('INSERT INTO student_attendance_days (student_id, weekday) VALUES ($1, 1)', [id]);
    await rejected('INSERT INTO student_attendance_days (student_id, weekday) VALUES ($1, 1)', [id], '23505');
    await rejected('INSERT INTO student_attendance_days (student_id, weekday) VALUES ($1, 7)', [id], '23514');
    const admin = await client.query("INSERT INTO users (email, password_hash, role) VALUES ('admin@example.com', 'test-hash', 'ADMIN') RETURNING id");
    await rejected('INSERT INTO student_profiles (user_id, full_name, enrolled_on) VALUES ($1, $2, $3)', [admin.rows[0].id, 'Admin', '2026-11-25'], '23503');
    await rejected('INSERT INTO monthly_fees (student_id, period_year, period_month, original_cents, due_date) VALUES ($1, 2026, 12, 1, $2)', [admin.rows[0].id, '2026-12-31'], '23503');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
