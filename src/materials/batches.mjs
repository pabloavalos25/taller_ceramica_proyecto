import {createHash} from 'node:crypto';
import {validateBatch} from '../domain/batch-validation.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class MaterialBatchError extends Error{constructor(code,message){super(message);this.code=code;}}
export async function saveMaterialBatch(pool,{actorToken,idempotencyKey,batch},transactionClient=null){
  if(typeof actorToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(actorToken))throw new MaterialBatchError('FORBIDDEN','Operación no autorizada');
  if(typeof idempotencyKey!=='string'||!uuid.test(idempotencyKey)||batch?.type!=='MATERIAL')throw new RangeError('Datos inválidos');
  const checked=validateBatch(batch);
  const data={date:checked.date,period:checked.period,students:checked.students.map(b=>({studentId:b.studentId,confirmInactive:b.confirmInactive===true,items:b.items.map(i=>{
    if(i.zeroPriceReason!=null&&(typeof i.zeroPriceReason!=='string'||i.zeroPriceReason.length>500))throw new RangeError('Motivo inválido');
    const [w,f='']=i.unitPrice.split('.');return {materialId:i.materialId.toLowerCase(),name:i.name,quantity:i.quantity,unitPriceCents:(BigInt(w)*100n+BigInt(f.padEnd(2,'0'))).toString(),subtotalCents:i.subtotalCents.toString(),zeroPriceReason:i.zeroPriceReason?.trim()||null};
  })}))};
  const client=transactionClient??await pool.connect();try{
    if(!transactionClient)await client.query('BEGIN');
    const auth=await client.query("SELECT u.id,p.access_level FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN admin_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password AND p.active FOR SHARE OF u,s,p",[createHash('sha256').update(actorToken).digest('hex')]);
    if(!auth.rowCount)throw new MaterialBatchError('FORBIDDEN','Operación no autorizada');
    const actor=auth.rows[0].id;const fingerprint=createHash('sha256').update(JSON.stringify({actor,data})).digest('hex');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('suyai-material-batch:' || $1::text,0))",[idempotencyKey.toLowerCase()]);
    const prior=await client.query('SELECT id,request_fingerprint FROM material_batches WHERE idempotency_key=$1',[idempotencyKey]);
    if(prior.rowCount){if(prior.rows[0].request_fingerprint!==fingerprint)throw new MaterialBatchError('IDEMPOTENCY','Clave de idempotencia usada con otros datos');if(!transactionClient)await client.query('COMMIT');return {id:prior.rows[0].id,replayed:true};}
    const ids=data.students.map(x=>x.studentId).sort();const profiles=await client.query('SELECT user_id,active FROM student_profiles WHERE user_id=ANY($1::uuid[]) ORDER BY user_id FOR SHARE',[ids]);
    if(profiles.rowCount!==ids.length)throw new MaterialBatchError('STUDENT','Alumna inexistente');const active=new Map(profiles.rows.map(x=>[x.user_id,x.active]));
    for(const b of data.students)if(!active.get(b.studentId)&&!b.confirmInactive)throw new MaterialBatchError('INACTIVE','Confirmá el cargo para la alumna inactiva');
    const materialIds=[...new Set(data.students.flatMap(b=>b.items.map(i=>i.materialId)))].sort();
    const materials=await client.query('SELECT id,name,unit,custom_unit,active,price_cents::text FROM materials WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE',[materialIds]);
    if(materials.rowCount!==materialIds.length||materials.rows.some(m=>!m.active))throw new MaterialBatchError('MATERIAL','Algún material ya no está disponible');
    const lookup=new Map(materials.rows.map(m=>[m.id,m]));
    for(const b of data.students)for(const i of b.items){if(lookup.get(i.materialId).name!==i.name)throw new MaterialBatchError('MATERIAL','El material cambió; volvé a seleccionarlo');if(auth.rows[0].access_level!=='PRINCIPAL'&&lookup.get(i.materialId).price_cents!==i.unitPriceCents)throw new MaterialBatchError('PRICE','El precio cambió; volvé a seleccionar el material');}
    const id=(await client.query('INSERT INTO material_batches(consumption_date,billing_period,actor_id,idempotency_key,request_fingerprint) VALUES ($1,$2,$3,$4,$5) RETURNING id',[data.date,`${data.period}-01`,actor,idempotencyKey,fingerprint])).rows[0].id;
    for(const b of data.students){await client.query('INSERT INTO material_batch_students(batch_id,student_id,inactive_confirmed) VALUES ($1,$2,$3)',[id,b.studentId,!active.get(b.studentId)&&b.confirmInactive]);for(const i of b.items){const m=lookup.get(i.materialId);const charge=(await client.query("INSERT INTO charges(student_id,category,amount_cents,description) VALUES ($1,'MATERIAL',$2,$3) RETURNING id",[b.studentId,i.subtotalCents,i.name])).rows[0].id;await client.query('INSERT INTO material_batch_items(batch_id,student_id,material_id,charge_id,name,unit,quantity,unit_price_cents,subtotal_cents,zero_price_reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,b.studentId,i.materialId,charge,i.name,m.unit==='CUSTOM'?m.custom_unit:m.unit,i.quantity,i.unitPriceCents,i.subtotalCents,i.zeroPriceReason]);}}
    if(!transactionClient)await client.query('COMMIT');return {id,replayed:false};
  }catch(error){if(!transactionClient)await client.query('ROLLBACK');throw error;}finally{if(!transactionClient)client.release();}
}
