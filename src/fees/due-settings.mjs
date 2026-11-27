import { createHash } from 'node:crypto';
export class DueDayError extends Error { constructor(code,message) { super(message); this.code=code; } }
function tokenHash(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new DueDayError('FORBIDDEN','Operación no autorizada');
  return createHash('sha256').update(token).digest('hex');
}
async function actor(client, hash, lock) {
  const result = await client.query(`SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN admin_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password AND p.active ${lock ? "AND p.access_level='PRINCIPAL' FOR SHARE OF u,s,p" : ''}`, [hash]);
  if (!result.rowCount) throw new DueDayError('FORBIDDEN','Operación no autorizada');
  return result.rows[0].id;
}
async function writeDay(pool, { actorToken, day }, initial) {
  const hash=tokenHash(actorToken);
  if (!Number.isInteger(day) || day < 1 || day > 28) throw new RangeError('El día debe estar entre 1 y 28');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const actorId=await actor(client,hash,true);
    if (!(await client.query('SELECT id FROM fee_price_lock WHERE id=true FOR UPDATE')).rowCount) throw new Error('Falta bloqueo de configuración de cuotas');
    const tiered=(await client.query("SELECT EXISTS(SELECT 1 FROM fee_tier_schedules WHERE effective_period <= (date_trunc('month',statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires') + ($1::integer * interval '1 month'))::date) AS active",[initial?0:1])).rows[0].active;
    if(tiered)throw new DueDayError('TIERS','Configurá los vencimientos desde la sección de tramos.');
    const state=(await client.query('SELECT EXISTS(SELECT 1 FROM fee_due_day_history) AS configured, EXISTS(SELECT 1 FROM monthly_fees) AS has_fees')).rows[0];
    if ((initial && (state.configured || state.has_fees)) || (!initial && !state.configured)) throw new DueDayError('INITIAL','Configuración inicial no disponible o pendiente');
    await client.query("INSERT INTO fee_due_day_history(effective_period,due_day,actor_id) VALUES ((date_trunc('month',statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires') + ($1::integer * interval '1 month'))::date,$2,$3)",[initial ? 0 : 1,day,actorId]);
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export const initializeDueDay=(pool,input)=>writeDay(pool,input,true);
export const scheduleDueDay=(pool,input)=>writeDay(pool,input,false);
export async function getDueDays(pool, { actorToken }) {
  const hash=tokenHash(actorToken), client=await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await actor(client,hash,false);
    const rows=(await client.query("SELECT id::text, to_char(effective_period,'YYYY-MM-DD') AS \"effectivePeriod\", due_day AS day, actor_id AS \"actorId\", recorded_at AS \"recordedAt\", effective_period <= date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS current_or_past FROM fee_due_day_history ORDER BY effective_period DESC,id DESC")).rows;
    const current=rows.find((row)=>row.current_or_past) ?? null;
    const upcoming=rows.filter((row)=>!row.current_or_past);
    const nearest=upcoming.length ? upcoming[upcoming.length-1].effectivePeriod : null;
    const next=nearest ? upcoming.find((row)=>row.effectivePeriod===nearest) : null;
    const clean=(row)=>{ if (!row) return null; const { current_or_past, ...rest }=row; return rest; };
    await client.query('COMMIT');
    return { current:clean(current), next:clean(next), history:rows.map(clean) };
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
