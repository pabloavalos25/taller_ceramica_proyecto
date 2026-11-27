import {createHash} from 'node:crypto';import {MaterialBatchError} from './batches.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function correctMaterialItem(pool,{actorToken,itemId,action,amountCents,reason,idempotencyKey}){
 if(typeof actorToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(actorToken))throw new MaterialBatchError('FORBIDDEN','Operación no autorizada');
 if(![itemId,idempotencyKey].every(id=>typeof id==='string'&&uuid.test(id))||!['ADJUST','VOID'].includes(action)||typeof amountCents!=='bigint'||amountCents<0n||amountCents>9223372036854775807n||(action==='VOID'&&amountCents!==0n)||typeof reason!=='string'||!reason.trim()||reason.trim().length>500)throw new RangeError('Datos inválidos');
 const client=await pool.connect();try{
  await client.query('BEGIN');
  const auth=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN admin_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password AND p.active AND p.access_level='PRINCIPAL' FOR SHARE OF u,s,p",[createHash('sha256').update(actorToken).digest('hex')]);
  if(!auth.rowCount)throw new MaterialBatchError('FORBIDDEN','Operación no autorizada');const actorId=auth.rows[0].id;
  const fingerprint=createHash('sha256').update(JSON.stringify({actorId,itemId:itemId.toLowerCase(),action,amount:amountCents.toString(),reason:reason.trim()})).digest('hex');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('suyai-material-correction:' || $1::text,0))",[idempotencyKey.toLowerCase()]);
  const previous=await client.query('SELECT id,request_fingerprint FROM material_item_corrections WHERE idempotency_key=$1',[idempotencyKey]);if(previous.rowCount){if(previous.rows[0].request_fingerprint!==fingerprint)throw new MaterialBatchError('IDEMPOTENCY','Clave de idempotencia usada con otros datos');await client.query('COMMIT');return {id:previous.rows[0].id,replayed:true};}
  const item=await client.query('SELECT i.id,i.student_id,i.charge_id,c.amount_cents::text AS amount FROM material_batch_items i JOIN charges c ON c.id=i.charge_id AND c.student_id=i.student_id WHERE i.id=$1 FOR UPDATE OF i,c',[itemId]);if(!item.rowCount)throw new MaterialBatchError('ITEM','Consumo inexistente');const row=item.rows[0];
  if((await client.query("SELECT 1 FROM material_item_corrections WHERE item_id=$1 AND action='VOID'",[row.id])).rowCount)throw new MaterialBatchError('VOIDED','El consumo está anulado');
  const paid=BigInt((await client.query("SELECT COALESCE(sum(a.amount_cents),0)::text AS amount FROM payment_allocations a WHERE a.charge_id=$1 AND NOT EXISTS(SELECT 1 FROM payment_events e WHERE e.payment_id=a.payment_id AND e.event_type='VOIDED')",[row.charge_id])).rows[0].amount);
  if(paid>BigInt(row.amount))throw new MaterialBatchError('INCONSISTENT','El saldo requiere revisión');if(amountCents<paid)throw new MaterialBatchError('PAID','El importe no puede ser menor a lo abonado');if(action==='ADJUST'&&amountCents===BigInt(row.amount))throw new MaterialBatchError('UNCHANGED','El importe no cambió');
  await client.query('UPDATE charges SET amount_cents=$1 WHERE id=$2',[amountCents.toString(),row.charge_id]);
  const event=await client.query('INSERT INTO material_item_corrections(item_id,charge_id,student_id,actor_id,action,previous_cents,new_cents,reason,idempotency_key,request_fingerprint) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[row.id,row.charge_id,row.student_id,actorId,action,row.amount,amountCents.toString(),reason.trim(),idempotencyKey,fingerprint]);await client.query('COMMIT');return {id:event.rows[0].id,replayed:false};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
