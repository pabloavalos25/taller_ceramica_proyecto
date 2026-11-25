import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hashPassword } from '../../src/auth/passwords.mjs';
import { authenticate } from '../../src/auth/login.mjs';
import { getSession } from '../../src/auth/sessions.mjs';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('login normalizes emails, issues sessions, and rate-limits failed attempts', async () => {
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const root = new pg.Client({ connectionString: url });
  await root.connect();
  await root.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    for (const file of ['001_initial.sql','006_auth_sessions.sql','007_login_throttle.sql']) await pool.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
    const hash = await hashPassword('contraseña segura 123');
    const id = (await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('ana@example.com',$1,'USER') RETURNING id", [hash])).rows[0].id;
    assert.equal(await authenticate(pool, { email: 'ANA@EXAMPLE.COM ', password: 'incorrecta', source: 'test-1' }), null);
    const token = await authenticate(pool, { email: ' ANA@example.com ', password: 'contraseña segura 123', source: 'test-1' });
    assert.equal((await getSession(pool, token)).userId, id);
    assert.equal(await authenticate(pool, { email: 'unknown@example.com', password: 'incorrecta', source: 'test-2' }), null);
    for (let i = 0; i < 5; i++) assert.equal(await authenticate(pool, { email: 'ana@example.com', password: 'incorrecta', source: 'test-3' }), null);
    assert.equal(await authenticate(pool, { email: 'ana@example.com', password: 'contraseña segura 123', source: 'test-3' }), null);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM auth_sessions')).rows[0].count, 1);
    await pool.query("UPDATE login_throttle SET window_started_at = now() - interval '16 minutes'");
    const resumed = await authenticate(pool, { email: 'ana@example.com', password: 'contraseña segura 123', source: 'test-3' });
    assert.equal((await getSession(pool, resumed)).userId, id);
    const attempts = await Promise.all(Array.from({ length: 6 }, () => authenticate(pool, { email: 'missing@example.com', password: 'incorrecta', source: 'parallel' })));
    assert.deepEqual(attempts, Array(6).fill(null));
    const accountBucket = (await import('node:crypto')).createHash('sha256').update('account:missing@example.com').digest('hex');
    assert.equal((await pool.query('SELECT failures FROM login_throttle WHERE bucket = $1', [accountBucket])).rows[0].failures, 5);
  } finally {
    await pool.end();
    await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await root.end();
  }
});
