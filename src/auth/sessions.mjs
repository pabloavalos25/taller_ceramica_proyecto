import { createHash, randomBytes } from 'node:crypto';
const validToken = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export async function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  await db.query("INSERT INTO auth_sessions(token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '12 hours')", [tokenHash(token), userId]);
  return token;
}

export async function getSession(db, token) {
  if (!validToken(token)) return null;
  const result = await db.query('SELECT u.id, u.role, u.must_change_password FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()', [tokenHash(token)]);
  if (!result.rowCount) return null;
  const user = result.rows[0];
  return { userId: user.id, role: user.role, mustChangePassword: user.must_change_password };
}

export async function revokeSession(db, token) {
  if (!validToken(token)) return;
  await db.query('UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1', [tokenHash(token)]);
}
