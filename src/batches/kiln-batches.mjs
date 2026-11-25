import {createHash} from 'node:crypto';
import {validateBatch} from '../domain/batch-validation.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class KilnBatchError extends Error {constructor(code,message){super(message);this.code=code;}}
const optional=(value,max)=>{if(value==null||value==='') return null; if(typeof value!=='string'||value.length>max) throw new RangeError('Texto inválido'); return value.trim()||null;};
export async function saveKilnBatch(pool,{actorToken,idempotencyKey,batch},transactionClient=null) {
  if(typeof actorToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(actorToken)) throw new KilnBatchError('FORBIDDEN','Operación no autorizada');
  if(typeof idempotencyKey!=='string'||!uuid.test(idempotencyKey)||batch?.type!=='KILN') throw new RangeError('Datos inválidos');
  const checked=validateBatch(batch);
  const normalized={type:'KILN',date:checked.date,period:checked.period,reference:optional(batch.reference,200),notes:optional(batch.notes,2000),students:checked.students.map(block=>({studentId:block.studentId,confirmInactive:block.confirmInactive===true,items:block.items.map(item=>{
    if(BigInt(item.quantity)>2147483647n) throw new RangeError('Cantidad fuera de rango');
    const [whole,fraction='']=item.unitPrice.split('.');
    return {name:item.name,firingType:item.firingType,quantity:String(BigInt(item.quantity)),unitPriceCents:(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))).toString(),subtotalCents:item.subtotalCents.toString(),zeroPriceReason:optional(item.zeroPriceReason,500),notes:optional(item.notes,2000),pieceReference:optional(item.pieceReference,200)};
  })}))};
  const client=transactionClient??await pool.connect();
  try {
    if(!transactionClient)await client.query('BEGIN');
    const auth=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password FOR SHARE OF u,s",[createHash('sha256').update(actorToken).digest('hex')]);
    if(!auth.rowCount) throw new KilnBatchError('FORBIDDEN','Operación no autorizada');
    const actor=auth.rows[0].id;
    const fingerprint=createHash('sha256').update(JSON.stringify({actor,batch:normalized})).digest('hex');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('suyai-kiln:' || $1::text,0))",[idempotencyKey.toLowerCase()]);
    const prior=await client.query('SELECT id,request_fingerprint FROM kiln_batches WHERE idempotency_key=$1',[idempotencyKey]);
    if(prior.rowCount){if(prior.rows[0].request_fingerprint!==fingerprint) throw new KilnBatchError('IDEMPOTENCY','Clave de idempotencia usada con otros datos'); if(!transactionClient)await client.query('COMMIT'); return {id:prior.rows[0].id,replayed:true};}
    const ids=normalized.students.map(x=>x.studentId).sort();
    const profiles=await client.query('SELECT user_id,active FROM student_profiles WHERE user_id=ANY($1::uuid[]) ORDER BY user_id FOR SHARE',[ids]);
    if(profiles.rowCount!==ids.length) throw new KilnBatchError('STUDENT','Alumna inexistente');
    const active=new Map(profiles.rows.map(row=>[row.user_id,row.active]));
    for(const block of normalized.students) if(!active.get(block.studentId)&&!block.confirmInactive) throw new KilnBatchError('INACTIVE','Confirmá el cargo para la alumna inactiva');
    const result=await client.query('INSERT INTO kiln_batches(firing_date,billing_period,reference,notes,actor_id,idempotency_key,request_fingerprint) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',[normalized.date,`${normalized.period}-01`,normalized.reference,normalized.notes,actor,idempotencyKey,fingerprint]);
    const id=result.rows[0].id;
    for(const block of normalized.students){
      await client.query('INSERT INTO kiln_batch_students(batch_id,student_id,inactive_confirmed) VALUES ($1,$2,$3)',[id,block.studentId,!active.get(block.studentId)&&block.confirmInactive]);
      for(const item of block.items){
        const charge=await client.query("INSERT INTO charges(student_id,category,amount_cents,description) VALUES ($1,'KILN',$2,$3) RETURNING id",[block.studentId,item.subtotalCents,item.name]);
        await client.query('INSERT INTO kiln_batch_items(batch_id,student_id,charge_id,name,firing_type,quantity,unit_price_cents,subtotal_cents,zero_price_reason,notes,piece_reference) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,block.studentId,charge.rows[0].id,item.name,item.firingType,item.quantity,item.unitPriceCents,item.subtotalCents,item.zeroPriceReason,item.notes,item.pieceReference]);
      }
    }
    if(!transactionClient)await client.query('COMMIT'); return {id,replayed:false};
  } catch(error) {if(!transactionClient)await client.query('ROLLBACK'); throw error;} finally {if(!transactionClient)client.release();}
}
