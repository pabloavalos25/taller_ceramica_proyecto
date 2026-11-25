import { createHash } from 'node:crypto';
export class StudentStatusError extends Error { constructor(code, message) { super(message); this.code = code; } }

export async function changeStudentStatus(pool, { actorToken, studentId, action, feeStart }) {
  if (typeof actorToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(actorToken)) throw new StudentStatusError('FORBIDDEN', 'Operación no autorizada');
  if (typeof studentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId) || !['DEACTIVATE','REACTIVATE'].includes(action)) throw new RangeError('Datos inválidos');
  if ((action === 'REACTIVATE' && !['CURRENT','NEXT'].includes(feeStart)) || (action === 'DEACTIVATE' && feeStart !== undefined)) throw new RangeError('Período inválido');
  const tokenHash = createHash('sha256').update(actorToken).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actor = await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password FOR SHARE OF u,s", [tokenHash]);
    if (!actor.rowCount) throw new StudentStatusError('FORBIDDEN', 'Operación no autorizada');
    const student = await client.query('SELECT active FROM student_profiles WHERE user_id=$1 FOR UPDATE', [studentId]);
    if (!student.rowCount) throw new StudentStatusError('STUDENT', 'Alumna inexistente');
    const previous = student.rows[0].active;
    const next = action === 'REACTIVATE';
    if (previous === next) throw new StudentStatusError('STATE', 'La alumna ya tiene ese estado');
    await client.query('UPDATE student_profiles SET active=$1 WHERE user_id=$2', [next, studentId]);
    await client.query("INSERT INTO student_status_change_events(student_id,actor_id,previous_active,new_active,fee_start_period) VALUES ($1,$2,$3,$4,CASE WHEN $4 THEN (date_trunc('month', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') + ($5::integer * interval '1 month'))::date ELSE NULL END)", [studentId, actor.rows[0].id, previous, next, feeStart === 'NEXT' ? 1 : 0]);
    await client.query('COMMIT');
    return { active: next };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
