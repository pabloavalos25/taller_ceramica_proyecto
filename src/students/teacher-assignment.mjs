import { createHash } from 'node:crypto';

export async function listStudentTeacherHistory(pool,{actorToken,studentId}){
  if(typeof actorToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(actorToken))throw new Error('Operación no autorizada');
  if(typeof studentId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId))throw new RangeError('Alumna inválida');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const actor=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN admin_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password AND p.active FOR SHARE OF s,u,p",[createHash('sha256').update(actorToken).digest('hex')]);
    if(!actor.rowCount)throw new Error('Operación no autorizada');
    const result=await client.query('SELECT p.display_name AS "teacherName",p.active AS "teacherActive",h.assigned_at AS "assignedAt" FROM student_teacher_history h JOIN admin_profiles p ON p.user_id=h.teacher_id WHERE h.student_id=$1 ORDER BY h.sequence DESC LIMIT 100',[studentId]);
    await client.query('COMMIT');return {items:result.rows};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

// This service is not exposed by HTTP until administrative permissions are
// enforced consistently across the existing application.
export async function assignStudentTeacher(pool, { actorToken, studentId, teacherId }) {
  if (typeof actorToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(actorToken)) throw new Error('Operación no autorizada');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(studentId ?? '') || !uuid.test(teacherId ?? '')) throw new RangeError('Asignación inválida');
  const hash = createHash('sha256').update(actorToken).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actor = await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN admin_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password AND p.active FOR SHARE OF s,u,p", [hash]);
    if (!actor.rowCount) throw new Error('Operación no autorizada');
    const target = await client.query('SELECT user_id FROM admin_profiles WHERE user_id=$1 AND active FOR SHARE', [teacherId]);
    if (!target.rowCount) throw new Error('Profesor no disponible');
    const student = await client.query('SELECT teacher_id FROM student_profiles WHERE user_id=$1 FOR UPDATE', [studentId]);
    if (!student.rowCount) throw new Error('Alumna no encontrada');
    if (student.rows[0].teacher_id !== teacherId) {
      await client.query('UPDATE student_profiles SET teacher_id=$1 WHERE user_id=$2', [teacherId,studentId]);
      await client.query('INSERT INTO student_teacher_history(student_id,teacher_id,actor_id) VALUES ($1,$2,$3)', [studentId,teacherId,actor.rows[0].id]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
