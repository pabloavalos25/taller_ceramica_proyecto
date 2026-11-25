import pg from 'pg';
import {createFeeCronHandler} from '../../../../src/fees/cron.mjs';
import {runGeneration} from '../../../../src/fees/run-generation.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
 const {DATABASE_URL,FEE_WORKER_ENABLED,FEE_GENERATION_START,CRON_SECRET}=process.env;
 const handler=createFeeCronHandler({enabled:FEE_WORKER_ENABLED==='true'&&Boolean(DATABASE_URL),secret:CRON_SECRET,startPeriod:FEE_GENERATION_START,run:async period=>{
  const pool=new pg.Pool({connectionString:DATABASE_URL,max:2,connectionTimeoutMillis:5000});
  try{return await runGeneration(pool,period);}finally{await pool.end();}
 }});
 return handler(request);
}
