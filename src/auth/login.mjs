import { createHash } from 'node:crypto';
import { hashPassword, verifyPassword } from './passwords.mjs';
import { createSession } from './sessions.mjs';

const dummyHash = hashPassword('contraseña aleatoria para cuenta inexistente');
const bucket = (kind, value) => createHash('sha256').update(`${kind}:${value}`).digest('hex');

// source must be derived from trusted server/network configuration, never a client-supplied header.
export async function authenticate(pool, { email, password, source }) {
  if (typeof email !== 'string' || email.length > 320 || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 1024 || typeof source !== 'string' || !source || source.length > 128) return null;
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  const accountKey = bucket('account', normalized);
  const sourceKey = bucket('source', source);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const key of [accountKey, sourceKey].sort()) await client.query('INSERT INTO login_throttle(bucket) VALUES ($1) ON CONFLICT DO NOTHING', [key]);
    const result = await client.query("SELECT bucket, failures, window_started_at <= now() - interval '15 minutes' AS expired FROM login_throttle WHERE bucket = ANY($1::text[]) ORDER BY bucket FOR UPDATE", [[accountKey, sourceKey]]);
    for (const row of result.rows) if (row.expired) { await client.query('UPDATE login_throttle SET failures = 0, window_started_at = now() WHERE bucket = $1', [row.bucket]); row.failures = 0; }
    const counts = new Map(result.rows.map((row) => [row.bucket, row.failures]));
    if (counts.get(accountKey) >= 5 || counts.get(sourceKey) >= 20) { await client.query('COMMIT'); return null; }
    const users = await client.query('SELECT id, password_hash FROM users WHERE email = $1 FOR SHARE', [normalized]);
    const user = users.rows[0];
    const valid = await verifyPassword(password, user?.password_hash ?? await dummyHash);
    if (!user || !valid) {
      await client.query('UPDATE login_throttle SET failures = failures + 1 WHERE bucket = ANY($1::text[])', [[accountKey, sourceKey]]);
      await client.query('COMMIT');
      return null;
    }
    await client.query('UPDATE login_throttle SET failures = 0, window_started_at = now() WHERE bucket = $1', [accountKey]);
    const token = await createSession(client, user.id);
    await client.query('COMMIT');
    return token;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
