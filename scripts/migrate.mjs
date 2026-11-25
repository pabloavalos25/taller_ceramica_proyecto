import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { applyMigrations } from '../src/db/migrate.mjs';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL es obligatoria. Configurá una base dedicada antes de migrar.');
  process.exitCode = 1;
} else {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    const directory = fileURLToPath(new URL('../db/migrations/', import.meta.url));
    const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    if (!names.length) throw new Error('No se encontraron migraciones');
    const migrations = await Promise.all(names.map(async (name) => ({ name, sql: await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8') })));
    await client.connect();
    const applied = await applyMigrations(client, migrations);
    console.log(applied.length ? `Migraciones aplicadas: ${applied.join(', ')}` : 'La base ya está actualizada.');
  } catch (error) {
    console.error(`No se pudo completar la migración: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
