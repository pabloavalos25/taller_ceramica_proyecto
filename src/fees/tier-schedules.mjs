import {createHash} from 'node:crypto';
import {validateFeeTiers} from './fee-tiers.mjs';

function tokenHash(token){if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('Operación no autorizada');return createHash('sha256').update(token).digest('hex');}
async function admin(client,hash){const actor=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password FOR SHARE OF u,s",[hash]);if(!actor.rowCount)throw new Error('Operación no autorizada');return actor.rows[0].id;}
export async function getFeeTierSchedules(pool,{actorToken}={}){
  const hash=tokenHash(actorToken),client=await pool.connect();try{
    await client.query('BEGIN');await admin(client,hash);
    const result=await client.query(`SELECT s.id::text,to_char(s.effective_period,'YYYY-MM') AS "effectivePeriod",s.recorded_at AS "recordedAt",COALESCE(u.email,'Configuración inicial') AS "actorEmail",jsonb_agg(jsonb_build_object('startDay',r.start_day,'amountCents',r.amount_cents::text) ORDER BY r.start_day) AS tiers FROM fee_tier_schedules s JOIN fee_tier_rules r ON r.schedule_id=s.id LEFT JOIN users u ON u.id=s.actor_id GROUP BY s.id,u.email ORDER BY s.effective_period DESC,s.id DESC`);
    await client.query('COMMIT');return {history:result.rows};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function scheduleFeeTiers(pool,{actorToken,tiers}={}){
  const hash=tokenHash(actorToken),rules=validateFeeTiers(tiers),client=await pool.connect();try{
    await client.query('BEGIN');const actorId=await admin(client,hash);
    if(!(await client.query('SELECT id FROM fee_price_lock WHERE id=true FOR UPDATE')).rowCount)throw new Error('Falta bloqueo de configuración de cuotas');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('suyai-fee-tier-schedule',0))");
    const inserted=await client.query("INSERT INTO fee_tier_schedules(effective_period,actor_id) VALUES ((date_trunc('month',statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires') + interval '1 month')::date,$1) RETURNING id",[actorId]);
    for(const rule of rules)await client.query('INSERT INTO fee_tier_rules(schedule_id,start_day,amount_cents) VALUES ($1,$2,$3)',[inserted.rows[0].id,rule.startDay,rule.amountCents]);
    await client.query('COMMIT');return {id:String(inserted.rows[0].id)};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
