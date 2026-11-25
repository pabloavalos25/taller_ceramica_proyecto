import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { recordPayment, voidPayment } from '../../src/db/payments.mjs';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('voiding a payment restores balance and preserves the audited payment', async () => {
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const root = new pg.Client({ connectionString: url });
  await root.connect();
  await root.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    for (const file of ['001_initial.sql','002_student_status_history.sql','003_financial_foundation.sql','004_payment_idempotency.sql','005_payment_void.sql']) await pool.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
    const admin = (await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('admin@example.com','hash','ADMIN') RETURNING id")).rows[0].id;
    const student = (await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('student@example.com','hash','USER') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on) VALUES ($1,'Ana','2026-11-25')", [student]);
    const charge = (await pool.query("INSERT INTO charges(student_id,category,amount_cents,description) VALUES ($1,'KILN',10000,'Pieza') RETURNING id", [student])).rows[0].id;
    const payment = await recordPayment(pool, { actorId: admin, studentId: student, idempotencyKey: randomUUID(), method: 'CASH', allocations: [{ chargeId: charge, amount: 10000n }] });
    await assert.rejects(voidPayment(pool, { actorId: student, paymentId: payment.id, reason: 'Error' }), /autoriz/i);
    await assert.rejects(voidPayment(pool, { actorId: admin, paymentId: payment.id, reason: ' ' }), /motivo/i);
    await pool.query(`CREATE FUNCTION fail_void() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type = 'VOIDED' THEN RAISE EXCEPTION 'forced failure'; END IF; RETURN NEW; END $$`);
    await pool.query('CREATE TRIGGER force_void_failure BEFORE INSERT ON payment_events FOR EACH ROW EXECUTE FUNCTION fail_void()');
    await assert.rejects(voidPayment(pool, { actorId: admin, paymentId: payment.id, reason: 'Error' }), /forced failure/);
    await assert.rejects(recordPayment(pool, { actorId: admin, studentId: student, idempotencyKey: randomUUID(), method: 'CASH', allocations: [{ chargeId: charge, amount: 1n }] }), /Asignación inválida/);
    await pool.query('DROP TRIGGER force_void_failure ON payment_events');
    const request = { actorId: admin, paymentId: payment.id, reason: 'Pago registrado por error' };
    const results = await Promise.all([voidPayment(pool, request), voidPayment(pool, request)]);
    assert.deepEqual(results.map((r) => r.replayed).sort(), [false, true]);
    await assert.rejects(voidPayment(pool, { ...request, reason: 'Otro motivo' }), /anulado/i);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM payments')).rows[0].count, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM payment_allocations')).rows[0].count, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM payment_events WHERE event_type='VOIDED'")).rows[0].count, 1);
    const again = await recordPayment(pool, { actorId: admin, studentId: student, idempotencyKey: randomUUID(), method: 'TRANSFER', allocations: [{ chargeId: charge, amount: 10000n }] });
    assert.notEqual(again.id, payment.id);
    const concurrentRequest = { actorId: admin, studentId: student, idempotencyKey: randomUUID(), method: 'CASH', allocations: [{ chargeId: charge, amount: 10000n }] };
    const [voidResult, paymentResult] = await Promise.allSettled([voidPayment(pool, { actorId: admin, paymentId: again.id, reason: 'Corrección' }), recordPayment(pool, concurrentRequest)]);
    assert.equal(voidResult.status, 'fulfilled');
    if (paymentResult.status === 'rejected') await recordPayment(pool, concurrentRequest);
    const effective = await pool.query("SELECT COALESCE(SUM(a.amount_cents), 0)::text AS amount FROM payment_allocations a WHERE a.charge_id = $1 AND NOT EXISTS (SELECT 1 FROM payment_events e WHERE e.payment_id = a.payment_id AND e.event_type = 'VOIDED')", [charge]);
    assert.equal(effective.rows[0].amount, '10000');
  } finally {
    await pool.end();
    await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await root.end();
  }
});
