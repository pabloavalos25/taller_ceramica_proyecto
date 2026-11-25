import {webAuthHandlers,unavailable} from '../../../../src/auth/web.mjs';
import {databaseEndpoint} from '../../../../src/auth/database-location.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
  const handlers=webAuthHandlers();if(!handlers)return unavailable();
  const response=await handlers.session(request);
  if(response.status===401)return Response.json({error:'Ingresá con tu cuenta administradora.'},{status:401,headers:{'Cache-Control':'no-store'}});
  if(!response.ok)return unavailable();
  const session=await response.json();
  if(session.role!=='ADMIN'||session.mustChangePassword)return Response.json({error:'Operación no autorizada.'},{status:403,headers:{'Cache-Control':'no-store'}});
  return Response.json({servidor_neon:databaseEndpoint(process.env.DATABASE_URL)},{headers:{'Cache-Control':'no-store'}});
}
