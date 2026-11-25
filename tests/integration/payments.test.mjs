import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { recordPayment } from '../../src/db/payments.mjs';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('payments are atomic, idempotent and prevent concurrent overpayment', async () => {
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const root = new pg.Client({ connectionString: url });
  await root.connect();
  await root.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    for (const file of ['001_initial.sql', '002_student_status_history.sql', '003_financial_foundation.sql', '004_payment_idempotency.sql']) {
      await pool.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
    }
    const admin = (await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('admin@example.com','hash','ADMIN') RETURNING id")).rows[0].id;
    const student = (await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('student@example.com','hash','USER') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on) VALUES ($1,'Ana','2026-11-25')", [student]);
    const charge = (await pool.query("INSERT INTO charges(student_id,category,amount_cents,description) VALUES ($1,'KILN',10000,'Pieza') RETURNING id", [student])).rows[0].id;
    const request = { actorId: admin, studentId: student, idempotencyKey: randomUUID(), method: 'CASH', allocations: [{ chargeId: charge, amount: 4000n }] };
    const [first, replay] = await Promise.all([recordPayment(pool, request), recordPayment(pool, request)]);
    assert.equal(replay.id, first.id);
    assert.deepEqual([first.replayed, replay.replayed].sort(), [false, true]);
    assert.equal((await recordPayment(pool, request)).id, first.id);
    await assert.rejects(recordPayment(pool, { ...request, allocations: [{ chargeId: charge, amount: 5000n }] }), /idempotencia/i);
    await assert.rejects(recordPayment(pool, { ...request, actorId: student, idempotencyKey: randomUUID() }), /autoriz/i);
    const attempt = () => recordPayment(pool, { ...request, idempotencyKey: randomUUID(), allocations: [{ chargeId: charge, amount: 4000n }] });
    const results = await Promise.allSettled([attempt(), attempt()]);
    assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(results.filter((x) => x.status === 'rejected').length, 1);
    assert.equal((await pool.query('SELECT sum(amount_cents)::text AS sum FROM payment_allocations WHERE charge_id=$1', [charge])).rows[0].sum, '8000');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM payments')).rows[0].count, 2);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM payment_events')).rows[0].count, 2);
    await assert.rejects(recordPayment(pool, { ...request, idempotencyKey: randomUUID(), allocations: [{ chargeId: charge, amount: 2001n }] }), /Asignación inválida/);
    const secondCharge = (await pool.query("INSERT INTO charges(student_id,category,amount_cents,description) VALUES ($1,'MATERIAL',1000,'Material') RETURNING id", [student])).rows[0].id;
    await assert.rejects(recordPayment(pool, { ...request, idempotencyKey: randomUUID(), allocations: [{ chargeId: secondCharge, amount: 1000n }, { chargeId: charge, amount: 2001n }] }), /Asignación inválida/);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM payment_allocations WHERE charge_id=$1', [secondCharge])).rows[0].count, 0);
    await assert.rejects(recordPayment(pool, { ...request, idempotencyKey: randomUUID(), allocations: [{ chargeId: charge, amount: 1n }, { chargeId: charge, amount: 1n }] }), /duplicado/);
    await pool.query(`CREATE FUNCTION fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced failure'; END $$`);
    await pool.query('CREATE TRIGGER force_event_failure BEFORE INSERT ON payment_events FOR EACH ROW EXECUTE FUNCTION fail_event()');
    await assert.rejects(recordPayment(pool, { ...request, idempotencyKey: randomUUID(), allocations: [{ chargeId: charge, amount: 2000n }] }), /forced failure/);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM payments')).rows[0].count, 2);
    assert.equal((await pool.query('SELECT sum(amount_cents)::text AS sum FROM payment_allocations WHERE charge_id=$1', [charge])).rows[0].sum, '8000');
  } finally {
    await pool.end();
    await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await root.end();
  }
});
