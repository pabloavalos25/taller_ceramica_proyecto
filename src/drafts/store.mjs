import {createHash} from 'node:crypto';
import {saveKilnBatch} from '../batches/kiln-batches.mjs';
import {saveMaterialBatch} from '../materials/batches.mjs';
import {materialBatchPayload} from '../materials/batch-input.mjs';
import {parseArsCents} from '../fees/amounts.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class DraftError extends Error{constructor(code,message){super(message);this.code=code;}}
async function authorized(pool,token,fn){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new DraftError('FORBIDDEN','Operación no autorizada');const client=await pool.connect();try{
  await client.query('BEGIN');const actor=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password FOR SHARE OF u,s",[createHash('sha256').update(token).digest('hex')]);if(!actor.rowCount)throw new DraftError('FORBIDDEN','Operación no autorizada');
  const result=await fn(client,actor.rows[0].id);await client.query('COMMIT');return result;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function saveDraft(pool,{actorToken,draftId,type,expectedVersion,idempotencyKey,data}){
 if(![draftId,idempotencyKey].every(x=>typeof x==='string'&&uuid.test(x))||!['KILN','MATERIAL'].includes(type)||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||expectedVersion>=2147483647||!data||typeof data!=='object'||Array.isArray(data))throw new RangeError('Datos del borrador inválidos');
 let payload;try{payload=JSON.stringify(data);}catch{throw new RangeError('Datos del borrador inválidos');}if(!payload||Buffer.byteLength(payload)>1048576)throw new RangeError('Borrador demasiado extenso');
 return authorized(pool,actorToken,async(client,actorId)=>{
  const fingerprint=createHash('sha256').update(JSON.stringify({actorId,draftId:draftId.toLowerCase(),type,expectedVersion,data})).digest('hex');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('suyai-draft-operation:' || $1::text,0))",[idempotencyKey.toLowerCase()]);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('suyai-draft:' || $1::text,0))",[draftId.toLowerCase()]);
  const existing=await client.query('SELECT kind,version,status FROM shared_drafts WHERE id=$1 FOR UPDATE',[draftId]);
  if(existing.rowCount&&existing.rows[0].status==='CONFIRMED')throw new DraftError('CONFIRMED','El borrador ya fue confirmado.');
  const previous=await client.query('SELECT draft_id,request_fingerprint,result_version FROM shared_draft_events WHERE idempotency_key=$1',[idempotencyKey]);
  if(previous.rowCount){if(previous.rows[0].request_fingerprint!==fingerprint)throw new DraftError('IDEMPOTENCY','La clave pertenece a otra operación');return {id:previous.rows[0].draft_id,version:previous.rows[0].result_version,replayed:true};}
  if((!existing.rowCount&&expectedVersion!==0)||(existing.rowCount&&(expectedVersion===0||existing.rows[0].version!==expectedVersion||existing.rows[0].kind!==type)))throw new DraftError('VERSION','El borrador cambió. Recargá antes de guardar.');
  const version=expectedVersion+1;
  if(!existing.rowCount)await client.query('INSERT INTO shared_drafts(id,kind,data,version,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$5)',[draftId,type,payload,version,actorId]);
  else await client.query('UPDATE shared_drafts SET data=$1,version=$2,updated_by=$3,updated_at=now() WHERE id=$4',[payload,version,actorId,draftId]);
  await client.query('INSERT INTO shared_draft_events(draft_id,actor_id,idempotency_key,request_fingerprint,result_version) VALUES ($1,$2,$3,$4,$5)',[draftId,actorId,idempotencyKey,fingerprint,version]);return {id:draftId.toLowerCase(),version,replayed:false};
 });
}
export async function getDraft(pool,{actorToken,draftId}){
 if(typeof draftId!=='string'||!uuid.test(draftId))throw new RangeError('Identificador inválido');
 return authorized(pool,actorToken,async client=>{const r=await client.query('SELECT id,kind AS type,data,version,status,confirmed_batch_id AS "confirmedBatchId",updated_at AS "updatedAt" FROM shared_drafts WHERE id=$1',[draftId]);return r.rows[0]??null;});
}
export async function listDrafts(pool,{actorToken,type,offset=0}){
 if(!['KILN','MATERIAL'].includes(type)||!Number.isInteger(offset)||offset<0||offset>100000)throw new RangeError('Filtros inválidos');
 return authorized(pool,actorToken,async client=>{const r=await client.query("SELECT d.id,d.kind AS type,d.version,d.data->>'reference' AS reference,d.updated_at AS \"updatedAt\",u.email AS \"updatedBy\" FROM shared_drafts d JOIN users u ON u.id=d.updated_by WHERE d.kind=$1 AND d.status='OPEN' ORDER BY d.updated_at DESC,d.id DESC LIMIT 51 OFFSET $2",[type,offset]);return {items:r.rows.slice(0,50),hasMore:r.rowCount>50};});
}
function kilnPayload(form){
 if(!form||!Array.isArray(form.students))throw new RangeError('Revisá los datos del borrador.');
 return {type:'KILN',date:form.date,period:form.period,reference:form.reference,notes:form.notes,students:form.students.map(block=>({studentId:block.id,confirmInactive:block.confirmInactive===true,items:block.items.map(({price,...item})=>{const cents=BigInt(parseArsCents(price));return {...item,unitPrice:`${cents/100n}.${String(cents%100n).padStart(2,'0')}`};})}))};
}
export async function confirmDraft(pool,{actorToken,draftId,expectedVersion,idempotencyKey}){
 if(![draftId,idempotencyKey].every(x=>typeof x==='string'&&uuid.test(x))||!Number.isSafeInteger(expectedVersion)||expectedVersion<1||expectedVersion>=2147483647)throw new RangeError('Datos del borrador inválidos');
 return authorized(pool,actorToken,async(client,actorId)=>{
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('suyai-draft:' || $1::text,0))",[draftId.toLowerCase()]);
  const r=await client.query('SELECT kind,data,version,status,confirmed_batch_id,confirmed_by,confirmation_key FROM shared_drafts WHERE id=$1 FOR UPDATE',[draftId]);if(!r.rowCount)throw new DraftError('DRAFT','Borrador inexistente');const draft=r.rows[0];
  if(draft.status==='CONFIRMED'){if(draft.confirmation_key===idempotencyKey.toLowerCase()&&draft.confirmed_by===actorId&&draft.version===expectedVersion)return {batchId:draft.confirmed_batch_id,replayed:true};throw new DraftError('CONFIRMED','El borrador ya fue confirmado.');}
  if(draft.version!==expectedVersion)throw new DraftError('VERSION','El borrador cambió. Recargá antes de confirmar.');
  const batch=draft.kind==='MATERIAL'?materialBatchPayload(draft.data):kilnPayload(draft.data);
  const save=draft.kind==='MATERIAL'?saveMaterialBatch:saveKilnBatch;const result=await save(pool,{actorToken,idempotencyKey,batch},client);
  if(result.replayed)throw new DraftError('IDEMPOTENCY','La clave pertenece a otra carga.');
  await client.query("UPDATE shared_drafts SET status='CONFIRMED',confirmed_batch_id=$1,confirmed_by=$2,confirmation_key=$3,updated_at=now() WHERE id=$4",[result.id,actorId,idempotencyKey,draftId]);return {batchId:result.id,replayed:false};
 });
}
