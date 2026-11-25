import { dueDateForPeriod } from './due-date.mjs';

// Internal scheduler only: never expose to untrusted callers without authorization.
export async function generatePeriod(pool, period) {
  if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || period.startsWith('0000')) throw new RangeError('Período inválido');
  const [year,month] = period.split('-').map(Number);
  const date = `${period}-01`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!(await client.query('SELECT id FROM fee_price_lock WHERE id=true FOR UPDATE')).rowCount) throw new Error('Falta bloqueo de configuración de cuotas');
    const now = (await client.query("SELECT to_char(date_trunc('month',statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires'),'YYYY-MM') AS period")).rows[0].period;
    if (period > now) throw new RangeError('No se generan cuotas de períodos futuros');
    const price = (await client.query('SELECT amount_cents::text AS amount FROM fee_price_history WHERE effective_period <= $1::date ORDER BY effective_period DESC,id DESC LIMIT 1',[date])).rows[0];
    const settings = (await client.query('SELECT due_day FROM fee_due_day_history WHERE effective_period <= $1::date ORDER BY effective_period DESC,id DESC LIMIT 1',[date])).rows[0];
    if (!price || !settings) throw new Error('Falta configuración histórica del valor o vencimiento');
    const dueDate = dueDateForPeriod(year,month,settings.due_day,'MAX_28');
    await client.query('SELECT user_id FROM student_profiles ORDER BY user_id FOR UPDATE');
    const unknown = await client.query(`
      SELECT p.user_id FROM student_profiles p
      WHERE NOT EXISTS (SELECT 1 FROM student_creation_events ce WHERE ce.student_id=p.user_id)
         OR NOT EXISTS (SELECT 1 FROM student_fee_preferences fp WHERE fp.student_id=p.user_id)
         OR (SELECT COUNT(*) FROM student_status_history sh WHERE sh.student_id=p.user_id) <> 1 + (SELECT COUNT(*) FROM student_status_change_events ev WHERE ev.student_id=p.user_id)
         OR p.active IS DISTINCT FROM (SELECT sh.active FROM student_status_history sh WHERE sh.student_id=p.user_id ORDER BY sh.id DESC LIMIT 1)
         OR (SELECT array_agg(sh.active ORDER BY sh.id) FROM student_status_history sh WHERE sh.student_id=p.user_id) IS DISTINCT FROM
            (ARRAY[(SELECT sh.active FROM student_status_history sh WHERE sh.student_id=p.user_id ORDER BY sh.id LIMIT 1)] || ARRAY(SELECT ev.new_active FROM student_status_change_events ev WHERE ev.student_id=p.user_id ORDER BY ev.id))
         OR EXISTS (SELECT 1 FROM student_status_change_events ev JOIN student_creation_events ce ON ce.student_id=ev.student_id WHERE ev.student_id=p.user_id AND ev.occurred_at < ce.occurred_at)
      LIMIT 1`);
    if (unknown.rowCount) throw new Error('Historial de alumna incompleto; requiere revisión');
    const eligible = await client.query(`
      WITH bounds AS (
        SELECT $1::date AS month_start, ($1::date + interval '1 month')::date AS next_month,
          ($1::date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AS start_at,
          (($1::date + interval '1 month')::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AS end_at
      )
      SELECT p.user_id FROM student_profiles p
      JOIN student_creation_events created ON created.student_id=p.user_id
      JOIN student_fee_preferences pref ON pref.student_id=p.user_id
      CROSS JOIN bounds b
      CROSS JOIN LATERAL (SELECT sh.active FROM student_status_history sh WHERE sh.student_id=p.user_id ORDER BY sh.id LIMIT 1) initial
      LEFT JOIN LATERAL (SELECT ev.new_active,ev.fee_start_period FROM student_status_change_events ev WHERE ev.student_id=p.user_id AND ev.occurred_at < b.start_at ORDER BY ev.occurred_at DESC,ev.id DESC LIMIT 1) prior ON true
      WHERE created.occurred_at < b.end_at AND p.enrolled_on < b.next_month AND p.enrolled_on <= (statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AND pref.start_period <= b.month_start
      AND (
        (created.occurred_at < b.start_at AND COALESCE(prior.new_active,initial.active) AND COALESCE(prior.fee_start_period,pref.start_period) <= b.month_start)
        OR (created.occurred_at >= b.start_at AND initial.active AND pref.start_period <= b.month_start)
        OR EXISTS (SELECT 1 FROM student_status_change_events ev WHERE ev.student_id=p.user_id AND ev.new_active AND ev.occurred_at >= b.start_at AND ev.occurred_at < b.end_at AND ev.fee_start_period <= b.month_start)
      ) ORDER BY p.user_id`, [date]);
    let created=0;
    for (const row of eligible.rows) {
      const inserted=await client.query('INSERT INTO monthly_fees(student_id,period_year,period_month,original_cents,due_date) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (student_id,period_year,period_month) DO NOTHING RETURNING id',[row.user_id,year,month,price.amount,dueDate]);
      if (inserted.rowCount) {
        await client.query("INSERT INTO charges(student_id,category,monthly_fee_id,amount_cents,description) VALUES ($1,'FEE',$2,$3,$4)",[row.user_id,inserted.rows[0].id,price.amount,`Cuota ${period}`]);
        created++;
      } else {
        const existing=await client.query('SELECT 1 FROM monthly_fees f JOIN charges c ON c.monthly_fee_id=f.id AND c.student_id=f.student_id WHERE f.student_id=$1 AND f.period_year=$2 AND f.period_month=$3',[row.user_id,year,month]);
        if (!existing.rowCount) throw new Error('Cuota sin cargo asociado; requiere revisión');
      }
    }
    await client.query('INSERT INTO fee_generation_runs(period,total_created,last_created) VALUES ($1,$2::integer,$2::integer) ON CONFLICT (period) DO UPDATE SET total_created=fee_generation_runs.total_created+EXCLUDED.last_created,last_created=EXCLUDED.last_created,last_completed_at=clock_timestamp()',[date,created]);
    await client.query('COMMIT');
    return { period, created };
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
