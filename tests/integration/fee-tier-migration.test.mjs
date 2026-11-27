import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import pg from 'pg';
import {applyMigrations} from '../../src/db/migrate.mjs';

test('la migración de tramos instala los valores solicitados y puede repetirse sin duplicarlos',async()=>{
 const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('TEST_DATABASE_URL debe apuntar a una base aislada');
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
 const client=new pg.Client({connectionString:url,options:`-c search_path=${schema}`});await client.connect();
 try{
  const dir=new URL('../../db/migrations/',import.meta.url),names=(await readdir(dir)).filter(name=>name.endsWith('.sql')).sort();
  const migrations=await Promise.all(names.map(async name=>({name,sql:await readFile(new URL(name,dir),'utf8')})));
  const through024=migrations.filter(row=>row.name<='024_fee_tier_schedules.sql');
  const first=await applyMigrations(client,through024);assert.equal(first.at(-1),'024_fee_tier_schedules.sql');assert.deepEqual(await applyMigrations(client,through024),[]);
  const rows=(await client.query("SELECT to_char(s.effective_period,'YYYY-MM') AS period,r.start_day,r.amount_cents::text AS amount FROM fee_tier_schedules s JOIN fee_tier_rules r ON r.schedule_id=s.id ORDER BY r.start_day")).rows;
  assert.deepEqual(rows,[{period:'2026-12',start_day:1,amount:'4500000'},{period:'2026-12',start_day:11,amount:'5000000'},{period:'2026-12',start_day:21,amount:'6000000'},{period:'2026-12',start_day:31,amount:'7500000'}]);
 }finally{await client.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});

test('el bloque manual de Neon aplica 024 y deja el registro compatible con el migrador',async()=>{
 const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('TEST_DATABASE_URL debe apuntar a una base aislada');
 const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
 const client=new pg.Client({connectionString:url,options:`-c search_path=${schema}`});await client.connect();
 try{
  const dir=new URL('../../db/migrations/',import.meta.url),names=(await readdir(dir)).filter(name=>name.endsWith('.sql')).sort();
  const migrations=await Promise.all(names.map(async name=>({name,sql:await readFile(new URL(name,dir),'utf8')})));
  await applyMigrations(client,migrations.filter(row=>row.name<'024_fee_tier_schedules.sql'));
  await client.query(await readFile(new URL('../../docs/migracion-024-cuotas-tramos.sql',import.meta.url),'utf8'));
  assert.deepEqual(await applyMigrations(client,migrations.filter(row=>row.name<='024_fee_tier_schedules.sql')),[]);
  const rules=(await client.query('SELECT count(*)::int AS count FROM fee_tier_rules')).rows[0];assert.equal(rules.count,4);
  await assert.rejects(client.query(await readFile(new URL('../../docs/migracion-024-cuotas-tramos.sql',import.meta.url),'utf8')),/requiere revisión/i);
  await client.query('ROLLBACK');
 }finally{await client.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
