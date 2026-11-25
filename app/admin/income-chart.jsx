import {formatArsCents} from '../../src/fees/amounts.mjs';

const label=period=>{const [year,month]=period.split('-').map(Number);return new Intl.DateTimeFormat('es-AR',{month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)));};
export default function IncomeChart({months}){
  const max=months.reduce((value,month)=>BigInt(month.amountCents)>value?BigInt(month.amountCents):value,0n);
  return <section className="dash-card"><h2>Ingresos mensuales</h2><p className="dash-muted">Pagos vigentes de los últimos seis meses.</p><div className="income-chart" aria-label="Ingresos mensuales">{months.map(month=>{const value=BigInt(month.amountCents);const height=max===0n?0:Number(value*1000n/max)/10;return <div className="income-column" key={month.period}><span className="income-amount">{formatArsCents(month.amountCents)}</span><div className="income-bar-area" aria-hidden="true"><span style={{height:`${height}%`}}/></div><span className="income-label">{label(month.period)}</span></div>;})}</div></section>;
}
