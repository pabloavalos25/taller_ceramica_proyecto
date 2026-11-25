'use client';
import { useCallback, useEffect, useState } from 'react';
import { parseArsCents, formatArsCents } from '../../../src/fees/amounts.mjs';
import DueDaySettings from './due-day-settings';

function formattedPeriod(value, long = false) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('es-AR', long ? { month:'long',year:'numeric',timeZone:'UTC' } : { day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC' }).format(date);
}
export default function FeePrices() {
  const [data,setData] = useState(null);
  const [amount,setAmount] = useState('');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [uncertain,setUncertain] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/fee-prices', { cache:'no-store', signal });
      if (res.status === 401 || res.status === 403) { window.location.replace('/'); return; }
      if (!res.ok) throw new Error('request');
      setData(await res.json()); setUncertain(false); setError('');
    } catch (err) { if (err.name !== 'AbortError') setError('No pudimos consultar los valores. Intentá nuevamente.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller=new AbortController(); load(controller.signal); return ()=>controller.abort(); }, [load]);
  async function submit(event) {
    event.preventDefault(); if (busy || loading || uncertain || !data) return;
    let amountCents;
    try { amountCents = parseArsCents(amount); } catch { setError('Ingresá un importe válido, por ejemplo 40.000,00.'); return; }
    setBusy(true); setError(''); setNotice('');
    const initial = !data.current && !data.next && data.history.length === 0;
    try {
      const res = await fetch('/api/admin/fee-prices', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({mode:initial?'INITIAL':'SCHEDULE',amountCents}) });
      if (res.status === 401 || res.status === 403) { window.location.replace('/'); return; }
      if (!res.ok) { if (res.status >= 500) { setUncertain(true); setError('No pudimos confirmar si se guardó. Consultá el historial antes de reintentar.'); return; } const result=await res.json().catch(()=>({})); setError(result.error || 'No pudimos guardar el valor.'); return; }
      setAmount(''); setNotice(initial ? 'Se estableció el valor inicial.' : 'Se programó el próximo valor.');
      setUncertain(true);
      await load();
    } catch {
      setUncertain(true); setError('No pudimos confirmar si se guardó. Consultá el historial antes de reintentar.');
    } finally { setBusy(false); }
  }
  const initial = data && !data.current && !data.next && data.history.length === 0;
  return <div className="fee-layout"><aside className="fee-side"><img src="/logo.png" alt="SUYAI – Multiespacio Cultural" /><nav aria-label="Secciones administrativas"><span>Inicio</span><a href="/admin/alumnas">Alumnas</a><strong>Cuotas</strong><a href="/admin/hornos">Hornos</a><a href="/admin/materiales">Materiales e Insumos</a><span>Pagos</span><span>Configuración</span></nav></aside><div><header className="fee-mobile"><img src="/logo.png" alt="SUYAI" /><span>SUYAI · Cuotas</span></header><main className="fee-main"><span className="fee-eyebrow">Gestión del taller</span><h1>Cuotas mensuales</h1><p className="fee-intro">Consultá el valor vigente y programá el importe del próximo período.</p><p><a href="/admin/cuotas/ajustar">Ajustar una cuota individual</a></p>{loading && <p role="status">Cargando valores…</p>}{error && <p role="alert" className="fee-error">{error}</p>}{notice && <p role="status" className="fee-success">{notice}</p>}{(uncertain || (!data && !loading)) && <button className="fee-secondary" type="button" onClick={()=>load()} disabled={busy || loading}>Consultar historial</button>}{data && <><div className="fee-grid"><section className="fee-card"><span className="fee-label">Valor vigente{data.current ? ` · ${formattedPeriod(data.current.effectivePeriod,true)}` : ''}</span><p className="fee-amount">{data.current ? formatArsCents(data.current.amountCents) : 'Sin configurar'}</p>{data.current && <p className="fee-note">Aplicado desde el {formattedPeriod(data.current.effectivePeriod)}.</p>}</section><section className="fee-card"><span className="fee-label">Próximo valor{data.next ? ` · ${formattedPeriod(data.next.effectivePeriod,true)}` : ''}</span><p className="fee-amount">{data.next ? formatArsCents(data.next.amountCents) : 'Sin programar'}</p>{data.next && <p className="fee-note">Entra en vigencia el {formattedPeriod(data.next.effectivePeriod)}.</p>}</section></div><section className="fee-card"><h2>{initial ? 'Establecer valor inicial' : 'Programar próximo valor'}</h2><p className="fee-note">{initial ? 'El valor inicial rige para el período actual si todavía no hay cuotas generadas.' : 'El nuevo importe se aplicará desde el próximo período. Las cuotas anteriores conservan su valor.'}</p><form onSubmit={submit}><label className="fee-field">{initial ? 'Importe inicial en pesos' : 'Nuevo importe en pesos'}<input inputMode="decimal" placeholder="Ej.: 40.000,00" value={amount} onChange={(event)=>setAmount(event.target.value)} maxLength={32} required aria-describedby="fee-hint" /><span className="fee-note" id="fee-hint">Usá coma para los centavos y punto para miles.</span></label><button className="fee-primary" type="submit" disabled={busy || loading || uncertain}>{busy ? 'Guardando…' : initial ? 'Establecer valor' : 'Programar valor'}</button></form></section><DueDaySettings /><section className="fee-card"><h2>Historial de valores</h2>{data.history.length ? <div className="fee-table-wrap"><table className="fee-table"><thead><tr><th>Vigencia desde</th><th>Importe</th><th>Registrado por</th></tr></thead><tbody>{data.history.map((item)=><tr key={item.id}><td>{formattedPeriod(item.effectivePeriod)}</td><td>{formatArsCents(item.amountCents)}</td><td>{item.actorEmail}</td></tr>)}</tbody></table></div> : <p className="fee-note">Todavía no hay valores registrados.</p>}</section></>}<p className="fee-note">La generación automática depende de la configuración del servicio del taller.</p></main></div></div>;
}
