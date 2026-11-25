import { hashPassword } from './passwords.mjs';

// Only run during initial installation against a dedicated database.
export async function bootstrapAdmin(pool, email, password) {
  if (typeof email !== 'string' || email.length > 320) throw new RangeError('Correo inválido');
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new RangeError('Correo inválido');
  const hash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(1937074538)');
    if ((await client.query("SELECT 1 FROM users WHERE role = 'ADMIN' LIMIT 1")).rowCount) throw new Error('Ya existe un administrador');
    const result = await client.query("INSERT INTO users(email, password_hash, role, must_change_password) VALUES ($1, $2, 'ADMIN', false) RETURNING id", [normalized, hash]);
    await client.query('COMMIT');
    return result.rows[0].id;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
