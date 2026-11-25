import { createHash } from 'node:crypto';
import { hashPassword, verifyPassword } from './passwords.mjs';

export class PasswordChangeError extends Error { constructor(code, message) { super(message); this.code = code; } }

export async function changePassword(pool, token, currentPassword, newPassword) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new PasswordChangeError('SESSION', 'Sesión inválida');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    const lookup = await client.query('SELECT user_id FROM auth_sessions WHERE token_hash = $1', [tokenHash]);
    if (!lookup.rowCount) throw new PasswordChangeError('SESSION', 'Sesión inválida');
    const user = await client.query('SELECT id, password_hash FROM users WHERE id = $1 FOR UPDATE', [lookup.rows[0].user_id]);
    const active = await client.query('SELECT token_hash FROM auth_sessions WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now() FOR UPDATE', [tokenHash, lookup.rows[0].user_id]);
    if (!user.rowCount || !active.rowCount) throw new PasswordChangeError('SESSION', 'Sesión inválida');
    await client.query('INSERT INTO password_change_throttle(user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.rows[0].id]);
    const state = (await client.query("SELECT failures, window_started_at <= now() - interval '15 minutes' AS expired FROM password_change_throttle WHERE user_id = $1 FOR UPDATE", [user.rows[0].id])).rows[0];
    if (state.expired) { await client.query('UPDATE password_change_throttle SET failures = 0, window_started_at = now() WHERE user_id = $1', [user.rows[0].id]); state.failures = 0; }
    if (state.failures >= 5) throw new PasswordChangeError('LIMIT', 'Demasiados intentos');
    if (!(await verifyPassword(currentPassword, user.rows[0].password_hash))) {
      await client.query('UPDATE password_change_throttle SET failures = failures + 1 WHERE user_id = $1', [user.rows[0].id]);
      await client.query('COMMIT'); committed = true;
      throw new PasswordChangeError('CREDENTIALS', 'Credenciales inválidas');
    }
    if (newPassword === currentPassword) throw new RangeError('La nueva contraseña debe ser diferente');
    const hash = await hashPassword(newPassword);
    await client.query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [hash, user.rows[0].id]);
    await client.query('UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1', [user.rows[0].id]);
    await client.query('DELETE FROM password_change_throttle WHERE user_id = $1', [user.rows[0].id]);
    await client.query('COMMIT'); committed = true;
  } catch (error) {
    if (!committed) await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
