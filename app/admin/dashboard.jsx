'use client';
import {useEffect,useState} from 'react';
import FinancialSummary from './financial-summary';
import LogoutButton from './logout-button';
import {dashboardPresentation} from '../../src/auth/dashboard-identity.mjs';

const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const links=[['Alumnas','/admin/alumnas'],['Cuotas','/admin/cuotas'],['Hornos','/admin/hornos'],['Materiales e insumos','/admin/materiales'],['Pagos','/admin/pagos'],['Borradores','/admin/borradores'],['Configuración','/admin/configuracion']];
export default function Dashboard({displayName,accessLevel}){
  const presentation=dashboardPresentation({displayName,accessLevel});
  const [menuOpen,setMenuOpen]=useState(false);
  const [data,setData]=useState(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{const controller=new AbortController(); async function load(){
    try {setError(false);const response=await fetch('/api/admin/dashboard-counts',{signal:controller.signal,cache:'no-store'});
      if(response.status===401||response.status===403){window.location.replace('/');throw Error('session');}if(!response.ok)throw Error('load');
      setData(await response.json());
    }catch(e){if(e.name!=='AbortError')setError(true);}}
    load();return()=>controller.abort();},[retry]);
  return <div className="dash-layout"><aside className="dash-side"><div className="dash-brand"><img src="/logo.png" alt="Logo de SUYAI"/><div><strong>SUYAI</strong><small>Multiespacio cultural</small></div></div><span className="dash-eyebrow">Administración</span><button type="button" className="mobile-nav-toggle" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>Menú <span aria-hidden="true">{menuOpen?"−":"+"}</span></button><nav className={menuOpen?"mobile-nav-open":""} aria-label="Secciones administrativas"><strong aria-current="page">Inicio</strong>{links.map(([label,href])=><a key={href} href={href}>{label}</a>)}<LogoutButton/></nav></aside><div><header className="dash-top"><span>SUYAI · Administración</span></header><main className="dash-main"><span className="dash-eyebrow">Gestión del taller</span><h1>{presentation.welcome}</h1><p className="dash-muted">Un vistazo a la actividad de tu taller.</p>{error?<div className="dash-card" role="alert"><p>No pudimos cargar el resumen.</p><button onClick={()=>setRetry(n=>n+1)}>Reintentar</button></div>:!data?<p role="status">Cargando resumen…</p>:<><div className="dash-cards"><section className="dash-card"><span>Alumnas activas</span><strong>{data.active}</strong><small>Inscripciones activas</small></section><section className="dash-card"><span>Alumnas inactivas</span><strong>{data.inactive}</strong><small>Inscripciones conservadas</small></section><section className="dash-card"><span>Con saldo pendiente</span><strong>{data.debt}</strong><small>Alumnas activas con deuda o pago parcial</small></section></div><div className="dash-branches">{[['GODOY_CRUZ','Godoy Cruz'],['LUJAN_DE_CUYO','Luján']].map(([branch,label])=>{const counts=data.days[branch],max=Math.max(1,...counts);return <section className="dash-card dash-days" key={branch}><h2>Alumnas por día · {label}</h2><p className="dash-muted">Inscripciones activas</p>{days.map((day,i)=><div className="dash-day" key={day}><span>{day}</span><span className="dash-track"><span style={{width:`${counts[i]/max*100}%`}}/></span><strong>{counts[i]}</strong></div>)}</section>;})}</div></>}<FinancialSummary showChart={presentation.showIncomeChart}/><section className="dash-card"><h2>Accesos rápidos</h2><div className="dash-quick">{links.map(([label,href])=><a href={href} key={href}>{label} <span aria-hidden="true">→</span></a>)}</div></section></main></div></div>;
}
