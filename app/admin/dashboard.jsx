'use client';
import {useEffect,useState} from 'react';
import FinancialSummary from './financial-summary';
import LogoutButton from './logout-button';

const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const links=[['Alumnas','/admin/alumnas'],['Cuotas','/admin/cuotas'],['Hornos','/admin/hornos'],['Materiales e insumos','/admin/materiales'],['Pagos','/admin/pagos'],['Borradores','/admin/borradores'],['Configuración','/admin/configuracion']];
export default function Dashboard(){
  const [menuOpen,setMenuOpen]=useState(false);
  const [data,setData]=useState(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{const controller=new AbortController(); async function load(){
    try {setError(false);const filters=[{status:'ACTIVE'},{status:'INACTIVE'},{status:'ACTIVE',economic:'DEBT'},...days.map((_,i)=>({status:'ACTIVE',weekday:String(i+1)}))];
      const results=await Promise.all(filters.map(async filter=>{const params=new URLSearchParams({...filter,limit:'1'});const response=await fetch(`/api/admin/students?${params}`,{signal:controller.signal,cache:'no-store'});if(response.status===401||response.status===403){window.location.replace('/');throw Error('session');}if(!response.ok)throw Error('load');return (await response.json()).total;}));
      setData({active:results[0],inactive:results[1],debt:results[2],days:results.slice(3)});
    }catch(e){if(e.name!=='AbortError')setError(true);}}
    load();return()=>controller.abort();},[retry]);
  const max=Math.max(1,...(data?.days||[]));
  return <div className="dash-layout"><aside className="dash-side"><div className="dash-brand"><img src="/logo.png" alt="Logo de SUYAI"/><div><strong>SUYAI</strong><small>Multiespacio cultural</small></div></div><span className="dash-eyebrow">Administración</span><button type="button" className="mobile-nav-toggle" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>Menú <span aria-hidden="true">{menuOpen?"−":"+"}</span></button><nav className={menuOpen?"mobile-nav-open":""} aria-label="Secciones administrativas"><strong aria-current="page">Inicio</strong>{links.map(([label,href])=><a key={href} href={href}>{label}</a>)}<LogoutButton/></nav></aside><div><header className="dash-top"><span>SUYAI · Administración</span></header><main className="dash-main"><span className="dash-eyebrow">Gestión del taller</span><h1>Bienvenida a SUYAI</h1><p className="dash-muted">Un vistazo a la actividad de tu taller.</p>{error?<div className="dash-card" role="alert"><p>No pudimos cargar el resumen.</p><button onClick={()=>setRetry(n=>n+1)}>Reintentar</button></div>:!data?<p role="status">Cargando resumen…</p>:<><div className="dash-cards"><section className="dash-card"><span>Alumnas activas</span><strong>{data.active}</strong><small>Inscripciones activas</small></section><section className="dash-card"><span>Alumnas inactivas</span><strong>{data.inactive}</strong><small>Inscripciones conservadas</small></section><section className="dash-card"><span>Con saldo pendiente</span><strong>{data.debt}</strong><small>Alumnas activas con deuda o pago parcial</small></section></div><section className="dash-card dash-days"><h2>Alumnas por día</h2><p className="dash-muted">Inscripciones activas</p>{days.map((day,i)=><div className="dash-day" key={day}><span>{day}</span><span className="dash-track"><span style={{width:`${data.days[i]/max*100}%`}}/></span><strong>{data.days[i]}</strong></div>)}</section></>}<FinancialSummary/><section className="dash-card"><h2>Accesos rápidos</h2><div className="dash-quick">{links.map(([label,href])=><a href={href} key={href}>{label} <span aria-hidden="true">→</span></a>)}</div></section></main></div></div>;
}
