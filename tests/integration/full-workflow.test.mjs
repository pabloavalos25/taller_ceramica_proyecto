import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { createSession } from '../../src/auth/sessions.mjs';
import { authenticate } from '../../src/auth/login.mjs';
import { changePassword } from '../../src/auth/change-password.mjs';
import { createStudent } from '../../src/students/create-student.mjs';
import { setFeePrice } from '../../src/fees/prices.mjs';
import { initializeDueDay } from '../../src/fees/due-settings.mjs';
import { generatePeriod } from '../../src/fees/generate.mjs';
import { saveKilnBatch } from '../../src/batches/kiln-batches.mjs';
import { saveMaterial } from '../../src/materials/catalog.mjs';
import { saveMaterialBatch } from '../../src/materials/batches.mjs';
import { recordAuthorizedPayment } from '../../src/payments/web.mjs';
import { getStudentPortal } from '../../src/students/portal.mjs';

test('recorrido integral: alta, cuota, consumos, pago y cuenta de alumna', async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const root = new pg.Client({ connectionString: url });
  await root.connect();
  await root.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    const migrations = new URL('../../db/migrations/', import.meta.url);
    for (const file of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
      await pool.query(await readFile(new URL(file, migrations), 'utf8'));
    }
    await pool.query('DELETE FROM fee_tier_rules');await pool.query('DELETE FROM fee_tier_schedules');
  const admin = (await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('admin@test.invalid','hash','ADMIN',false) RETURNING id")).rows[0].id;
    const actorToken = await createSession(pool, admin);
    const { period, today } = (await pool.query("SELECT to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM') AS period, to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD') AS today")).rows[0];
    const initialPassword = 'ClaveTemporal2026!';
    const studentId = await createStudent(pool, { actorToken, fullName:'Lucia Prueba', email:'lucia@test.invalid', phone:'123456', initialPassword, enrolledOn:today, active:true, weekdays:[1], feeStart:'CURRENT', branch:'GODOY_CRUZ' });
    await setFeePrice(pool, { actorToken, mode:'INITIAL', amountCents:4000000n });
    await initializeDueDay(pool, { actorToken, day:10 });
    assert.equal((await generatePeriod(pool, period)).created, 1);
    assert.equal((await generatePeriod(pool, period)).created, 0);

    await saveKilnBatch(pool, { actorToken, idempotencyKey:randomUUID(), batch:{ type:'KILN', date:today, period, reference:'Prueba', notes:'', students:[{ studentId, items:[{ name:'Taza', firingType:'BISQUE', quantity:'1', unitPrice:'3500.00' }] }] } });
    const material = await saveMaterial(pool, { actorToken, idempotencyKey:randomUUID(), material:{ name:'Pasta', category:'Arcilla', description:null, unit:'KG', customUnit:null, priceCents:400000n, active:true } });
    await saveMaterialBatch(pool, { actorToken, idempotencyKey:randomUUID(), batch:{ type:'MATERIAL', date:today, period, students:[{ studentId, items:[{ materialId:material.id, name:'Pasta', quantity:'1.5', unitPrice:'4000.00' }] }] } });

    const login = { email:'lucia@test.invalid', password:initialPassword, source:'prueba-integral' };
    const temporaryToken = await authenticate(pool, login);
    assert.ok(temporaryToken);
    await assert.rejects(getStudentPortal(pool, { actorToken:temporaryToken }), /autoriz/i);
    await changePassword(pool, temporaryToken, initialPassword, 'ClaveNuevaSegura2026!');
    await assert.rejects(getStudentPortal(pool, { actorToken:temporaryToken }), /autoriz/i);
    assert.equal(await authenticate(pool, login), null);
    const studentToken = await authenticate(pool, { ...login, password:'ClaveNuevaSegura2026!' });
    const before = await getStudentPortal(pool, { actorToken:studentToken });
    assert.equal(before.profile.name, 'Lucia Prueba');
    assert.equal(before.summary.outstandingCents, '4950000');
    assert.equal(before.summary.inconsistent, false);
    assert.deepEqual(before.charges.items.map(item => [item.category, item.amountCents]).sort(), [['KILN','350000'],['MATERIAL','600000'],['FEE','4000000']].sort());

    const materialCharge = before.charges.items.find(item => item.category === 'MATERIAL');
    const paymentInput = { actorToken, studentId, idempotencyKey:randomUUID(), method:'CASH', allocations:[{ chargeId:materialCharge.id, amount:200000n }] };
    const payment = await recordAuthorizedPayment(pool, paymentInput);
    assert.equal((await recordAuthorizedPayment(pool, paymentInput)).id, payment.id);
    const after = await getStudentPortal(pool, { actorToken:studentToken });
    assert.equal(after.summary.outstandingCents, '4750000');
    assert.equal(after.charges.items.find(item => item.id === materialCharge.id).outstandingCents, '400000');
    assert.equal(after.payments.items.length, 1);
    assert.equal(after.payments.items[0].amountCents, '200000');
    await assert.rejects(recordAuthorizedPayment(pool, { ...paymentInput, actorToken:studentToken, idempotencyKey:randomUUID() }), /autoriz/i);
  } finally {
    await pool.end();
    await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await root.end();
  }
});
