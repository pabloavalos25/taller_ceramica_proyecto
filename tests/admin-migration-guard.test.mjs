import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('role migration script refuses without explicit confirmation and credentials',()=>{
 const env={...process.env};delete env.CONFIRM_ADMIN_ROLE_MIGRATION;delete env.DATABASE_URL;delete env.PRINCIPAL_ADMIN_EMAIL;delete env.PRINCIPAL_ADMIN_NAME;
 const result=spawnSync(process.execPath,['scripts/migrate-admin-roles.mjs'],{env,encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/No se realizaron cambios/);
});
