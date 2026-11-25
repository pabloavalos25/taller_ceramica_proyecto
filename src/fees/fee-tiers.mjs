const maxCents=9223372036854775807n;
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!value.startsWith('0000')&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;

export function validateFeeTiers(tiers){
  if(!Array.isArray(tiers)||tiers.length<1||tiers.length>31||tiers[0]?.startDay!==1)throw new RangeError('El primer tramo debe comenzar el día 1');
  let previousDay=0,previousAmount=-1n;
  return tiers.map(({startDay,amountCents}={})=>{
    if(!Number.isInteger(startDay)||startDay<=previousDay||startDay>31)throw new RangeError('Los días deben ser crecientes entre 1 y 31');
    if(typeof amountCents!=='string'||!/^\d+$/.test(amountCents)||amountCents.length>19)throw new RangeError('Importe inválido');
    const amount=BigInt(amountCents);if(amount>maxCents||amount<previousAmount)throw new RangeError('Los importes deben ser crecientes y válidos');
    previousDay=startDay;previousAmount=amount;return {startDay,amountCents:amount.toString()};
  });
}

export function feeAmountForDate({period,date,tiers}){
  if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||period.startsWith('0000')||!validDate(date)||date<`${period}-01`)throw new RangeError('Fecha o período inválido');
  const schedule=validateFeeTiers(tiers);
  const [year,month]=period.split('-').map(Number);
  const last=new Date(0);last.setUTCFullYear(year,month,0);
  const lastDay=last.getUTCDate();
  const day=date.slice(0,7)===period?Number(date.slice(8,10)):lastDay;
  return schedule.filter(tier=>tier.startDay<=day).at(-1).amountCents;
}
