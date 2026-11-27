import { createHash } from 'node:crypto';

export async function applyMigrations(client, migrations, {beforeApply,afterApply} = {}) {
  const normalized = migrations.map(({ name, sql }) => ({ name, sql, checksum: createHash('sha256').update(sql).digest('hex') }));
  for (let i = 0; i < normalized.length; i++) {
    if (!/^\d{3}_[a-z0-9_]+\.sql$/.test(normalized[i].name) || (i && normalized[i - 1].name >= normalized[i].name)) throw new Error('Orden de migraciones inválido');
  }
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(1937074537)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const existing = (await client.query('SELECT name, checksum FROM schema_migrations ORDER BY name')).rows;
    for (let i = 0; i < existing.length; i++) {
      if (!normalized[i] || normalized[i].name !== existing[i].name || normalized[i].checksum !== existing[i].checksum) throw new Error(`Migración aplicada ausente o modificada: ${existing[i].name}`);
    }
    if (beforeApply) await beforeApply(existing);
    if (normalized.slice(existing.length).some(migration => migration.name === '025_admin_profiles.sql') && !afterApply) throw new Error('La migración de perfiles requiere configurar la administradora principal en la misma transacción');
    const applied = [];
    for (const migration of normalized.slice(existing.length)) {
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
      applied.push(migration.name);
    }
    if (afterApply) await afterApply(client);
    await client.query('COMMIT');
    return applied;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
