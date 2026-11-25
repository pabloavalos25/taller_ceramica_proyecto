import {createHash} from 'node:crypto';
import {recordPayment,voidPayment} from '../db/payments.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class PaymentAccessError extends Error{constructor(code,message){super(message);this.code=code;}}
async function withAdmin(pool,token,fn){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new PaymentAccessError('FORBIDDEN','Operación no autorizada');
  const client=await pool.connect();try{
    await client.query('BEGIN');
    const actor=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password FOR SHARE OF u,s",[createHash('sha256').update(token).digest('hex')]);
    if(!actor.rowCount)throw new PaymentAccessError('FORBIDDEN','Operación no autorizada');
    const result=await fn(client,actor.rows[0].id);await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function listPayableCharges(pool,{actorToken,studentId,offset=0}){
  if(typeof studentId!=='string'||!uuid.test(studentId)||!Number.isInteger(offset)||offset<0||offset>100000)throw new RangeError('Filtros inválidos');
  return withAdmin(pool,actorToken,async client=>{
    const student=await client.query('SELECT user_id,full_name,active FROM student_profiles WHERE user_id=$1',[studentId]);
    if(!student.rowCount)throw new PaymentAccessError('STUDENT','Alumna inexistente');
    const result=await client.query(`SELECT c.id,c.category,c.description,c.amount_cents::text AS "amountCents",p.paid::text AS "paidCents",(c.amount_cents::numeric-p.paid)::text AS "outstandingCents",p.paid>c.amount_cents AS inconsistent FROM charges c CROSS JOIN LATERAL (SELECT COALESCE(sum(a.amount_cents),0) AS paid FROM payment_allocations a WHERE a.charge_id=c.id AND NOT EXISTS(SELECT 1 FROM payment_events e WHERE e.payment_id=a.payment_id AND e.event_type='VOIDED')) p WHERE c.student_id=$1 AND (c.amount_cents>p.paid OR p.paid>c.amount_cents) ORDER BY c.created_at,c.id LIMIT 51 OFFSET $2`,[studentId,offset]);
    return {student:{id:student.rows[0].user_id,name:student.rows[0].full_name,active:student.rows[0].active},items:result.rows.slice(0,50),hasMore:result.rowCount>50};
  });
}
export async function recordAuthorizedPayment(pool,{actorToken,...request}){
  if(typeof actorToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(actorToken))throw new PaymentAccessError('FORBIDDEN','Operación no autorizada');
  return recordPayment(pool,request,async client=>{
    const actor=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password FOR SHARE OF u,s",[createHash('sha256').update(actorToken).digest('hex')]);
    if(!actor.rowCount)throw new PaymentAccessError('FORBIDDEN','Operación no autorizada');return actor.rows[0].id;
  });
}
export async function voidAuthorizedPayment(pool,{actorToken,...request}){
  if(typeof actorToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(actorToken))throw new PaymentAccessError('FORBIDDEN','Operación no autorizada');
  return voidPayment(pool,request,async client=>{
    const actor=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password FOR SHARE OF u,s",[createHash('sha256').update(actorToken).digest('hex')]);
    if(!actor.rowCount)throw new PaymentAccessError('FORBIDDEN','Operación no autorizada');return actor.rows[0].id;
  });
}
export async function listPayments(pool,{actorToken,search='',status='ALL',offset=0}={}){
  if(typeof search!=='string'||search.length>200||!['ALL','ACTIVE','VOIDED'].includes(status)||!Number.isInteger(offset)||offset<0||offset>100000)throw new RangeError('Filtros inválidos');
  return withAdmin(pool,actorToken,async client=>{
    const r=await client.query(`SELECT p.id,p.paid_at AS "paidAt",s.full_name AS "studentName",u.email AS "studentEmail",p.method,p.amount_cents::text AS "amountCents",actor.email AS "actorEmail",(v.payment_id IS NOT NULL) AS voided FROM payments p JOIN student_profiles s ON s.user_id=p.student_id JOIN users u ON u.id=p.student_id JOIN users actor ON actor.id=p.recorded_by LEFT JOIN payment_events v ON v.payment_id=p.id AND v.event_type='VOIDED' WHERE (strpos(lower(s.full_name),lower($1))>0 OR strpos(lower(u.email),lower($1))>0) AND ($2='ALL' OR ($2='VOIDED')=(v.payment_id IS NOT NULL)) ORDER BY p.paid_at DESC,p.id DESC LIMIT 51 OFFSET $3`,[search.trim(),status,offset]);
    return {items:r.rows.slice(0,50),hasMore:r.rowCount>50};
  });
}
export async function getPayment(pool,{actorToken,paymentId}={}){
  if(typeof paymentId!=='string'||!uuid.test(paymentId))throw new RangeError('Identificador inválido');
  return withAdmin(pool,actorToken,async client=>{
    const r=await client.query(`SELECT p.id,p.paid_at AS "paidAt",s.full_name AS "studentName",p.method,p.amount_cents::text AS "amountCents",p.notes,actor.email AS "actorEmail",(v.payment_id IS NOT NULL) AS voided,v.reason AS "voidReason",v.occurred_at AS "voidedAt",vu.email AS "voidedBy" FROM payments p JOIN student_profiles s ON s.user_id=p.student_id JOIN users actor ON actor.id=p.recorded_by LEFT JOIN payment_events v ON v.payment_id=p.id AND v.event_type='VOIDED' LEFT JOIN users vu ON vu.id=v.actor_id WHERE p.id=$1`,[paymentId]);
    if(!r.rowCount)return null;
    const allocations=await client.query('SELECT c.description,c.category,a.amount_cents::text AS "amountCents" FROM payment_allocations a JOIN charges c ON c.id=a.charge_id AND c.student_id=a.student_id WHERE a.payment_id=$1 ORDER BY c.created_at,c.id',[paymentId]);
    return {...r.rows[0],allocations:allocations.rows};
  });
}
