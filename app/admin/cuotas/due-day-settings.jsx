'use client';
import { useCallback, useEffect, useState } from 'react';

function monthName(value) {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', { month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export default function DueDaySettings() {
  const [data,setData] = useState(null);
  const [day,setDay] = useState('');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [uncertain,setUncertain] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/fee-due-day', { cache:'no-store', signal });
      if (response.status === 401 || response.status === 403) { window.location.replace('/'); return; }
      if (!response.ok) throw new Error('request');
      setData(await response.json()); setUncertain(false); setError('');
    } catch (err) { if (err.name !== 'AbortError') setError('No pudimos consultar los vencimientos. Intentá nuevamente.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  async function submit(event) {
    event.preventDefault();
    if (busy || loading || uncertain || !data) return;
    const number = Number(day);
    if (!/^\d{1,2}$/.test(day) || !Number.isInteger(number) || number < 1 || number > 28) { setError('Elegí un día entre 1 y 28.'); return; }
    const initial = !data.current && !data.next && data.history.length === 0;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/fee-due-day', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ mode:initial ? 'INITIAL' : 'SCHEDULE', day:number }) });
      if (response.status === 401 || response.status === 403) { window.location.replace('/'); return; }
      if (!response.ok) {
        if (response.status >= 500) { setUncertain(true); setError('No pudimos confirmar si se guardó. Consultá el historial antes de reintentar.'); return; }
        const result = await response.json().catch(() => ({})); setError(result.error || 'No pudimos guardar el vencimiento.'); return;
      }
      setDay(''); setNotice(initial ? 'Se estableció el vencimiento inicial.' : 'Se programó el próximo vencimiento.'); setUncertain(true);
      await load();
    } catch { setUncertain(true); setError('No pudimos confirmar si se guardó. Consultá el historial antes de reintentar.'); }
    finally { setBusy(false); }
  }
  const initial = data && !data.current && !data.next && data.history.length === 0;
  return <section className="fee-card" aria-labelledby="fee-due-heading"><h2 id="fee-due-heading">Día de vencimiento</h2>{loading && <p role="status">Cargando vencimientos…</p>}{error && <p role="alert" className="fee-error">{error}</p>}{notice && <p role="status" className="fee-success">{notice}</p>}{(uncertain || (!data && !loading)) && <button className="fee-secondary" type="button" onClick={() => load()} disabled={busy || loading}>Consultar historial</button>}{data && <><p className="fee-note">{data.current ? `Vigente: día ${data.current.day} de cada mes.` : 'Vigente: sin configurar.'} {data.next ? `Próximo: día ${data.next.day} desde ${monthName(data.next.effectivePeriod)}.` : 'Próximo: sin programar.'}</p><p className="fee-note">{initial ? 'Elegí un día del 1 al 28. El valor inicial rige para el período actual si todavía no hay cuotas generadas.' : 'Elegí un día del 1 al 28. Los cambios se aplican desde el mes siguiente y no modifican cuotas existentes.'}</p><form onSubmit={submit}><label className="fee-field" htmlFor="fee-due-day">{initial ? 'Día de vencimiento inicial' : 'Nuevo día de vencimiento'}<input id="fee-due-day" type="number" min="1" max="28" step="1" inputMode="numeric" placeholder="Ej.: 15" value={day} onChange={(event) => setDay(event.target.value)} required /></label><button className="fee-primary" type="submit" disabled={busy || loading || uncertain}>{busy ? 'Guardando…' : initial ? 'Establecer vencimiento' : 'Programar vencimiento'}</button></form><details className="fee-due-history"><summary>Historial de vencimientos</summary>{data.history.length ? <ul>{data.history.map((entry) => <li key={entry.id}>Día {entry.day} · desde {monthName(entry.effectivePeriod)}</li>)}</ul> : <p className="fee-note">Todavía no hay vencimientos registrados.</p>}</details></>}</section>;
}
