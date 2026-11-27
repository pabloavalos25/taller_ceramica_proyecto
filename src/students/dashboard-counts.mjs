import {createHash} from 'node:crypto';
import {syncFeeTiers} from '../fees/sync-tiers.mjs';

export async function getDashboardCounts(pool,{actorToken}={}) {
 if(typeof actorToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(actorToken))throw Object.assign(new Error('Operación no autorizada'),{code:'FORBIDDEN'});
 const hash=createHash('sha256').update(actorToken).digest('hex'),client=await pool.connect();
 const authorize=async()=>{
  const result=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN admin_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password AND p.active",[hash]);
  if(!result.rowCount)throw Object.assign(new Error('Operación no autorizada'),{code:'FORBIDDEN'});
 };
 try {
  await client.query('BEGIN');await authorize();await syncFeeTiers(client);
  await client.query('COMMIT');await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await authorize();
  const {rows}=await client.query(`WITH students AS (
   SELECT p.user_id,p.active,p.branch,COALESCE(fin.balance,0) AS balance,
    COALESCE(fin.inconsistent,false) OR EXISTS(SELECT 1 FROM monthly_fees f WHERE f.student_id=p.user_id AND NOT EXISTS(SELECT 1 FROM charges x WHERE x.monthly_fee_id=f.id AND x.student_id=f.student_id)) AS inconsistent
   FROM student_profiles p JOIN users u ON u.id=p.user_id
   LEFT JOIN LATERAL (SELECT SUM(c.amount_cents-paid.value) AS balance,BOOL_OR(paid.value>c.amount_cents) AS inconsistent
     FROM charges c CROSS JOIN LATERAL (SELECT COALESCE(SUM(a.amount_cents),0) AS value FROM payment_allocations a WHERE a.charge_id=c.id AND NOT EXISTS(SELECT 1 FROM payment_events e WHERE e.payment_id=a.payment_id AND e.event_type='VOIDED')) paid WHERE c.student_id=p.user_id) fin ON true
  ), totals AS (SELECT COUNT(*) FILTER(WHERE active)::int AS active,COUNT(*) FILTER(WHERE NOT active)::int AS inactive,COUNT(*) FILTER(WHERE active AND NOT inconsistent AND balance<>0)::int AS debt FROM students),
  weekdays AS (SELECT b.branch,d.day,(SELECT COUNT(*)::int FROM students s JOIN student_attendance_days a ON a.student_id=s.user_id AND a.weekday=d.day WHERE s.active AND s.branch=b.branch) AS count FROM (VALUES ('GODOY_CRUZ'),('LUJAN_DE_CUYO')) b(branch) CROSS JOIN generate_series(1,6) d(day))
  SELECT totals.*, (SELECT array_agg(count ORDER BY day) FROM weekdays WHERE branch='GODOY_CRUZ') AS godoy, (SELECT array_agg(count ORDER BY day) FROM weekdays WHERE branch='LUJAN_DE_CUYO') AS lujan FROM totals`);
  await client.query('COMMIT');const row=rows[0];return {active:row.active,inactive:row.inactive,debt:row.debt,days:{GODOY_CRUZ:row.godoy,LUJAN_DE_CUYO:row.lujan}};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
