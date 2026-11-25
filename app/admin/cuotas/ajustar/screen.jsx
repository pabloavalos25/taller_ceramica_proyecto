'use client';
import { useCallback, useEffect, useState } from 'react';
import { formatArsCents, parseArsCents } from '../../../../src/fees/amounts.mjs';
const key='suyai-pending-fee-adjustment';
const period=(item)=>new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(item.year,item.month-1,1)));
export default function Adjustment() {
  const [search,setSearch]=useState(''); const [query,setQuery]=useState(''); const [offset,setOffset]=useState(0);
  const [data,setData]=useState(null); const [selected,setSelected]=useState(null); const [amount,setAmount]=useState(''); const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [notice,setNotice]=useState(''); const [pending,setPending]=useState(null);
  const load=useCallback(async(signal)=>{setLoading(true); try { const params=new URLSearchParams({search:query,offset:String(offset)}); const res=await fetch(`/api/admin/fee-adjustments?${params}`,{cache:'no-store',signal}); if(res.status===401||res.status===403){window.location.replace('/'); return;} if(!res.ok) throw Error(); setData(await res.json()); } catch(e){if(e.name!=='AbortError') setError('No pudimos consultar las cuotas. Intentá nuevamente.');} finally {if(!signal?.aborted)setLoading(false);} },[query,offset]);
  useEffect(()=>{try { const stored=sessionStorage.getItem(key); if(stored) setPending(JSON.parse(stored)); } catch { setError('No pudimos recuperar el ajuste pendiente.'); }},[]);
  useEffect(()=>{const controller=new AbortController(); load(controller.signal); return ()=>controller.abort();},[load]);
  async function send(payload) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response=await fetch('/api/admin/fee-adjustments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(response.status===401||response.status===403){setError('Tu sesión no permite completar el ajuste. Volvé a ingresar antes de reintentar.'); return;}
      if(response.status>=500) throw Error();
      const result=await response.json();
      sessionStorage.removeItem(key); setPending(null);
      if(!response.ok){setError(result.error || 'No pudimos guardar el ajuste.'); await load(); return;}
      setSelected(null); setAmount(''); setReason(''); setNotice('El ajuste se guardó correctamente.'); await load();
    } catch {setError('No pudimos confirmar el resultado. Reintentá la misma operación para evitar duplicados.');}
    finally {setBusy(false);}
  }
  function submit(event) {
    event.preventDefault(); if(busy||pending||!selected) return;
    let cents; try {cents=parseArsCents(amount);} catch {setError('Ingresá un importe válido, por ejemplo 30.000,00.'); return;}
    if(BigInt(cents)<BigInt(selected.paidCents)){setError('El importe no puede ser menor a lo abonado.');return;}
    if(!reason.trim()){setError('Ingresá el motivo del ajuste.');return;}
    const payload={feeId:selected.id,amountCents:cents,reason:reason.trim(),idempotencyKey:crypto.randomUUID()};
    try {sessionStorage.setItem(key,JSON.stringify(payload));} catch {setError('No pudimos guardar la referencia de la operación. Revisá el almacenamiento del navegador antes de continuar.');return;}
    setPending(payload); send(payload);
  }
  return <div className="fee-layout"><aside className="fee-side"><img src="/logo.png" alt="SUYAI – Multiespacio Cultural"/><span className="admin-nav-label">Administración</span><nav aria-label="Secciones administrativas"><a href="/admin">Inicio</a><a href="/admin/alumnas">Alumnas</a><strong>Cuotas</strong><a href="/admin/hornos">Hornos</a><a href="/admin/materiales">Materiales e Insumos</a><a href="/admin/pagos">Pagos</a><a href="/admin/configuracion">Configuración</a></nav></aside><div><header className="fee-mobile"><img src="/logo.png" alt="SUYAI"/><span>SUYAI · Cuotas</span></header><main className="fee-main"><span className="fee-eyebrow">Cuotas / Ajuste individual</span><h1>Ajustar cuota</h1><p className="fee-intro">Seleccioná una cuota para registrar un descuento o una corrección.</p><a href="/admin/cuotas">Volver a cuotas</a>
    {error&&<p className="fee-error" role="alert">{error}</p>}{notice&&<p className="fee-success" role="status">{notice}</p>}
    {pending&&<section className="fee-card"><h2>Operación pendiente de confirmar</h2><p>Para evitar duplicados, reintentá la misma operación antes de registrar otra.</p><button className="fee-primary" type="button" disabled={busy} onClick={()=>send(pending)}>{busy?'Confirmando…':'Reintentar operación'}</button></section>}
    {!pending&&<><section className="fee-card"><h2>Buscar cuota</h2><form onSubmit={e=>{e.preventDefault();setSelected(null);setOffset(0);setQuery(search.trim());}}><label className="fee-field">Nombre de la alumna<input value={search} onChange={e=>setSearch(e.target.value)} maxLength={100} placeholder="Buscar por nombre" /></label><button className="fee-secondary adjustment-search" type="submit">Buscar</button></form>{loading?<p role="status">Cargando cuotas…</p>:data?.items.length?<><div className="fee-table-wrap"><table className="fee-table"><thead><tr><th>Alumna</th><th>Período</th><th>Importe actual</th><th></th></tr></thead><tbody>{data.items.map(item=><tr key={item.id}><td>{item.studentName}</td><td>{period(item)}</td><td>{formatArsCents(item.amountCents)}</td><td><button type="button" className="fee-secondary" onClick={()=>{setSelected(item);setAmount('');setReason('');setError('');setNotice('');}}>Seleccionar</button></td></tr>)}</tbody></table></div><div className="adjustment-actions"><button className="fee-secondary" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-50))}>Anterior</button><button className="fee-secondary" disabled={!data.hasMore} onClick={()=>setOffset(offset+50)}>Siguiente</button></div></>:<p>No encontramos cuotas para esta búsqueda.</p>}</section>
    {selected&&<><p className="fee-intro">{period(selected)} · {selected.studentName}</p><section className="fee-card"><div className="adjustment-grid"><div><span className="fee-label">Importe original</span><p className="adjustment-amount">{formatArsCents(selected.originalCents)}</p></div><div><span className="fee-label">Importe actual</span><p className="adjustment-amount">{formatArsCents(selected.amountCents)}</p></div><div><span className="fee-label">Ya abonado</span><p className="adjustment-amount">{formatArsCents(selected.paidCents)}</p></div></div><p className="fee-note">{BigInt(selected.amountCents)>=BigInt(selected.paidCents)?`Saldo actual: ${formatArsCents((BigInt(selected.amountCents)-BigInt(selected.paidCents)).toString())}`:'Saldo inconsistente: requiere revisión.'}</p></section><section className="fee-card"><h2>Nuevo importe</h2><p className="adjustment-notice">El nuevo importe no puede ser menor a lo ya abonado. Para corregir un pago, primero registrá su anulación.</p><form onSubmit={submit}><label className="fee-field adjustment-field">Nuevo importe en pesos<input inputMode="decimal" placeholder="Ej.: 30.000,00" value={amount} onChange={e=>setAmount(e.target.value)} maxLength={32} required /></label><label className="fee-field adjustment-field">Motivo del ajuste<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} required placeholder="Describí el descuento o la corrección" /></label><p className="fee-note">El importe original y el historial de ajustes se conservarán.</p><div className="adjustment-actions"><button type="button" className="fee-secondary" onClick={()=>setSelected(null)}>Cancelar</button><button className="fee-primary" disabled={busy} type="submit">{busy?'Guardando…':'Guardar ajuste'}</button></div></form></section></>}</>}
  </main></div></div>;
}
