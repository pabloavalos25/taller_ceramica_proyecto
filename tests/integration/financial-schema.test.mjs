import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('charges and payment allocations must belong to the same student', async () => {
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query('CREATE SCHEMA suyai_financial_contract');
    await db.query('SET LOCAL search_path TO suyai_financial_contract');
    for (const file of ['001_initial.sql', '002_student_status_history.sql', '003_financial_foundation.sql']) {
      await db.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
    }
    async function user(email, role) {
      return (await db.query('INSERT INTO users(email, password_hash, role) VALUES ($1, $2, $3) RETURNING id', [email, 'test-hash', role])).rows[0].id;
    }
    const admin = await user('admin@example.com', 'ADMIN');
    const ana = await user('ana@example.com', 'USER');
    const bea = await user('bea@example.com', 'USER');
    for (const id of [ana, bea]) await db.query("INSERT INTO student_profiles(user_id, full_name, enrolled_on) VALUES ($1, 'Alumna', '2026-11-25')", [id]);
    const charge = (await db.query("INSERT INTO charges(student_id, category, amount_cents, description) VALUES ($1, 'KILN', 12500, 'Horno') RETURNING id", [ana])).rows[0].id;
    const beaCharge = (await db.query("INSERT INTO charges(student_id, category, amount_cents, description) VALUES ($1, 'KILN', 1000, 'Horno') RETURNING id", [bea])).rows[0].id;
    const payment = (await db.query("INSERT INTO payments(student_id, amount_cents, method, recorded_by) VALUES ($1, 5000, 'CASH', $2) RETURNING id", [ana, admin])).rows[0].id;
    await db.query('INSERT INTO payment_allocations(payment_id, charge_id, student_id, amount_cents) VALUES ($1, $2, $3, 5000)', [payment, charge, ana]);
    async function rejected(sql, params, code) {
      await db.query('SAVEPOINT expected_error');
      try { await db.query(sql, params); assert.fail('Expected constraint failure'); }
      catch (error) { assert.equal(error.code, code); }
      finally { await db.query('ROLLBACK TO SAVEPOINT expected_error'); }
    }
    await rejected('INSERT INTO payment_allocations(payment_id, charge_id, student_id, amount_cents) VALUES ($1, $2, $3, 100)', [payment, beaCharge, ana], '23503');
    await rejected('INSERT INTO payment_allocations(payment_id, charge_id, student_id, amount_cents) VALUES ($1, $2, $3, 100)', [payment, charge, ana], '23505');
    await rejected("INSERT INTO payments(student_id, amount_cents, method, recorded_by) VALUES ($1, 100, 'CASH', $2)", [ana, bea], '23503');
    await rejected("INSERT INTO charges(student_id, category, amount_cents, description) VALUES ($1, 'KILN', -1, 'Horno')", [ana], '23514');
    const fee = (await db.query("INSERT INTO monthly_fees(student_id, period_year, period_month, original_cents, due_date) VALUES ($1, 2026, 11, 3500000, '2026-11-30') RETURNING id", [ana])).rows[0].id;
    await db.query("INSERT INTO charges(student_id, category, monthly_fee_id, amount_cents, description) VALUES ($1, 'FEE', $2, 3500000, 'Cuota')", [ana, fee]);
    await rejected("INSERT INTO charges(student_id, category, monthly_fee_id, amount_cents, description) VALUES ($1, 'FEE', $2, 3500000, 'Cuota')", [ana, fee], '23505');
    const beaFee = (await db.query("INSERT INTO monthly_fees(student_id, period_year, period_month, original_cents, due_date) VALUES ($1, 2026, 11, 3500000, '2026-11-30') RETURNING id", [bea])).rows[0].id;
    await rejected("INSERT INTO charges(student_id, category, monthly_fee_id, amount_cents, description) VALUES ($1, 'FEE', $2, 3500000, 'Cuota')", [ana, beaFee], '23503');
    await rejected("INSERT INTO charges(student_id, category, amount_cents, description) VALUES ($1, 'FEE', 100, 'Cuota')", [ana], '23514');
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
});
