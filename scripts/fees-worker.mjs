import pg from 'pg';
import { runGeneration } from '../src/fees/run-generation.mjs';

if (process.env.FEE_WORKER_ENABLED !== 'true' || !process.env.DATABASE_URL || !process.env.FEE_GENERATION_START) {
  console.error('Configurá DATABASE_URL y FEE_GENERATION_START, y habilitá FEE_WORKER_ENABLED=true para ejecutar el proceso.');
  process.exitCode=1;
} else if (process.argv.slice(2).some((value)=>value !== '--once') || process.argv.filter((value)=>value==='--once').length > 1) {
  console.error('Opción inválida.'); process.exitCode=1;
} else {
  const intervalSeconds=Number(process.env.FEE_WORKER_INTERVAL_SECONDS ?? '3600');
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 60 || intervalSeconds > 86400) {
    console.error('FEE_WORKER_INTERVAL_SECONDS debe estar entre 60 y 86400.'); process.exitCode=1;
  } else {
    const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
    let stopping=false, wake=null;
    const stop=()=>{ stopping=true; wake?.(); };
    process.once('SIGINT',stop); process.once('SIGTERM',stop);
    try {
      do {
        const results=await runGeneration(pool,process.env.FEE_GENERATION_START);
        console.log(`Cuotas verificadas: ${results.length} períodos; nuevas: ${results.reduce((sum,row)=>sum+row.created,0)}.`);
        if (process.argv.includes('--once') || stopping) break;
        await new Promise((resolve)=>{ const timer=setTimeout(resolve,intervalSeconds*1000); wake=()=>{clearTimeout(timer);resolve();}; });
        wake=null;
      } while(!stopping);
    } catch {
      console.error('No se pudo completar la generación. Revisá configuración y registros operativos antes de reintentar.');
      process.exitCode=1;
    } finally {
      process.removeListener('SIGINT',stop); process.removeListener('SIGTERM',stop);
      await pool.end();
    }
  }
}
