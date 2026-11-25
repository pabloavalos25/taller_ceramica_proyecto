'use client';
import LogoutButton from '../logout-button';
import { useEffect, useRef, useState } from 'react';

const names = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const statusLabels = { CURRENT:'Al día', DEBT:'Con deuda', PARTIAL:'Pago parcial', INCONSISTENT:'Requiere revisión' };
const branchLabels = { GODOY_CRUZ:'Sede Godoy Cruz', LUJAN_DE_CUYO:'Sede Luján de Cuyo' };
function money(value) {
  const cents = BigInt(value), negative = cents < 0n, abs = negative ? -cents : cents;
  return `${negative ? '−' : ''}$ ${new Intl.NumberFormat('es-AR').format(abs / 100n)},${String(abs % 100n).padStart(2,'0')}`;
}
function Days({ days }) { return <>{days.length ? days.map((d) => names[d-1]).join(', ') : 'Sin días asignados'}</>; }

export default function StudentsList() {
  const [filters,setFilters] = useState({ search:'', status:'ALL', weekday:'', economic:'ALL', branch:'ALL' });
  const [data,setData] = useState({ items:[], total:0 });
  const [offset,setOffset] = useState(0);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [refresh,setRefresh] = useState(0);
  const [target,setTarget] = useState(null);
  const [feeStart,setFeeStart] = useState('');
  const [busy,setBusy] = useState(false);
  const dialog = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ search:filters.search, status:filters.status, economic:filters.economic, branch:filters.branch, limit:'50', offset:String(offset) });
    if (filters.weekday) params.set('weekday',filters.weekday);
    setLoading(true); setError('');
    fetch(`/api/admin/students?${params}`, { cache:'no-store', signal:controller.signal }).then(async (response) => {
      if (response.status === 401 || response.status === 403) { window.location.replace('/'); return; }
      if (!response.ok) throw new Error('request');
      const result = await response.json(); if (result.items.length === 0 && result.total > 0 && offset > 0) { setOffset(Math.floor((result.total - 1) / 50) * 50); return; } setData(result);
    }).catch((err) => { if (err.name !== 'AbortError') setError('No pudimos cargar las alumnas. Intentá nuevamente.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters,offset,refresh]);
  function filter(key,value) { setOffset(0); setFilters((previous)=>({...previous,[key]:value})); }
  function open(student) { setTarget(student); setFeeStart(''); setError(''); setNotice(''); dialog.current?.showModal(); }
  function close() { if (!busy) { dialog.current?.close(); setTarget(null); setError(''); } }
  async function update(event) {
    event.preventDefault(); if (!target || busy) return;
    if (!target.active && !feeStart) { setError('Elegí cuándo comenzará la cuota.'); return; }
    setBusy(true); setError('');
    const payload = { studentId:target.id, action:target.active ? 'DEACTIVATE' : 'REACTIVATE', ...(!target.active ? { feeStart } : {}) };
    try {
      const response = await fetch('/api/admin/student-status', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      if (!response.ok) { const body = await response.json().catch(()=>({})); setError(body.error || 'No pudimos actualizar el estado.'); return; }
      const wasActive = target.active; dialog.current?.close(); setTarget(null); setNotice(wasActive ? 'La alumna fue dada de baja. Se conservó su historial.' : 'La alumna fue reactivada.'); setRefresh((n)=>n+1);
    } catch { setError('No pudimos actualizar el estado. Revisá tu conexión.'); }
    finally { setBusy(false); }
  }
  const actions = (student) => <div className="list-actions"><button type="button" className="list-link" onClick={()=>open(student)}>{student.active ? 'Dar de baja' : 'Reactivar'}</button><span className="list-muted">Detalle próximamente</span></div>;
  return <div className="list-layout"><aside className="list-side"><div className="admin-side-brand"><img src="/logo.png" alt="SUYAI – Multiespacio Cultural" /><div><strong>SUYAI</strong><small>Multiespacio cultural</small></div></div><span className="admin-nav-label">Administración</span><nav aria-label="Secciones administrativas"><a href="/admin">Inicio</a><strong>Alumnas</strong><a href="/admin/cuotas">Cuotas</a><a href="/admin/hornos">Hornos</a><a href="/admin/materiales">Materiales e Insumos</a><a href="/admin/pagos">Pagos</a><a href="/admin/configuracion">Configuración</a><LogoutButton/></nav></aside><div><header className="list-mobile"><img src="/logo.png" alt="SUYAI" /><span>SUYAI · Alumnas</span></header><main className="list-main"><div className="list-top"><div><span className="list-eyebrow">Gestión del taller</span><h1>Alumnas</h1><p className="list-intro">Consultá y administrá las alumnas del taller.</p><p><a className="list-device-link" href="/admin/dispositivo">Cuidar datos de este dispositivo</a></p></div><a className="list-primary" href="/admin/alumnas/nueva">+ Nueva alumna</a></div><section className="list-surface"><div className="list-filters"><label>Buscar<input type="search" placeholder="Nombre o correo" value={filters.search} onChange={(e)=>filter('search',e.target.value)} maxLength={200} /></label><label>Sede<select value={filters.branch} onChange={(e)=>filter('branch',e.target.value)}><option value="ALL">Todas las sedes</option><option value="GODOY_CRUZ">Sede Godoy Cruz</option><option value="LUJAN_DE_CUYO">Sede Luján de Cuyo</option><option value="UNASSIGNED">Sin sede asignada</option></select></label><label>Estado<select value={filters.status} onChange={(e)=>filter('status',e.target.value)}><option value="ALL">Todas</option><option value="ACTIVE">Activas</option><option value="INACTIVE">Inactivas</option></select></label><label>Día de asistencia<select value={filters.weekday} onChange={(e)=>filter('weekday',e.target.value)}><option value="">Todos los días</option>{names.map((day,i)=><option key={day} value={String(i+1)}>{day}</option>)}</select></label><label>Estado económico<select value={filters.economic} onChange={(e)=>filter('economic',e.target.value)}><option value="ALL">Todos</option><option value="CURRENT">Al día</option><option value="DEBT">Con deuda</option><option value="PARTIAL">Pago parcial</option></select></label></div>{notice && <p role="status" className="list-success">{notice}</p>}{error && !target && <p role="alert" className="list-error">{error}</p>}{loading ? <p role="status">Cargando alumnas…</p> : !error && data.items.length === 0 ? <p>No hay alumnas para los filtros seleccionados.</p> : !error && <><p className="list-muted">{data.total} {data.total === 1 ? 'alumna' : 'alumnas'}</p><div className="list-table-wrap"><table className="list-table"><thead><tr><th>Alumna</th><th>Correo</th><th>Sede</th><th>Días</th><th>Estado</th><th>Situación económica</th><th>Acciones</th></tr></thead><tbody>{data.items.map((s)=><tr key={s.id}><td>{s.fullName}</td><td>{s.email}</td><td>{branchLabels[s.branch] || 'Sin sede asignada'}</td><td><Days days={s.weekdays} /></td><td><span className={`list-badge ${s.active ? '' : 'neutral'}`}>{s.active ? 'Activa' : 'Inactiva'}</span></td><td><span>{statusLabels[s.economicStatus]}</span><br /><span className="list-muted">{s.economicStatus === 'INCONSISTENT' ? 'Saldo no disponible' : money(s.balanceCents)}</span></td><td>{actions(s)}</td></tr>)}</tbody></table></div><div className="list-cards">{data.items.map((s)=><article className="list-card" key={s.id}><h2>{s.fullName}</h2><p>{s.email}</p><p>{branchLabels[s.branch] || 'Sin sede asignada'}</p><p><Days days={s.weekdays} /> · <span className={`list-badge ${s.active ? '' : 'neutral'}`}>{s.active ? 'Activa' : 'Inactiva'}</span></p><p>{statusLabels[s.economicStatus]} · {s.economicStatus === 'INCONSISTENT' ? 'Saldo no disponible' : money(s.balanceCents)}</p>{actions(s)}</article>)}</div><div className="list-pagination"><button type="button" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Anterior</button><span>{offset+1}–{Math.min(offset+data.items.length,data.total)} de {data.total}</span><button type="button" disabled={offset+50>=data.total} onClick={()=>setOffset(offset+50)}>Siguiente</button></div></>}<p className="list-note">La baja conserva el historial y las deudas. Al reactivar se solicita cuándo iniciar la cuota.</p></section><dialog ref={dialog} className="list-dialog" onCancel={(event)=>{ if (busy) event.preventDefault(); else { setTarget(null); setError(''); } }}><form onSubmit={update}><h2>{target?.active ? 'Dar de baja' : 'Reactivar alumna'}</h2><p>{target?.fullName}</p>{target?.active ? <p>Se conservarán sus datos, deudas e historial. La alumna podrá seguir consultándolos.</p> : <fieldset><legend>¿Cuándo comienza la cuota?</legend><label><input required type="radio" name="fee" value="CURRENT" checked={feeStart==='CURRENT'} onChange={()=>setFeeStart('CURRENT')} /> Período actual</label><label><input required type="radio" name="fee" value="NEXT" checked={feeStart==='NEXT'} onChange={()=>setFeeStart('NEXT')} /> Período siguiente</label></fieldset>}{error && <p role="alert" className="list-error">{error}</p>}<div className="list-dialog-actions"><button type="button" onClick={close} disabled={busy}>Cancelar</button><button type="submit" className="list-primary" disabled={busy}>{busy ? 'Guardando…' : 'Confirmar'}</button></div></form></dialog></main></div></div>;
}
