import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import pg from 'pg';
import {applyMigrations} from '../../src/db/migrate.mjs';
import {provisionPrincipalInTransaction} from '../../src/auth/admin-management.mjs';
const url=process.env.TEST_DATABASE_URL;if(!url)throw new Error('TEST_DATABASE_URL debe apuntar a base aislada');
test('role migration and principal provisioning commit or roll back together',async()=>{
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
 const db=new pg.Client({connectionString:url,options:`-c search_path=${schema}`});await db.connect();
 try{
  const dir=new URL('../../db/migrations/',import.meta.url),names=(await readdir(dir)).filter(n=>n.endsWith('.sql')).sort();
  const migrations=await Promise.all(names.map(async name=>({name,sql:await readFile(new URL(name,dir),'utf8')})));
  await applyMigrations(db,migrations.filter(m=>m.name<'025'));
  await db.query("INSERT INTO users(email,password_hash,role) VALUES ('a@example.test','hash','ADMIN')");
  await assert.rejects(applyMigrations(db,migrations),/principal/i);
  assert.equal((await db.query("SELECT to_regclass('admin_profiles') AS relation")).rows[0].relation,null);
  const hook=({email})=>client=>provisionPrincipalInTransaction(client,{email,displayName:'Abril'});
  await assert.rejects(applyMigrations(db,migrations,{afterApply:hook({email:'missing@example.test'})}),/no encontrada/i);
  assert.equal((await db.query("SELECT to_regclass('admin_profiles') AS relation")).rows[0].relation,null);
  await applyMigrations(db,migrations,{afterApply:hook({email:'a@example.test'})});
  assert.equal((await db.query("SELECT display_name FROM admin_profiles WHERE access_level='PRINCIPAL'")).rows[0].display_name,'Abril');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM schema_migrations WHERE name='025_admin_profiles.sql'")).rows[0].n,1);
 }finally{await db.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
