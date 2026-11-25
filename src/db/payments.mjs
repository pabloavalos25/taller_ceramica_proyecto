import { createHash } from 'node:crypto';
import { validateAllocations } from '../domain/allocations.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxCents = 9223372036854775807n;

// actorId must come from a verified server session; this function does not authenticate callers.
export async function recordPayment(pool, request, authorize = null) {
  const { studentId, idempotencyKey, method, allocations, notes = null } = request;
  let {actorId}=request;
  if ((!authorize&&(typeof actorId!=='string'||!uuid.test(actorId))) || ![studentId, idempotencyKey].every((id) => typeof id === 'string' && uuid.test(id)) || !['CASH', 'TRANSFER', 'MERCADO_PAGO', 'OTHER'].includes(method) || !Array.isArray(allocations) || !allocations.length || allocations.length > 500 || (notes !== null && (typeof notes !== 'string' || notes.length > 2000))) throw new RangeError('Datos de pago inválidos');
  const lines = allocations.map(({ chargeId, amount }) => {
    if (typeof chargeId !== 'string' || !uuid.test(chargeId) || typeof amount !== 'bigint' || amount <= 0n || amount > maxCents) throw new RangeError('Asignación inválida');
    return { chargeId: chargeId.toLowerCase(), amount };
  }).sort((a, b) => a.chargeId.localeCompare(b.chargeId));
  if (new Set(lines.map((line) => line.chargeId)).size !== lines.length) throw new RangeError('Cargo duplicado');
  const total = lines.reduce((sum, line) => sum + line.amount, 0n);
  if (total > maxCents) throw new RangeError('Importe demasiado grande');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if(authorize)actorId=await authorize(client);
    if(typeof actorId!=='string'||!uuid.test(actorId))throw new Error('Operación no autorizada');
    const fingerprint = createHash('sha256').update(JSON.stringify({ actorId: actorId.toLowerCase(), studentId: studentId.toLowerCase(), method, notes, lines: lines.map(({ chargeId, amount }) => [chargeId, amount.toString()]) })).digest('hex');
    const authorized = await client.query("SELECT id FROM users WHERE id = $1 AND role = 'ADMIN' FOR SHARE", [actorId]);
    if (!authorized.rowCount) throw new Error('Operación no autorizada');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('suyai-payment:' || $1::text, 0))", [idempotencyKey.toLowerCase()]);
    const existing = await client.query('SELECT id, request_fingerprint FROM payments WHERE idempotency_key = $1', [idempotencyKey]);
    if (existing.rowCount) {
      if (existing.rows[0].request_fingerprint !== fingerprint) throw new Error('Clave de idempotencia usada con datos diferentes');
      await client.query('COMMIT');
      return { id: existing.rows[0].id, replayed: true };
    }
    const locked = await client.query('SELECT id, amount_cents FROM charges WHERE student_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE', [studentId, lines.map((line) => line.chargeId)]);
    if (locked.rowCount !== lines.length) throw new Error('Cargo inexistente o no pertenece a la alumna');
    const balances = await client.query("SELECT a.charge_id, COALESCE(SUM(a.amount_cents), 0)::text AS paid FROM payment_allocations a WHERE a.charge_id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM payment_events e WHERE e.payment_id = a.payment_id AND e.event_type = 'VOIDED') GROUP BY a.charge_id", [lines.map((line) => line.chargeId)]);
    const paid = new Map(balances.rows.map((row) => [row.charge_id, BigInt(row.paid)]));
    const outstanding = new Map(locked.rows.map((row) => [row.id, BigInt(row.amount_cents) - (paid.get(row.id) ?? 0n)]));
    validateAllocations(total, lines.map((line) => ({ ...line, outstanding: outstanding.get(line.chargeId) })));
    const payment = await client.query('INSERT INTO payments(student_id, amount_cents, method, recorded_by, notes, idempotency_key, request_fingerprint) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [studentId, total.toString(), method, actorId, notes, idempotencyKey, fingerprint]);
    const id = payment.rows[0].id;
    for (const line of lines) await client.query('INSERT INTO payment_allocations(payment_id, charge_id, student_id, amount_cents) VALUES ($1, $2, $3, $4)', [id, line.chargeId, studentId, line.amount.toString()]);
    await client.query("INSERT INTO payment_events(payment_id, actor_id, event_type) VALUES ($1, $2, 'CREATED')", [id, actorId]);
    await client.query('COMMIT');
    return { id, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Both payment creation and voiding must lock affected charges before changing effective balances.
export async function voidPayment(pool, { actorId, paymentId, reason }, authorize = null) {
  if ((!authorize&&(typeof actorId!=='string'||!uuid.test(actorId))) || typeof paymentId!=='string'||!uuid.test(paymentId) || typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000) throw new RangeError('Identificador o motivo inválido');
  const normalizedReason = reason.trim();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if(authorize)actorId=await authorize(client);
    if(typeof actorId!=='string'||!uuid.test(actorId))throw new Error('Operación no autorizada');
    const authorized = await client.query("SELECT id FROM users WHERE id = $1 AND role = 'ADMIN' FOR SHARE", [actorId]);
    if (!authorized.rowCount) throw new Error('Operación no autorizada');
    const payment = await client.query('SELECT id FROM payments WHERE id = $1 FOR UPDATE', [paymentId]);
    if (!payment.rowCount) throw new Error('Pago inexistente');
    const prior = await client.query("SELECT actor_id, reason FROM payment_events WHERE payment_id = $1 AND event_type = 'VOIDED'", [paymentId]);
    if (prior.rowCount) {
      if (prior.rows[0].actor_id !== actorId.toLowerCase() || prior.rows[0].reason !== normalizedReason) throw new Error('Pago ya anulado con otros datos');
      await client.query('COMMIT');
      return { id: paymentId, replayed: true };
    }
    await client.query('SELECT c.id FROM charges c JOIN payment_allocations a ON a.charge_id = c.id WHERE a.payment_id = $1 ORDER BY c.id FOR UPDATE OF c', [paymentId]);
    await client.query("INSERT INTO payment_events(payment_id, actor_id, event_type, reason) VALUES ($1, $2, 'VOIDED', $3)", [paymentId, actorId, normalizedReason]);
    await client.query('COMMIT');
    return { id: paymentId, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
