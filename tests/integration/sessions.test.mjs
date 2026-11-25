import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createSession, getSession, revokeSession } from '../../src/auth/sessions.mjs';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('opaque session is stored hashed, expires and can be revoked', async () => {
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const root = new pg.Client({ connectionString: url });
  await root.connect();
  await root.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    for (const file of ['001_initial.sql', '006_auth_sessions.sql']) await pool.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
    const id = (await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('ana@example.com','hash','USER') RETURNING id")).rows[0].id;
    const token = await createSession(pool, id);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const row = (await pool.query('SELECT token_hash FROM auth_sessions')).rows[0];
    assert.equal(row.token_hash, createHash('sha256').update(token).digest('hex'));
    assert.notEqual(row.token_hash, token);
    assert.deepEqual(await getSession(pool, token), { userId: id, role: 'USER', mustChangePassword: true });
    assert.equal(await getSession(pool, 'malformed'), null);
    await revokeSession(pool, token);
    assert.equal(await getSession(pool, token), null);
    const expired = await createSession(pool, id);
    await pool.query('UPDATE auth_sessions SET expires_at = now() - interval \'1 second\' WHERE token_hash=$1', [createHash('sha256').update(expired).digest('hex')]);
    assert.equal(await getSession(pool, expired), null);
  } finally {
    await pool.end();
    await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await root.end();
  }
});
