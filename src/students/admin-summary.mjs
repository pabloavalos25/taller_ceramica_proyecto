import {createHash} from 'node:crypto';
import {syncFeeTiers} from '../fees/sync-tiers.mjs';

export async function getAdminSummary(pool,{actorToken}={}) {
  if(typeof actorToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(actorToken)) throw new Error('Operación no autorizada');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const actor=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password",[createHash('sha256').update(actorToken).digest('hex')]);
    if(!actor.rowCount) throw new Error('Operación no autorizada');
    await syncFeeTiers(client);
    await client.query('COMMIT');await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const verified=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password",[createHash('sha256').update(actorToken).digest('hex')]);
    if(!verified.rowCount)throw new Error('Operación no autorizada');
    const balance=await client.query(`SELECT COALESCE(sum(c.amount_cents-p.paid),0)::text AS "outstandingCents", COALESCE(bool_or(p.paid>c.amount_cents),false) OR EXISTS(SELECT 1 FROM monthly_fees f WHERE NOT EXISTS(SELECT 1 FROM charges x WHERE x.monthly_fee_id=f.id AND x.student_id=f.student_id)) AS inconsistent FROM charges c CROSS JOIN LATERAL (SELECT COALESCE(sum(a.amount_cents),0) AS paid FROM payment_allocations a WHERE a.charge_id=c.id AND NOT EXISTS(SELECT 1 FROM payment_events e WHERE e.payment_id=a.payment_id AND e.event_type='VOIDED')) p`);
    const income=await client.query(`SELECT COALESCE(sum(p.amount_cents),0)::text AS "incomeCents" FROM payments p WHERE date_trunc('month',p.paid_at AT TIME ZONE 'America/Argentina/Buenos_Aires')=date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires') AND NOT EXISTS(SELECT 1 FROM payment_events e WHERE e.payment_id=p.id AND e.event_type='VOIDED')`);
    const monthly=await client.query(`WITH months AS (SELECT generate_series(date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires')-interval '5 months',date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires'),interval '1 month') AS month) SELECT to_char(m.month,'YYYY-MM') AS period, COALESCE(sum(p.amount_cents),0)::text AS "amountCents" FROM months m LEFT JOIN payments p ON date_trunc('month',p.paid_at AT TIME ZONE 'America/Argentina/Buenos_Aires')=m.month AND NOT EXISTS(SELECT 1 FROM payment_events e WHERE e.payment_id=p.id AND e.event_type='VOIDED') GROUP BY m.month ORDER BY m.month`);
    const recent=await client.query(`SELECT p.id,s.full_name AS "studentName",p.paid_at AS "paidAt",p.amount_cents::text AS "amountCents",EXISTS(SELECT 1 FROM payment_events e WHERE e.payment_id=p.id AND e.event_type='VOIDED') AS voided FROM payments p JOIN student_profiles s ON s.user_id=p.student_id ORDER BY p.paid_at DESC,p.id DESC LIMIT 5`);
    await client.query('COMMIT');
    return {...balance.rows[0],...income.rows[0],monthlyIncome:monthly.rows,recentPayments:recent.rows};
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
