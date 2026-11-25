import {createHash} from 'node:crypto';
import {MaterialBatchError} from './batches.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function readAuthorized(pool,token,fn){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new MaterialBatchError('FORBIDDEN','Operación no autorizada');
  const client=await pool.connect();try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const auth=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password",[createHash('sha256').update(token).digest('hex')]);
    if(!auth.rowCount)throw new MaterialBatchError('FORBIDDEN','Operación no autorizada');
    const result=await fn(client);await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function listMaterialBatches(pool,{actorToken,period='',offset=0}={}){
  if(typeof period!=='string'||(period!==''&&!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(period))||!Number.isInteger(offset)||offset<0||offset>100000)throw new RangeError('Filtro inválido');
  return readAuthorized(pool,actorToken,async client=>{
    const result=await client.query(`SELECT b.id,to_char(b.consumption_date,'YYYY-MM-DD') AS date,to_char(b.billing_period,'YYYY-MM') AS period,u.email AS "actorEmail",count(DISTINCT i.student_id)::int AS students,count(i.id)::int AS records,COALESCE(sum(c.amount_cents),0)::text AS "totalCents",COALESCE(sum(p.paid),0)::text AS "paidCents",bool_or(p.paid>c.amount_cents) AS inconsistent FROM material_batches b JOIN users u ON u.id=b.actor_id JOIN material_batch_items i ON i.batch_id=b.id JOIN charges c ON c.id=i.charge_id CROSS JOIN LATERAL (SELECT COALESCE(sum(a.amount_cents),0) AS paid FROM payment_allocations a WHERE a.charge_id=c.id AND NOT EXISTS(SELECT 1 FROM payment_events e WHERE e.payment_id=a.payment_id AND e.event_type='VOIDED')) p WHERE ($1='' OR to_char(b.billing_period,'YYYY-MM')=$1) GROUP BY b.id,u.email ORDER BY b.consumption_date DESC,b.created_at DESC,b.id DESC LIMIT 51 OFFSET $2`,[period,offset]);
    return {items:result.rows.slice(0,50),hasMore:result.rowCount>50};
  });
}
export async function getMaterialBatch(pool,{actorToken,batchId}={}){
  if(typeof batchId!=='string'||!uuid.test(batchId))throw new RangeError('Identificador inválido');
  return readAuthorized(pool,actorToken,async client=>{
    const header=await client.query(`SELECT b.id,to_char(b.consumption_date,'YYYY-MM-DD') AS date,to_char(b.billing_period,'YYYY-MM') AS period,u.email AS "actorEmail" FROM material_batches b JOIN users u ON u.id=b.actor_id WHERE b.id=$1`,[batchId]);
    if(!header.rowCount)return null;
    const rows=await client.query(`SELECT i.id,i.student_id AS "studentId",s.full_name AS "studentName",i.name,i.unit,i.quantity::text AS quantity,i.unit_price_cents::text AS "unitPriceCents",i.subtotal_cents::text AS "originalCents",c.amount_cents::text AS "amountCents",p.paid::text AS "paidCents",i.zero_price_reason AS "zeroPriceReason" FROM material_batch_items i JOIN student_profiles s ON s.user_id=i.student_id JOIN charges c ON c.id=i.charge_id CROSS JOIN LATERAL (SELECT COALESCE(sum(a.amount_cents),0) AS paid FROM payment_allocations a WHERE a.charge_id=c.id AND NOT EXISTS(SELECT 1 FROM payment_events e WHERE e.payment_id=a.payment_id AND e.event_type='VOIDED')) p WHERE i.batch_id=$1 ORDER BY lower(s.full_name),i.student_id,i.name,i.id`,[batchId]);
    const events=await client.query(`SELECT e.item_id AS "itemId",e.action,e.previous_cents::text AS "previousCents",e.new_cents::text AS "newCents",e.reason,e.created_at AS "createdAt",u.email AS "actorEmail" FROM material_item_corrections e JOIN material_batch_items i ON i.id=e.item_id JOIN users u ON u.id=e.actor_id WHERE i.batch_id=$1 ORDER BY e.created_at,e.id`,[batchId]);
    const corrections=new Map();for(const {itemId,...event} of events.rows){if(!corrections.has(itemId))corrections.set(itemId,[]);corrections.get(itemId).push(event);}
    const groups=new Map();for(const row of rows.rows){const {studentId,studentName,...item}=row;if(!groups.has(studentId))groups.set(studentId,{id:studentId,name:studentName,items:[]});item.corrections=corrections.get(item.id)??[];item.voided=item.corrections.some(event=>event.action==='VOID');groups.get(studentId).items.push(item);}
    return {...header.rows[0],students:[...groups.values()]};
  });
}
