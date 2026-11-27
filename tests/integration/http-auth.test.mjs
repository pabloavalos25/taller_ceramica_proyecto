import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hashPassword } from '../../src/auth/passwords.mjs';
import { authenticate } from '../../src/auth/login.mjs';
import { changePassword } from '../../src/auth/change-password.mjs';
import { getSession, revokeSession } from '../../src/auth/sessions.mjs';
import { createAuthHandlers } from '../../src/auth/http-handlers.mjs';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('HTTP login creates a real session and logout revokes it', async () => {
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const root = new pg.Client({ connectionString: url }); await root.connect(); await root.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    for (const file of ['001_initial.sql','006_auth_sessions.sql','007_login_throttle.sql','008_password_change_throttle.sql','025_admin_profiles.sql']) await pool.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
    const hash = await hashPassword('contraseña segura 123');
    await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('ana@example.com',$1,'USER')", [hash]);
    const handlers = createAuthHandlers({ origin: 'https://suyai.example', production: true, authenticate: (data) => authenticate(pool, data), getSession: (token) => getSession(pool, token), revokeSession: (token) => revokeSession(pool, token), changePassword: (token, current, next) => changePassword(pool, token, current, next) });
    const headers = { origin: 'https://suyai.example', 'content-type': 'application/json' };
    const invalid = await handlers.login(new Request('https://suyai.example/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ email: 'ana@example.com', password: 'errónea' }) }));
    assert.equal(invalid.status, 401); assert.equal(invalid.headers.get('set-cookie'), null);
    const login = await handlers.login(new Request('https://suyai.example/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ email: 'ANA@example.com', password: 'contraseña segura 123' }) }));
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const current = await handlers.session(new Request('https://suyai.example/api/auth/session', { headers: { cookie } }));
    assert.deepEqual(await current.json(), { role: 'USER', mustChangePassword: true });
    const change = await handlers.changePassword(new Request('https://suyai.example/api/auth/change-password', { method: 'POST', headers: { ...headers, cookie }, body: JSON.stringify({ currentPassword: 'contraseña segura 123', newPassword: 'contraseña mejor 456' }) }));
    assert.equal(change.status, 200);
    assert.equal((await handlers.session(new Request('https://suyai.example/api/auth/session', { headers: { cookie } }))).status, 401);
    const relogin = await handlers.login(new Request('https://suyai.example/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ email: 'ana@example.com', password: 'contraseña mejor 456' }) }));
    assert.equal(relogin.status, 200);
    const newCookie = relogin.headers.get('set-cookie').split(';')[0];
    const badLogout = await handlers.logout(new Request('https://suyai.example/api/auth/logout', { method: 'POST', headers: { ...headers, origin: 'https://evil.example', cookie: newCookie } }));
    assert.equal(badLogout.status, 403);
    assert.equal((await handlers.logout(new Request('https://suyai.example/api/auth/logout', { method: 'POST', headers: { ...headers, cookie: newCookie } }))).status, 200);
    assert.equal((await handlers.session(new Request('https://suyai.example/api/auth/session', { headers: { cookie: newCookie } }))).status, 401);
  } finally { await pool.end(); await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await root.end(); }
});
