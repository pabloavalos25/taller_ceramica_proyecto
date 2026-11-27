import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
import pg from 'pg';
import {resetAdminPassword} from '../src/auth/reset-admin-password.mjs';

if(!process.stdin.isTTY||!process.stdout.isTTY){
 console.error('Se necesita una terminal interactiva.');process.exitCode=1;
}else{
 let muted=false;
 const output=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk,encoding);done();}});
 const rl=createInterface({input:process.stdin,output,terminal:true});
 const ask=(prompt,secret=false)=>new Promise(resolve=>{if(secret){process.stdout.write(prompt);muted=true;}rl.question(secret?'':prompt,answer=>{if(secret){muted=false;process.stdout.write('\n');}resolve(answer);});});
 let pool;
 try{
  const url=await ask('Pegá la conexión directa de Neon (no se verá): ',true);
  const parsed=new URL(url);
  if(!['postgres:','postgresql:'].includes(parsed.protocol)||!parsed.hostname.endsWith('.neon.tech')||parsed.hostname.includes('-pooler.'))throw Error('Usá la conexión directa de Neon, con Connection pooling desactivado.');
  const email=await ask('Correo de la administradora: ');
  const password=await ask('Nueva contraseña (mínimo 12 caracteres): ',true);
  const confirmation=await ask('Repetí la nueva contraseña: ',true);
  if(password!==confirmation)throw Error('Las contraseñas no coinciden.');
  const approved=await ask('¿Es la base de prueba y querés restablecer esta cuenta? Escribí SI: ');
  if(approved.trim().toUpperCase()!=='SI')throw Error('Operación cancelada.');
  pool=new pg.Pool({connectionString:url,max:1,connectionTimeoutMillis:10000});
  await resetAdminPassword(pool,{email,password});
  console.log('Contraseña de administradora actualizada.');
 }catch(error){
  if(error instanceof RangeError||/^No se encontró el administrador|^Las contraseñas|^Operación cancelada|^Usá la conexión/.test(error.message))console.error(`No se pudo restablecer: ${error.message}`);
  else console.error('No se pudo restablecer. Revisá la conexión directa y volvé a intentar.');
  process.exitCode=1;
 }finally{rl.close();if(pool)await pool.end();}
}
