import { createHash } from 'node:crypto';
import { hashPassword } from '../auth/passwords.mjs';

export class StudentCreationError extends Error { constructor(code, message) { super(message); this.code = code; } }

export async function createStudent(pool, input) {
  const { actorToken, fullName, email, phone, initialPassword, enrolledOn, active, weekdays, feeStart } = input;
  if (typeof actorToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(actorToken)) throw new StudentCreationError('FORBIDDEN', 'Operación no autorizada');
  if (typeof fullName !== 'string' || !fullName.trim() || fullName.length > 200 || typeof email !== 'string' || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase()) || typeof phone !== 'string' || !phone.trim() || phone.length > 50 || typeof active !== 'boolean' || !['CURRENT','NEXT'].includes(feeStart)) throw new RangeError('Datos de alumna inválidos');
  if (typeof enrolledOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(enrolledOn) || Number.isNaN(Date.parse(`${enrolledOn}T00:00:00Z`)) || new Date(`${enrolledOn}T00:00:00Z`).toISOString().slice(0, 10) !== enrolledOn || enrolledOn.startsWith('0000')) throw new RangeError('Fecha inválida');
  if (!Array.isArray(weekdays) || weekdays.length < 1 || weekdays.length > 6 || weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 6) || new Set(weekdays).size !== weekdays.length) throw new RangeError('Días de asistencia inválidos');
  const tokenHash = createHash('sha256').update(actorToken).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actor = await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.role = 'ADMIN' AND NOT u.must_change_password FOR SHARE OF u, s", [tokenHash]);
    if (!actor.rowCount) throw new StudentCreationError('FORBIDDEN', 'Operación no autorizada');
    const hash = await hashPassword(initialPassword);
    const user = await client.query("INSERT INTO users(email, password_hash, role, must_change_password) VALUES ($1, $2, 'USER', true) RETURNING id", [email.trim().toLowerCase(), hash]);
    const id = user.rows[0].id;
    await client.query('INSERT INTO student_profiles(user_id, full_name, phone, enrolled_on, active) VALUES ($1, $2, $3, $4, $5)', [id, fullName.trim(), phone.trim(), enrolledOn, active]);
    for (const day of weekdays) await client.query('INSERT INTO student_attendance_days(student_id, weekday) VALUES ($1, $2)', [id, day]);
    await client.query("INSERT INTO student_fee_preferences(student_id, start_period) VALUES ($1, (date_trunc('month', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') + ($2::integer * interval '1 month'))::date)", [id, feeStart === 'NEXT' ? 1 : 0]);
    await client.query('INSERT INTO student_creation_events(actor_id, student_id) VALUES ($1, $2)', [actor.rows[0].id, id]);
    await client.query('COMMIT');
    return id;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505' && error.constraint === 'users_email_key') throw new StudentCreationError('DUPLICATE', 'Correo duplicado');
    throw error;
  } finally { client.release(); }
}
