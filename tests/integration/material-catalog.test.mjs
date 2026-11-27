import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createSession} from '../../src/auth/sessions.mjs';
import {saveMaterial,listMaterials} from '../../src/materials/catalog.mjs';
import {createAuthHandlers} from '../../src/auth/http-handlers.mjs';
const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('TEST_DATABASE_URL debe apuntar a una base aislada');

test('catalog changes are authorized, versioned, auditable and safe to retry',async()=>{
  const schema=`suyai_test_${randomUUID().replaceAll('-','')}`;const root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
  const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
  try{
    for(const file of ['001_initial.sql','006_auth_sessions.sql','018_material_catalog.sql','025_admin_profiles.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
    const admin=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('admin@example.com','hash','ADMIN',false) RETURNING id")).rows[0].id; await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Principal','PRINCIPAL')",[admin]);
    const user=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('ana@example.com','hash','USER') RETURNING id")).rows[0].id;
    const token=await createSession(pool,admin),other=await createSession(pool,user);
    const material={name:'Pasta cerámica',category:'Arcillas',description:'Blanca',unit:'KG',customUnit:null,priceCents:400000n,active:true};
    const request={actorToken:token,idempotencyKey:randomUUID(),material};
    await assert.rejects(saveMaterial(pool,{...request,actorToken:other}),/autoriz/i);
    await assert.rejects(saveMaterial(pool,{...request,material:{...material,unit:'CUSTOM',customUnit:''}}),RangeError);
    const [first,replayed]=await Promise.all([saveMaterial(pool,request),saveMaterial(pool,request)]);assert.equal(first.id,replayed.id);assert.notEqual(first.replayed,replayed.replayed);
    await assert.rejects(saveMaterial(pool,{...request,material:{...material,priceCents:500000n}}),/idempotencia/i);
    const edit={actorToken:token,idempotencyKey:randomUUID(),materialId:first.id,expectedVersion:1,material:{...material,priceCents:500000n,active:false}};
    await saveMaterial(pool,edit);
    await assert.rejects(saveMaterial(pool,{...edit,idempotencyKey:randomUUID()}),/actualiz/i);
    assert.equal((await listMaterials(pool,{actorToken:token,active:'ACTIVE'})).items.length,0);
    const listing=await listMaterials(pool,{actorToken:token,search:'pasta',active:'ALL'});assert.equal(listing.items[0].priceCents,'500000');assert.equal(listing.items[0].version,2);assert.equal(listing.items[0].active,false);
    const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,listMaterials:input=>listMaterials(pool,input),saveMaterial:input=>saveMaterial(pool,input)});
    const get=session=>new Request('https://suyai.example/api?search=pasta',{headers:{cookie:`__Host-suyai_session=${session}`}});
    assert.equal((await handlers.listMaterials(get(other))).status,403);
    const response=await handlers.listMaterials(get(token));assert.equal(response.status,200);assert.equal((await response.json()).items[0].priceCents,'500000');
    const post=session=>new Request('https://suyai.example/api',{method:'POST',headers:{origin:'https://suyai.example','content-type':'application/json',cookie:`__Host-suyai_session=${session}`},body:JSON.stringify({idempotencyKey:randomUUID(),material:{name:'Engobe',category:'Engobes',description:null,unit:'UNIT',customUnit:null,priceCents:'250000',active:true}})});
    assert.equal((await handlers.saveMaterial(post(other))).status,403);
    assert.equal((await handlers.saveMaterial(post(token))).status,200);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM material_events')).rows[0].count,3);
    await assert.rejects(listMaterials(pool,{actorToken:other}),/autoriz/i);
    const custom={...material,name:'Pigmento',unit:'CUSTOM',customUnit:'frasco',priceCents:0n};
    const created=await saveMaterial(pool,{actorToken:token,idempotencyKey:randomUUID(),material:custom});
    const contenders=await Promise.allSettled([1,2].map(n=>saveMaterial(pool,{actorToken:token,idempotencyKey:randomUUID(),materialId:created.id,expectedVersion:1,material:{...custom,priceCents:BigInt(n)}})));
    assert.equal(contenders.filter(x=>x.status==='fulfilled').length,1);assert.equal(contenders.filter(x=>x.status==='rejected').length,1);
    const before=(await pool.query('SELECT price_cents::text,version FROM materials WHERE id=$1',[created.id])).rows[0];
    await pool.query("CREATE FUNCTION fail_material_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced failure'; END $$");
    await pool.query('CREATE TRIGGER fail_material_event BEFORE INSERT ON material_events FOR EACH ROW EXECUTE FUNCTION fail_material_event()');
    await assert.rejects(saveMaterial(pool,{actorToken:token,idempotencyKey:randomUUID(),materialId:created.id,expectedVersion:2,material:{...custom,priceCents:100n}}),/forced failure/);
    assert.deepEqual((await pool.query('SELECT price_cents::text,version FROM materials WHERE id=$1',[created.id])).rows[0],before);
  }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
