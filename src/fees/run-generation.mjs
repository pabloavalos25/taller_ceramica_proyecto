import { periodsBetween } from './periods.mjs';
import { generatePeriod } from './generate.mjs';

// Caller is a trusted scheduler; never expose without administrator authorization.
export async function runGeneration(pool, startPeriod) {
  const current=(await pool.query("SELECT to_char(date_trunc('month',statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires'),'YYYY-MM') AS period")).rows[0].period;
  const periods=periodsBetween(startPeriod,current);
  const result=[];
  for(const period of periods) result.push(await generatePeriod(pool,period));
  return result;
}
