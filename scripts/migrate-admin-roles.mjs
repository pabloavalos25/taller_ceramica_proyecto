import {readdir,readFile} from 'node:fs/promises';
import pg from 'pg';
import {applyMigrations} from '../src/db/migrate.mjs';
import {provisionPrincipalInTransaction} from '../src/auth/admin-management.mjs';

// This command changes a real database if DATABASE_URL points to one. Do not run
// it until the owner has reviewed the migration, verified a backup and approved.
if(process.env.CONFIRM_ADMIN_ROLE_MIGRATION!=='yes'||!process.env.DATABASE_URL||!process.env.PRINCIPAL_ADMIN_EMAIL||!process.env.PRINCIPAL_ADMIN_NAME){
 console.error('Falta confirmación explícita o configuración requerida. No se realizaron cambios.');process.exitCode=1;
}else{
 const client=new pg.Client({connectionString:process.env.DATABASE_URL});
 try{
  const dir=new URL('../db/migrations/',import.meta.url);
  const names=(await readdir(dir)).filter(name=>name.endsWith('.sql')&&name<='025_admin_profiles.sql').sort();
  const migrations=await Promise.all(names.map(async name=>({name,sql:await readFile(new URL(name,dir),'utf8')})));
  if(names.length!==25||names.at(-1)!=='025_admin_profiles.sql')throw Error('Conjunto de migraciones inesperado');
  await client.connect();
  const applied=await applyMigrations(client,migrations,{
   beforeApply(existing){if(![24,25].includes(existing.length)||existing[23]?.name!=='024_fee_tier_schedules.sql')throw Error('La base debe estar verificada hasta migración 024');},
   afterApply:db=>provisionPrincipalInTransaction(db,{email:process.env.PRINCIPAL_ADMIN_EMAIL,displayName:process.env.PRINCIPAL_ADMIN_NAME}),
  });
  console.log(applied.length?'Migración y vínculo de administradora confirmados.':'Migración y vínculo ya estaban configurados.');
 }catch{console.error('No se pudo completar la migración atómica. No se confirmaron cambios.');process.exitCode=1;}
 finally{await client.end();}
}
