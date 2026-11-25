import {createHash} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class MaterialError extends Error{constructor(code,message){super(message);this.code=code;}}
const nonempty=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=max;
function normalize(m){
  if(!m||!nonempty(m.name,200)||!nonempty(m.category,120)||!(m.description===null||typeof m.description==='string'&&m.description.length<=2000)||!['UNIT','G','KG','ML','L','CUSTOM'].includes(m.unit)||(m.unit==='CUSTOM'?!nonempty(m.customUnit,80):m.customUnit!==null)||typeof m.priceCents!=='bigint'||m.priceCents<0n||m.priceCents>9223372036854775807n||typeof m.active!=='boolean')throw new RangeError('Datos del material inválidos');
  return {name:m.name.trim(),category:m.category.trim(),description:m.description?.trim()||null,unit:m.unit,customUnit:m.unit==='CUSTOM'?m.customUnit.trim():null,priceCents:m.priceCents.toString(),active:m.active};
}
async function withActor(pool,token,fn){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new MaterialError('FORBIDDEN','Operación no autorizada');
  const client=await pool.connect();try{
    await client.query('BEGIN');
    const actor=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password FOR SHARE OF u,s",[createHash('sha256').update(token).digest('hex')]);
    if(!actor.rowCount)throw new MaterialError('FORBIDDEN','Operación no autorizada');
    const result=await fn(client,actor.rows[0].id);await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function saveMaterial(pool,{actorToken,idempotencyKey,materialId=null,expectedVersion=null,material}){
  if(typeof idempotencyKey!=='string'||!uuid.test(idempotencyKey)||(materialId!==null&&(typeof materialId!=='string'||!uuid.test(materialId)||!Number.isInteger(expectedVersion)||expectedVersion<1))||(materialId===null&&expectedVersion!==null))throw new RangeError('Datos inválidos');
  const data=normalize(material);
  return withActor(pool,actorToken,async(client,actorId)=>{
    const fingerprint=createHash('sha256').update(JSON.stringify({actorId,materialId:materialId?.toLowerCase()??null,expectedVersion,data})).digest('hex');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('suyai-material:' || $1::text,0))",[idempotencyKey.toLowerCase()]);
    const previous=await client.query('SELECT material_id,request_fingerprint FROM material_events WHERE idempotency_key=$1',[idempotencyKey]);
    if(previous.rowCount){if(previous.rows[0].request_fingerprint!==fingerprint)throw new MaterialError('IDEMPOTENCY','Clave de idempotencia utilizada con otros datos');return {id:previous.rows[0].material_id,replayed:true};}
    let id,old=null;
    if(materialId){
      const found=await client.query('SELECT id,name,category,description,unit,custom_unit AS "customUnit",price_cents::text AS "priceCents",active,version FROM materials WHERE id=$1 FOR UPDATE',[materialId]);
      if(!found.rowCount)throw new MaterialError('MATERIAL','Material inexistente');
      old=found.rows[0];if(old.version!==expectedVersion)throw new MaterialError('VERSION','El material fue actualizado. Volvé a consultarlo.');
      id=old.id;
      await client.query('UPDATE materials SET name=$1,category=$2,description=$3,unit=$4,custom_unit=$5,price_cents=$6,active=$7,version=version+1 WHERE id=$8',[data.name,data.category,data.description,data.unit,data.customUnit,data.priceCents,data.active,id]);
    }else{
      id=(await client.query('INSERT INTO materials(name,category,description,unit,custom_unit,price_cents,active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',[data.name,data.category,data.description,data.unit,data.customUnit,data.priceCents,data.active])).rows[0].id;
    }
    await client.query('INSERT INTO material_events(material_id,actor_id,previous_data,new_data,idempotency_key,request_fingerprint) VALUES ($1,$2,$3,$4,$5,$6)',[id,actorId,old?JSON.stringify(old):null,JSON.stringify(data),idempotencyKey,fingerprint]);
    return {id,replayed:false};
  });
}
export async function listMaterials(pool,{actorToken,search='',active='ALL',offset=0}={}){
  if(typeof search!=='string'||search.length>200||!['ALL','ACTIVE','INACTIVE'].includes(active)||!Number.isInteger(offset)||offset<0||offset>100000)throw new RangeError('Filtro inválido');
  return withActor(pool,actorToken,async client=>{
    const result=await client.query(`SELECT id,name,category,description,unit,custom_unit AS "customUnit",price_cents::text AS "priceCents",active,version FROM materials WHERE (strpos(lower(name),lower($1))>0 OR strpos(lower(category),lower($1))>0) AND ($2='ALL' OR active=($2='ACTIVE')) ORDER BY lower(name),id LIMIT 51 OFFSET $3`,[search.trim(),active,offset]);
    return {items:result.rows.slice(0,50),hasMore:result.rowCount>50};
  });
}
