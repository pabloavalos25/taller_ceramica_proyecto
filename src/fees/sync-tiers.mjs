import {feeAmountForDate} from './fee-tiers.mjs';

// The caller must already hold an authorized database transaction.
export async function syncFeeTiers(client,{asOf,studentId=null,chargeIds=null}={}){
  if(asOf===undefined)asOf=(await client.query("SELECT to_char(statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYY-MM-DD') AS today")).rows[0].today;
  if(typeof asOf!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(asOf))throw new RangeError('Fecha inválida');
  const fees=await client.query(`SELECT c.id AS charge_id,c.student_id,c.amount_cents::text AS amount,f.id AS fee_id,to_char(make_date(f.period_year,f.period_month,1),'YYYY-MM') AS period,s.id::text AS schedule_id,
    (SELECT jsonb_agg(jsonb_build_object('startDay',r.start_day,'amountCents',r.amount_cents::text) ORDER BY r.start_day) FROM fee_tier_rules r WHERE r.schedule_id=s.id) AS tiers
    FROM charges c JOIN monthly_fees f ON f.id=c.monthly_fee_id AND f.student_id=c.student_id
    JOIN LATERAL (SELECT id FROM fee_tier_schedules WHERE effective_period<=make_date(f.period_year,f.period_month,1) ORDER BY effective_period DESC,id DESC LIMIT 1) s ON true
    WHERE c.category='FEE' AND make_date(f.period_year,f.period_month,1)<=$1::date AND ($2::uuid IS NULL OR c.student_id=$2) AND ($3::uuid[] IS NULL OR c.id=ANY($3::uuid[]))
    ORDER BY c.id FOR UPDATE OF c`,[asOf,studentId,chargeIds]);
  let updated=0;
  for(const fee of fees.rows){
    const state=(await client.query(`SELECT COALESCE((SELECT sum(a.amount_cents) FROM payment_allocations a WHERE a.charge_id=$1 AND NOT EXISTS(SELECT 1 FROM payment_events e WHERE e.payment_id=a.payment_id AND e.event_type='VOIDED')),0)::text AS paid,EXISTS(SELECT 1 FROM fee_adjustments x WHERE x.fee_id=$2) AS manually_adjusted`,[fee.charge_id,fee.fee_id])).rows[0];
    const amount=BigInt(fee.amount),paid=BigInt(state.paid);
    if(paid>amount)continue;
    if(state.manually_adjusted||(paid>0n&&paid===amount))continue;
    const next=BigInt(feeAmountForDate({period:fee.period,date:asOf,tiers:fee.tiers}));
    if(next<=amount)continue;
    await client.query('UPDATE charges SET amount_cents=$1 WHERE id=$2',[next.toString(),fee.charge_id]);
    await client.query('INSERT INTO fee_tier_events(fee_id,charge_id,student_id,schedule_id,previous_cents,new_cents) VALUES ($1,$2,$3,$4,$5,$6)',[fee.fee_id,fee.charge_id,fee.student_id,fee.schedule_id,amount.toString(),next.toString()]);
    updated++;
  }
  return {updated};
}

export async function reconcileTierFees(pool,options={}){
  const client=await pool.connect();
  try{await client.query('BEGIN');const result=await syncFeeTiers(client,options);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
