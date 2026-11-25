import { createHash } from 'node:crypto';
import { hashPassword } from './passwords.mjs';

export class StudentResetError extends Error { constructor(code, message) { super(message); this.code = code; } }

// The administrator must transfer the temporary password through a verified secure channel.
export async function resetStudentPassword(pool, { actorToken, studentId, temporaryPassword, reason }) {
  if (typeof actorToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(actorToken)) throw new StudentResetError('FORBIDDEN', 'Operación no autorizada');
  if (typeof studentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) throw new RangeError('Alumna inválida');
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500 || (typeof temporaryPassword === 'string' && temporaryPassword && reason.includes(temporaryPassword))) throw new RangeError('Motivo inválido');
  const tokenHash = createHash('sha256').update(actorToken).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actor = await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.role = 'ADMIN' AND NOT u.must_change_password FOR SHARE OF u, s", [tokenHash]);
    if (!actor.rowCount) throw new StudentResetError('FORBIDDEN', 'Operación no autorizada');
    const target = await client.query("SELECT u.id FROM users u JOIN student_profiles p ON p.user_id = u.id WHERE u.id = $1 AND u.role = 'USER' FOR UPDATE OF u", [studentId]);
    if (!target.rowCount) throw new StudentResetError('STUDENT', 'Alumna inexistente');
    const hash = await hashPassword(temporaryPassword);
    await client.query('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2', [hash, studentId]);
    await client.query('UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1', [studentId]);
    await client.query('DELETE FROM password_change_throttle WHERE user_id = $1', [studentId]);
    await client.query('INSERT INTO student_password_reset_events(actor_id, student_id, reason) VALUES ($1, $2, $3)', [actor.rows[0].id, studentId, reason.trim()]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
