import { createHash } from 'node:crypto';
export class FeePriceError extends Error { constructor(code,message) { super(message); this.code=code; } }
const tokenHash = (token) => {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new FeePriceError('FORBIDDEN','Operación no autorizada');
  return createHash('sha256').update(token).digest('hex');
};
async function actor(client, hash, lock) {
  const result = await client.query(`SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password ${lock ? 'FOR SHARE OF u,s' : ''}`, [hash]);
  if (!result.rowCount) throw new FeePriceError('FORBIDDEN','Operación no autorizada');
  return result.rows[0].id;
}
export async function setFeePrice(pool, { actorToken, mode, amountCents }) {
  const hash = tokenHash(actorToken);
  if (!['INITIAL','SCHEDULE'].includes(mode) || typeof amountCents !== 'bigint' || amountCents < 0n || amountCents > 9223372036854775807n) throw new RangeError('Importe inválido');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actorId = await actor(client,hash,true);
    if (!(await client.query('SELECT id FROM fee_price_lock WHERE id=true FOR UPDATE')).rowCount) throw new Error('Falta bloqueo de configuración de cuotas');
    const existing = await client.query('SELECT EXISTS(SELECT 1 FROM fee_price_history) AS configured, EXISTS(SELECT 1 FROM monthly_fees) AS has_fees');
    if ((mode === 'INITIAL' && (existing.rows[0].configured || existing.rows[0].has_fees)) || (mode === 'SCHEDULE' && !existing.rows[0].configured)) throw new FeePriceError('INITIAL','Configuración inicial no disponible o pendiente');
    await client.query("INSERT INTO fee_price_history(effective_period,amount_cents,actor_id) VALUES ((date_trunc('month',statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires') + ($1::integer * interval '1 month'))::date,$2,$3)",[mode === 'INITIAL' ? 0 : 1, amountCents.toString(),actorId]);
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function getFeePrices(pool, { actorToken }) {
  const hash=tokenHash(actorToken), client=await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await actor(client,hash,false);
    const rows=(await client.query("SELECT id::text, to_char(effective_period,'YYYY-MM-DD') AS \"effectivePeriod\", amount_cents::text AS \"amountCents\", actor_id AS \"actorId\", (SELECT email FROM users WHERE id=fee_price_history.actor_id) AS \"actorEmail\", recorded_at AS \"recordedAt\", effective_period <= date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS current_or_past FROM fee_price_history ORDER BY effective_period DESC,id DESC")).rows;
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
