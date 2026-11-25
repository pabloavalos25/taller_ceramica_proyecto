import {createHash,timingSafeEqual} from 'node:crypto';

const json=(body,status)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function createFeeCronHandler({enabled,secret,startPeriod,run}){
 return async request=>{
  if(!enabled||typeof secret!=='string'||!/^[A-Za-z0-9_-]{32,256}$/.test(secret)||typeof startPeriod!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(startPeriod)||typeof run!=='function')return json({error:'Servicio no disponible'},503);
  const presented=request.headers.get('authorization')??'';
  const digest=value=>createHash('sha256').update(value).digest();
  if(!timingSafeEqual(digest(presented),digest(`Bearer ${secret}`)))return json({error:'No autorizado'},401);
  try{const results=await run(startPeriod);return json({periods:results.length,created:results.reduce((total,row)=>total+row.created,0)},200);}
  catch{return json({error:'No se pudo completar la generación'},503);}
 };
}
