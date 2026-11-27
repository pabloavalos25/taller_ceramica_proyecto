'use client';
import {useEffect,useState} from 'react';
import {formatArsCents} from '../../src/fees/amounts.mjs';
import IncomeChart from './income-chart';

const date=value=>new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(value));
export default function FinancialSummary({showChart=true}){
  const [data,setData]=useState(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{const controller=new AbortController();setError(false);fetch('/api/admin/summary',{signal:controller.signal,cache:'no-store'}).then(response=>{if(response.status===401||response.status===403){window.location.replace('/');throw Error('session');}if(!response.ok)throw Error('request');return response.json();}).then(setData).catch(e=>{if(e.name!=='AbortError')setError(true);});return()=>controller.abort();},[retry]);
  if(error)return <section className="dash-card" role="alert"><p>No pudimos cargar el resumen económico.</p><button onClick={()=>setRetry(n=>n+1)}>Reintentar</button></section>;
  if(!data)return <p role="status">Cargando resumen económico…</p>;
  return <><div className="dash-cards dash-finance"><section className="dash-card"><span>Ingresos del mes</span><strong>{formatArsCents(data.incomeCents)}</strong><small>Pagos vigentes registrados este mes</small></section><section className="dash-card"><span>Pendiente de cobro</span><strong>{data.inconsistent?'Requiere revisión':formatArsCents(data.outstandingCents)}</strong><small>{data.inconsistent?'Hay saldos que requieren revisión.':'Saldo pendiente de todas las alumnas'}</small></section></div>{showChart&&<IncomeChart months={data.monthlyIncome}/>}<section className="dash-card"><div className="dash-finance-header"><h2>Últimos pagos</h2><a href="/admin/pagos/historial">Ver historial</a></div>{data.recentPayments.length===0?<p className="dash-muted">Todavía no hay pagos registrados.</p>:<div className="dash-table-wrap"><table className="dash-table"><thead><tr><th>Alumna</th><th>Fecha</th><th>Importe</th><th>Estado</th></tr></thead><tbody>{data.recentPayments.map(payment=><tr key={payment.id}><td>{payment.studentName}</td><td>{date(payment.paidAt)}</td><td>{formatArsCents(payment.amountCents)}</td><td>{payment.voided?'Anulado':'Registrado'}</td></tr>)}</tbody></table></div>}</section></>;
}
