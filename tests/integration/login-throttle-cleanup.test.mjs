import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { pruneLoginThrottle } from '../../src/auth/login-throttle-cleanup.mjs';
import { authenticate } from '../../src/auth/login.mjs';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('cleanup removes only old unlocked throttle records in bounded batches', async () => {
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const root = new pg.Client({ connectionString: url });
  await root.connect();
  await root.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  const keys = [1, 2, 3, 4].map(n => String(n).repeat(64));
  let lock;
  try {
    await pool.query(await readFile(new URL('../../db/migrations/007_login_throttle.sql', import.meta.url), 'utf8'));
    await pool.query("INSERT INTO login_throttle(bucket, failures, window_started_at) VALUES ($1,5,now()-interval '26 hours'),($2,5,now()-interval '25 hours'),($3,5,now()-interval '24 hours 1 minute'),($4,5,now()-interval '10 minutes')", keys);
    lock = await pool.connect();
    await lock.query('BEGIN');
    await lock.query('SELECT bucket FROM login_throttle WHERE bucket=$1 FOR UPDATE', [keys[0]]);
    assert.equal(await pruneLoginThrottle(pool, { limit: 1 }), 1);
    assert.deepEqual((await pool.query('SELECT bucket FROM login_throttle ORDER BY bucket')).rows.map(r => r.bucket), [keys[0], keys[2], keys[3]]);
    await lock.query('ROLLBACK');
    lock.release(); lock = null;
    assert.equal(await pruneLoginThrottle(pool, { limit: 10 }), 2);
    assert.deepEqual((await pool.query('SELECT bucket,failures FROM login_throttle')).rows, [{ bucket: keys[3], failures: 5 }]);
    assert.equal(await pruneLoginThrottle(pool, { limit: 10 }), 0);
  } finally {
    if (lock) { await lock.query('ROLLBACK'); lock.release(); }
    await pool.end();
    await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await root.end();
  }
});

test('cleanup rejects unbounded or invalid batch sizes', async () => {
  for (const limit of [0, -1, 1001, 1.5, '10']) {
    await assert.rejects(pruneLoginThrottle({ query() { throw new Error('unexpected query'); } }, { limit }), RangeError);
  }
});

test('cleanup cannot erase a bucket while login is acquiring it', async () => {
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const root = new pg.Client({ connectionString: url });
  await root.connect();
  await root.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  let acquired, resume;
  const inserted = new Promise(resolve => { acquired = resolve; });
  const proceed = new Promise(resolve => { resume = resolve; });
  try {
    for (const file of ['001_initial.sql', '006_auth_sessions.sql', '007_login_throttle.sql']) {
      await pool.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
    }
    const bucket = createHash('sha256').update('account:missing@example.com').digest('hex');
    await pool.query("INSERT INTO login_throttle(bucket,failures,window_started_at) VALUES ($1,5,now()-interval '25 hours')", [bucket]);
    const controlledPool = { async connect() {
      const client = await pool.connect();
      return {
        async query(sql, params) {
          const result = await client.query(sql, params);
          if (sql.startsWith('INSERT INTO login_throttle')) { acquired(); await proceed; }
          return result;
        },
        release() { client.release(); },
      };
    } };
    const login = authenticate(controlledPool, { email: 'missing@example.com', password: 'incorrecta', source: null });
    await inserted;
    try { assert.equal(await pruneLoginThrottle(pool), 0); }
    finally { resume(); }
    assert.equal(await login, null);
    assert.equal((await pool.query('SELECT failures FROM login_throttle WHERE bucket=$1', [bucket])).rows[0].failures, 1);
    await pool.query("UPDATE login_throttle SET window_started_at=now()-interval '25 hours' WHERE bucket=$1", [bucket]);
    assert.equal(await pruneLoginThrottle(pool), 1);
    assert.equal(await authenticate(pool, { email: 'missing@example.com', password: 'incorrecta', source: 'trusted-test-source' }), null);
    assert.equal((await pool.query('SELECT failures FROM login_throttle WHERE bucket=$1', [bucket])).rows[0].failures, 1);
  } finally {
    await pool.end();
    await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await root.end();
  }
});
