'use client';
import LogoutButton from '../../logout-button';
import { useEffect, useState } from 'react';

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const blank = { fullName:'', email:'', phone:'', initialPassword:'', enrolledOn:'', active:true, weekdays:[], feeStart:'CURRENT', branch:'',teacherId:'' };

export default function StudentForm() {
  const [data, setData] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [teachers,setTeachers]=useState([]),[teacherError,setTeacherError]=useState(false);
  useEffect(()=>{const controller=new AbortController();fetch('/api/admin/teachers',{signal:controller.signal,cache:'no-store'}).then(response=>{if(!response.ok)throw Error('request');return response.json();}).then(result=>setTeachers(result.items.filter(item=>item.active))).catch(error=>{if(error.name!=='AbortError')setTeacherError(true);});return()=>controller.abort();},[]);
  const dirty = Boolean(data.fullName || data.email || data.phone || data.initialPassword || data.enrolledOn || data.weekdays.length || !data.active || data.feeStart !== 'CURRENT' || data.branch || data.teacherId);
  useEffect(() => {
    const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  const field = (name, value) => { setData((previous) => ({ ...previous, [name]: value })); setMessage(''); };
  function toggle(day) { field('weekdays', data.weekdays.includes(day) ? data.weekdays.filter((value) => value !== day) : [...data.weekdays, day].sort((a,b) => a-b)); }
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    if (!data.branch) { setError('Seleccioná una sede para la alumna.'); return; }
    if (!data.teacherId) { setError('Seleccioná un profesor para la alumna.'); return; }
    if (!data.weekdays.length) { setError('Seleccioná al menos un día de asistencia.'); return; }
    if ([...data.initialPassword].length < 12) { setError('La contraseña inicial debe tener al menos 12 caracteres.'); return; }
    setError(''); setMessage(''); setBusy(true);
    try {
      const res = await fetch('/api/admin/students', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(data) });
      const result = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) { setError('Tu sesión no permite realizar esta operación. Volvé a ingresar.'); return; }
      if (!res.ok) { setError(result.error || 'No pudimos guardar la alumna. Intentá nuevamente.'); return; }
      setData(blank); setMessage('La alumna fue creada. Entregá la contraseña inicial por un canal seguro.');
    } catch { setError('No pudimos guardar la alumna. Revisá tu conexión.'); }
    finally { setBusy(false); }
  }
  function cancel() { if (!dirty || window.confirm('Hay datos sin guardar. ¿Querés salir?')) window.location.assign('/admin/alumnas'); }
  return <div className="student-layout"><aside className="student-sidebar"><div className="admin-side-brand"><img src="/logo.png" alt="SUYAI – Multiespacio Cultural" /><div><strong>SUYAI</strong><small>Multiespacio cultural</small></div></div><span className="student-nav-label">Administración</span><nav aria-label="Secciones administrativas"><a href="/admin">Inicio</a><strong>Alumnas</strong><a href="/admin/cuotas">Cuotas</a><a href="/admin/hornos">Hornos</a><a href="/admin/materiales">Materiales e Insumos</a><a href="/admin/pagos">Pagos</a><a href="/admin/configuracion">Configuración</a><LogoutButton hasUnsavedChanges={dirty}/></nav></aside><div><header className="student-mobile-head"><img src="/logo.png" alt="SUYAI" /><span>SUYAI · Alumnas</span></header><main className="student-main"><span className="student-eyebrow">Alumnas / Nueva alumna</span><h1>Dar de alta una alumna</h1><p className="student-intro">Registrá sus datos y elegí cuándo comenzará a abonar la cuota.</p><form onSubmit={submit}><section className="student-card"><h2>Información personal</h2><div className="student-grid"><label className="student-field">Nombre completo<input value={data.fullName} onChange={(e)=>field('fullName',e.target.value)} maxLength={200} required autoComplete="name" /></label><label className="student-field">Correo electrónico<input type="email" value={data.email} onChange={(e)=>field('email',e.target.value)} maxLength={320} required autoComplete="email" /></label><label className="student-field">Teléfono<input type="tel" value={data.phone} onChange={(e)=>field('phone',e.target.value)} maxLength={50} required autoComplete="tel" /></label><label className="student-field">Fecha de alta<input type="date" max="2100-12-31" value={data.enrolledOn} onChange={(e)=>field('enrolledOn',e.target.value)} required /></label><label className="student-field">Contraseña inicial<input type="password" value={data.initialPassword} onChange={(e)=>field('initialPassword',e.target.value)} autoComplete="new-password" required aria-describedby="student-password-hint" /><span className="student-hint" id="student-password-hint">Mínimo 12 caracteres. La alumna deberá cambiarla al ingresar.</span></label><label className="student-field">Estado administrativo<select value={data.active ? 'active' : 'inactive'} onChange={(e)=>field('active',e.target.value === 'active')}><option value="active">Activa</option><option value="inactive">Inactiva</option></select></label></div></section><section className="student-card"><h2>Profesor</h2><label className="student-field">Profesor responsable<select value={data.teacherId} onChange={(e)=>field("teacherId",e.target.value)} required><option value="">Seleccioná un profesor</option>{teachers.map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.displayName}</option>)}</select></label>{teacherError&&<p role="alert" className="student-error">No pudimos cargar los profesores.</p>}</section><section className="student-card"><h2>Sede</h2><p className="student-note">Elegí la sede donde asiste la alumna.</p><div className="student-days student-branches" role="group" aria-label="Sede">{[["GODOY_CRUZ","Sede Godoy Cruz"],["LUJAN_DE_CUYO","Sede Luján de Cuyo"]].map(([value,label])=><button key={value} type="button" className={`student-branch${value === "LUJAN_DE_CUYO" ? " lujan" : ""}`} aria-pressed={data.branch===value} onClick={()=>field("branch",value)}><span className="student-branch-check" aria-hidden="true">✓</span><span>{label}</span></button>)}</div></section><section className="student-card"><h2>Días de asistencia</h2><p className="student-note">Seleccioná uno o varios días.</p><div className="student-days">{days.map((day, i) => <button key={day} className={`student-day${data.weekdays.includes(i+1) ? ' selected' : ''}`} type="button" aria-pressed={data.weekdays.includes(i+1)} onClick={()=>toggle(i+1)}>{day}</button>)}</div></section><section className="student-card"><h2>Inicio de la cuota</h2><div className="student-options"><label><input type="radio" name="fee" checked={data.feeStart === 'CURRENT'} onChange={()=>field('feeStart','CURRENT')} /> Comenzar en el período actual</label><label><input type="radio" name="fee" checked={data.feeStart === 'NEXT'} onChange={()=>field('feeStart','NEXT')} /> Comenzar en el período siguiente</label></div><p className="student-note">Las alumnas inactivas no generan cuotas automáticamente.</p></section>{error && <p role="alert" className="student-error">{error}</p>}{message && <p role="status" className="student-success">{message}</p>}<div className="student-actions"><button className="student-secondary" type="button" onClick={cancel} disabled={busy}>Cancelar</button><button className="student-primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar alumna'}</button></div></form></main></div></div>;
}
