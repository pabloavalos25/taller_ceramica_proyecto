import { createHash } from 'node:crypto';
export class FeeAdjustmentError extends Error { constructor(code,message) { super(message); this.code=code; } }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function listAdjustableFees(pool, { actorToken, search='', offset=0 }) {
  if (typeof actorToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(actorToken)) throw new FeeAdjustmentError('FORBIDDEN','Operación no autorizada');
  if (typeof search !== 'string' || search.length > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw new RangeError('Filtros inválidos');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const actor=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password FOR SHARE OF u,s",[createHash('sha256').update(actorToken).digest('hex')]);
    if (!actor.rowCount) throw new FeeAdjustmentError('FORBIDDEN','Operación no autorizada');
    const result=await client.query(`SELECT f.id,p.full_name AS "studentName",f.period_year AS year,f.period_month AS month,f.original_cents::text AS "originalCents",c.amount_cents::text AS "amountCents",COALESCE((SELECT SUM(a.amount_cents) FROM payment_allocations a WHERE a.charge_id=c.id AND NOT EXISTS (SELECT 1 FROM payment_events e WHERE e.payment_id=a.payment_id AND e.event_type='VOIDED')),0)::text AS "paidCents" FROM monthly_fees f JOIN student_profiles p ON p.user_id=f.student_id JOIN charges c ON c.monthly_fee_id=f.id AND c.student_id=f.student_id AND c.category='FEE' WHERE strpos(lower(p.full_name),lower($1))>0 OR $1='' ORDER BY f.period_year DESC,f.period_month DESC,p.full_name,f.id LIMIT 51 OFFSET $2`,[search.trim(),offset]);
    await client.query('COMMIT');
    return {items:result.rows.slice(0,50),hasMore:result.rows.length>50};
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function adjustFee(pool, { actorToken, feeId, amountCents, reason, idempotencyKey }) {
  if (typeof actorToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(actorToken)) throw new FeeAdjustmentError('FORBIDDEN','Operación no autorizada');
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) throw new RangeError('Motivo inválido');
  if (![feeId,idempotencyKey].every((id)=>typeof id === 'string' && uuid.test(id)) || typeof amountCents !== 'bigint' || amountCents < 0n || amountCents > 9223372036854775807n) throw new RangeError('Datos inválidos');
  const tokenHash=createHash('sha256').update(actorToken).digest('hex');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const actor=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password FOR SHARE OF u,s",[tokenHash]);
    if (!actor.rowCount) throw new FeeAdjustmentError('FORBIDDEN','Operación no autorizada');
    const actorId=actor.rows[0].id;
    const fingerprint=createHash('sha256').update(JSON.stringify({actorId,feeId:feeId.toLowerCase(),amountCents:amountCents.toString(),reason:reason.trim()})).digest('hex');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('suyai-fee-adjust:' || $1::text,0))",[idempotencyKey.toLowerCase()]);
    const previous=await client.query('SELECT id,request_fingerprint FROM fee_adjustments WHERE idempotency_key=$1',[idempotencyKey]);
    if (previous.rowCount) {
      if (previous.rows[0].request_fingerprint !== fingerprint) throw new FeeAdjustmentError('IDEMPOTENCY','Clave de idempotencia usada con datos diferentes');
      await client.query('COMMIT'); return { id:previous.rows[0].id,replayed:true };
    }
    const fee=await client.query("SELECT f.id,f.student_id,c.id AS charge_id,c.amount_cents::text AS amount FROM monthly_fees f JOIN charges c ON c.monthly_fee_id=f.id AND c.student_id=f.student_id AND c.category='FEE' WHERE f.id=$1 FOR UPDATE OF f,c",[feeId]);
    if (!fee.rowCount) throw new FeeAdjustmentError('FEE','Cuota o cargo inexistente');
    const row=fee.rows[0];
    const paid=BigInt((await client.query("SELECT COALESCE(SUM(a.amount_cents),0)::text AS amount FROM payment_allocations a WHERE a.charge_id=$1 AND NOT EXISTS (SELECT 1 FROM payment_events e WHERE e.payment_id=a.payment_id AND e.event_type='VOIDED')",[row.charge_id])).rows[0].amount);
    if (paid > BigInt(row.amount)) throw new FeeAdjustmentError('INCONSISTENT','Saldo inconsistente; requiere revisión');
    if (amountCents < paid) throw new FeeAdjustmentError('PAID','El importe no puede ser menor a lo abonado');
    if (amountCents === BigInt(row.amount)) throw new FeeAdjustmentError('UNCHANGED','El importe no cambió');
    await client.query('UPDATE charges SET amount_cents=$1 WHERE id=$2',[amountCents.toString(),row.charge_id]);
    const event=await client.query('INSERT INTO fee_adjustments(fee_id,student_id,charge_id,actor_id,previous_cents,new_cents,reason,idempotency_key,request_fingerprint) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[row.id,row.student_id,row.charge_id,actorId,row.amount,amountCents.toString(),reason.trim(),idempotencyKey,fingerprint]);
    await client.query('COMMIT'); return { id:event.rows[0].id,replayed:false };
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
