import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { bootstrapAdmin } from '../../src/auth/bootstrap.mjs';
import { verifyPassword } from '../../src/auth/passwords.mjs';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('initial administrator is created once with a normalized email and hashed password', async () => {
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const root = new pg.Client({ connectionString: url }); await root.connect(); await root.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    await pool.query(await readFile(new URL('../../db/migrations/001_initial.sql', import.meta.url), 'utf8'));
    const attempts = await Promise.allSettled([bootstrapAdmin(pool, ' ADMIN@example.com ', 'contraseña segura 123'), bootstrapAdmin(pool, 'other@example.com', 'otra contraseña 456')]);
    assert.equal(attempts.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter((x) => x.status === 'rejected').length, 1);
    const rows = (await pool.query('SELECT email,password_hash,role FROM users')).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].role, 'ADMIN');
    const pass = rows[0].email === 'admin@example.com' ? 'contraseña segura 123' : 'otra contraseña 456';
    assert.equal(await verifyPassword(pass, rows[0].password_hash), true);
    assert.notEqual(rows[0].password_hash, pass);
    await assert.rejects(bootstrapAdmin(pool, 'bad', 'contraseña segura 123'), /correo/i);
  } finally { await pool.end(); await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await root.end(); }
});
