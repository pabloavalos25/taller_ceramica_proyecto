import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { applyMigrations } from '../../src/db/migrate.mjs';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('applies migrations once, detects changes and rolls back failures', async () => {
  const client = new pg.Client({ connectionString: url });
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const one = { name: '001_example.sql', sql: 'CREATE TABLE example (id integer PRIMARY KEY)' };
    assert.deepEqual(await applyMigrations(client, [one]), ['001_example.sql']);
    assert.deepEqual(await applyMigrations(client, [one]), []);
    await assert.rejects(applyMigrations(client, []), /ausente/);
    await assert.rejects(applyMigrations(client, [one, one]), /Orden/);
    await assert.rejects(applyMigrations(client, [{ ...one, sql: `${one.sql}; SELECT 1` }]), /modificada/);
    await assert.rejects(applyMigrations(client, [one, { name: '002_bad.sql', sql: 'CREATE TABLE partial (id integer); INVALID SQL' }]));
    assert.equal((await client.query("SELECT to_regclass('partial') AS name")).rows[0].name, null);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, 1);
  } finally {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});

test('real initial migration can be applied and rerun', async () => {
  const client = new pg.Client({ connectionString: url });
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const sql = await readFile(new URL('../../db/migrations/001_initial.sql', import.meta.url), 'utf8');
    assert.deepEqual(await applyMigrations(client, [{ name: '001_initial.sql', sql }]), ['001_initial.sql']);
    assert.deepEqual(await applyMigrations(client, [{ name: '001_initial.sql', sql }]), []);
    assert.equal((await client.query("SELECT to_regclass('monthly_fees') AS name")).rows[0].name, 'monthly_fees');
  } finally {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});
test('concurrent migration attempts serialize and apply only once', async () => {
  const schema = `suyai_test_${randomUUID().replaceAll('-', '')}`;
  const a = new pg.Client({ connectionString: url });
  const b = new pg.Client({ connectionString: url });
  await a.connect();
  await b.connect();
  try {
    await a.query(`CREATE SCHEMA "${schema}"`);
    await Promise.all([a.query(`SET search_path TO "${schema}"`), b.query(`SET search_path TO "${schema}"`)]);
    const migrations = [{ name: '001_one.sql', sql: 'CREATE TABLE once_only (id integer)' }];
    const results = await Promise.all([applyMigrations(a, migrations), applyMigrations(b, migrations)]);
    assert.deepEqual(results.map((result) => result.length).sort(), [0, 1]);
    assert.equal((await a.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, 1);
  } finally {
    await b.end();
    await a.query('SET search_path TO public');
    await a.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await a.end();
  }
});
