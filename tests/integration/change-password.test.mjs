import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hashPassword, verifyPassword } from '../../src/auth/passwords.mjs';
import { createSession, getSession } from '../../src/auth/sessions.mjs';
import { changePassword } from '../../src/auth/change-password.mjs';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('changing password verifies the current one and revokes all sessions', async () => {
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const root = new pg.Client({ connectionString: url }); await root.connect(); await root.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    for (const file of ['001_initial.sql','006_auth_sessions.sql','008_password_change_throttle.sql']) await pool.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
    const hash = await hashPassword('contraseña inicial 123');
    const id = (await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('ana@example.com',$1,'USER') RETURNING id", [hash])).rows[0].id;
    const a = await createSession(pool, id); const b = await createSession(pool, id);
    await assert.rejects(changePassword(pool, a, 'contraseña equivocada', 'contraseña nueva 456'), /credenciales/i);
    assert.notEqual(await getSession(pool, a), null);
    for (let i = 0; i < 4; i++) await assert.rejects(changePassword(pool, a, 'contraseña equivocada', 'contraseña nueva 456'), /credenciales/i);
    await assert.rejects(changePassword(pool, a, 'contraseña inicial 123', 'contraseña nueva 456'), /intentos/i);
    await pool.query("UPDATE password_change_throttle SET window_started_at = now() - interval '16 minutes' WHERE user_id = $1", [id]);
    await assert.rejects(changePassword(pool, a, 'contraseña inicial 123', 'contraseña inicial 123'), /diferente/i);
    await changePassword(pool, a, 'contraseña inicial 123', 'contraseña nueva 456');
    assert.equal(await getSession(pool, a), null); assert.equal(await getSession(pool, b), null);
    const user = (await pool.query('SELECT password_hash, must_change_password FROM users WHERE id=$1', [id])).rows[0];
    assert.equal(user.must_change_password, false);
    assert.equal(await verifyPassword('contraseña nueva 456', user.password_hash), true);
    assert.equal(await verifyPassword('contraseña inicial 123', user.password_hash), false);
    await assert.rejects(changePassword(pool, a, 'contraseña nueva 456', 'contraseña adicional 789'), /sesión/i);
  } finally { await pool.end(); await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await root.end(); }
});
