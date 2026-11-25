import {webAuthHandlers,unavailable} from '../../../../src/auth/web.mjs';
import {databaseEndpoint} from '../../../../src/auth/database-location.mjs';
import pg from 'pg';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
  const handlers=webAuthHandlers();if(!handlers)return unavailable();
  const response=await handlers.session(request);
  if(response.status===401)return Response.json({error:'Ingresá con tu cuenta administradora.'},{status:401,headers:{'Cache-Control':'no-store'}});
  if(!response.ok)return unavailable();
  const session=await response.json();
  if(session.role!=='ADMIN'||session.mustChangePassword)return Response.json({error:'Operación no autorizada.'},{status:403,headers:{'Cache-Control':'no-store'}});
  const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
  try {
    await client.connect();
    const result=await client.query(`SELECT current_database() AS base, current_schema() AS esquema,
      to_regclass('student_profiles') IS NOT NULL AS tiene_alumnas,
      EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('student_profiles') AND attname='branch' AND NOT attisdropped) AS tiene_sede`);
    return Response.json({servidor_neon:databaseEndpoint(process.env.DATABASE_URL),...result.rows[0]},{headers:{'Cache-Control':'no-store'}});
  } catch { return Response.json({error:'No se pudo consultar la estructura de la base.'},{status:503,headers:{'Cache-Control':'no-store'}}); }
  finally {await client.end().catch(()=>{});}
}
