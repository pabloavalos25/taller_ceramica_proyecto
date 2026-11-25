import {generatePeriod} from './generate.mjs';
import {reconcileTierFees} from './sync-tiers.mjs';

// Called only after a user session has been verified by the application.
export async function ensureTierGeneration(pool){
  const result=await pool.query(`WITH bounds AS (SELECT min(effective_period) AS first_period,date_trunc('month',statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS current_period FROM fee_tier_schedules),
    periods AS (SELECT generate_series(first_period,current_period,interval '1 month')::date AS period FROM bounds WHERE first_period<=current_period)
    SELECT to_char(p.period,'YYYY-MM') AS period,NOT EXISTS(SELECT 1 FROM fee_generation_runs r WHERE r.period=p.period) AS missing,(p.period=(SELECT current_period FROM bounds)) AS current FROM periods p ORDER BY p.period LIMIT 1201`);
  if(result.rows.length>1200)throw new Error('El rango de generación de cuotas requiere revisión');
  for(const row of result.rows)if(row.missing||row.current)await generatePeriod(pool,row.period);
  if(result.rows.length)await reconcileTierFees(pool);
}
