import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createSession} from '../../src/auth/sessions.mjs';
import {createTeacher,provisionPrincipal} from '../../src/auth/admin-management.mjs';
import {saveMaterial} from '../../src/materials/catalog.mjs';

const url=process.env.TEST_DATABASE_URL;
if(!url)throw new Error('TEST_DATABASE_URL debe apuntar a base aislada');
test('otra administradora obtiene permisos completos y profesores no pueden otorgarlos',async()=>{
  const schema=`suyai_test_${randomUUID().replaceAll('-','')}`;
  const root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
  const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
  try{
    for(const file of ['001_initial.sql','006_auth_sessions.sql','018_material_catalog.sql','025_admin_profiles.sql','026_multiple_admins.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
    const id=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('abril@example.test','hash','ADMIN',false) RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Abril','PRINCIPAL')",[id]);
    const principal=await createSession(pool,id);
    const info={displayName:'Ana',email:'ana@example.test',temporaryPassword:'ClaveTemporal_8264!'};
    const other=await createTeacher(pool,{actorToken:principal,...info,accessLevel:'PRINCIPAL'});
    await assert.rejects(provisionPrincipal(pool,{email:'abril@example.test',displayName:'Abril'}),/múltiples/i);
    await pool.query('UPDATE users SET must_change_password=false WHERE id=$1',[other]);
    const otherToken=await createSession(pool,other);
    const teacher=await createTeacher(pool,{actorToken:otherToken,...info,email:'profe@example.test',accessLevel:'TEACHER'});
    await pool.query('UPDATE users SET must_change_password=false WHERE id=$1',[teacher]);
    const teacherToken=await createSession(pool,teacher);
    await assert.rejects(createTeacher(pool,{actorToken:teacherToken,...info,email:'denegado@example.test',accessLevel:'PRINCIPAL'}),/no autorizada/i);
    const material={name:'Arcilla',category:'Material',description:null,unit:'KG',customUnit:null,priceCents:5000n,active:true};
    await assert.rejects(saveMaterial(pool,{actorToken:teacherToken,idempotencyKey:randomUUID(),material}),/autoriz/i);
    assert.ok((await saveMaterial(pool,{actorToken:otherToken,idempotencyKey:randomUUID(),material})).id);
  }finally{await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
