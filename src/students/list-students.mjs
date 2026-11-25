import { createHash } from 'node:crypto';
export class StudentListError extends Error { constructor(code, message) { super(message); this.code = code; } }

export async function listStudents(pool, { actorToken, search = '', status = 'ALL', weekday = null, economic = 'ALL', limit = 50, offset = 0 }) {
  if (typeof actorToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(actorToken)) throw new StudentListError('FORBIDDEN', 'Operación no autorizada');
  if (typeof search !== 'string' || search.length > 200 || !['ALL','ACTIVE','INACTIVE'].includes(status) || (weekday !== null && (!Number.isInteger(weekday) || weekday < 1 || weekday > 6)) || !['ALL','CURRENT','DEBT','PARTIAL'].includes(economic) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw new RangeError('Filtros inválidos');
  const tokenHash = createHash('sha256').update(actorToken).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const actor = await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password", [tokenHash]);
    if (!actor.rowCount) throw new StudentListError('FORBIDDEN', 'Operación no autorizada');
    const result = await client.query(`
      WITH summaries AS (
        SELECT p.user_id AS id, p.full_name, u.email, p.active,
          ARRAY(SELECT d.weekday FROM student_attendance_days d WHERE d.student_id=p.user_id ORDER BY d.weekday) AS weekdays,
          COALESCE(fin.balance,0) AS balance,
          CASE WHEN COALESCE(fin.inconsistent,false) OR EXISTS (SELECT 1 FROM monthly_fees f WHERE f.student_id=p.user_id AND NOT EXISTS (SELECT 1 FROM charges fc WHERE fc.monthly_fee_id=f.id AND fc.student_id=f.student_id)) THEN 'INCONSISTENT' WHEN COALESCE(fin.balance,0)=0 THEN 'CURRENT' WHEN COALESCE(fin.partial,false) THEN 'PARTIAL' ELSE 'DEBT' END AS economic
        FROM student_profiles p JOIN users u ON u.id=p.user_id
        LEFT JOIN LATERAL (
          SELECT SUM(c.amount_cents - paid.value) AS balance,
            BOOL_OR(paid.value > 0 AND paid.value < c.amount_cents) AS partial,
            BOOL_OR(paid.value > c.amount_cents) AS inconsistent
          FROM charges c
          CROSS JOIN LATERAL (
            SELECT COALESCE(SUM(a.amount_cents),0) AS value FROM payment_allocations a
            WHERE a.charge_id=c.id AND NOT EXISTS (SELECT 1 FROM payment_events e WHERE e.payment_id=a.payment_id AND e.event_type='VOIDED')
          ) paid WHERE c.student_id=p.user_id
        ) fin ON true
        WHERE (position(lower($1) in lower(p.full_name))>0 OR position(lower($1) in lower(u.email))>0)
          AND ($2::text='ALL' OR p.active=($2::text='ACTIVE'))
          AND ($3::integer IS NULL OR EXISTS (SELECT 1 FROM student_attendance_days d WHERE d.student_id=p.user_id AND d.weekday=$3::integer))
      ), filtered AS (
        SELECT * FROM summaries WHERE $4::text='ALL' OR economic=$4::text OR ($4::text='DEBT' AND economic='PARTIAL')
      ), page AS (
        SELECT id, full_name AS "fullName", email, active, weekdays, balance::text AS "balanceCents", economic AS "economicStatus"
        FROM filtered ORDER BY lower(full_name), id LIMIT $5 OFFSET $6
      )
      SELECT (SELECT COUNT(*)::integer FROM filtered) AS total, COALESCE(jsonb_agg(to_jsonb(page)), '[]'::jsonb) AS items FROM page
    `, [search.trim(), status, weekday, economic, limit, offset]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
