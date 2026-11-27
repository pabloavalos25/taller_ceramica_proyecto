'use client';
import {useEffect,useState} from 'react';

const blank={displayName:'',email:'',temporaryPassword:''};
export default function AdminAccounts(){
 const [form,setForm]=useState(blank),[items,setItems]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(()=>{const controller=new AbortController();fetch('/api/admin/teachers',{cache:'no-store',signal:controller.signal}).then(res=>{if(!res.ok)throw Error('request');return res.json();}).then(data=>setItems(data.items)).catch(err=>{if(err.name!=='AbortError')setError('No pudimos cargar los administradores.');});return()=>controller.abort();},[refresh]);
 async function create(event){event.preventDefault();if(busy)return;setError('');setNotice('');setBusy(true);try{const response=await fetch('/api/admin/teachers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'No pudimos crear el acceso.');}setForm(blank);setNotice('Acceso creado. Entregá la contraseña por un canal seguro; deberá cambiarla al ingresar.');setRefresh(n=>n+1);}catch(err){setError(err.message||'No pudimos crear el acceso.');}finally{setBusy(false);}}
 async function remove(item){if(busy||!window.confirm(`¿Quitar el acceso de ${item.displayName}? Se conservarán las alumnas y su historial.`))return;setError('');setNotice('');setBusy(true);try{const response=await fetch('/api/admin/teachers',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({teacherId:item.id})});if(!response.ok)throw Error('No pudimos quitar el acceso.');setNotice('Acceso retirado. Se conservaron las alumnas y su historial.');setRefresh(n=>n+1);}catch(err){setError(err.message);}finally{setBusy(false);}}
 return <main className="dash-main admin-accounts">
  <a className="admin-accounts-back" href="/admin/configuracion">← Volver a configuración</a>
  <h1>Administradores y profesores</h1><p className="admin-accounts-intro">Creá accesos para profesores y administrá sus cuentas.</p>
  <section className="dash-card"><span className="admin-accounts-label">Administración de accesos</span><h2>Crear administrador</h2><p className="admin-accounts-description">Completá los datos para crear un nuevo acceso.</p>
   <form onSubmit={create}><div className="admin-accounts-grid">
    <label className="admin-accounts-field">Nombre<input required maxLength={200} placeholder="Nombre del profesor" value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})}/></label>
    <label className="admin-accounts-field">Correo<input required type="email" maxLength={320} placeholder="nombre@ejemplo.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <label className="admin-accounts-field">Contraseña inicial<input required minLength={12} type="password" autoComplete="new-password" placeholder="Mínimo 12 caracteres" value={form.temporaryPassword} onChange={e=>setForm({...form,temporaryPassword:e.target.value})}/></label>
   </div><p className="admin-accounts-hint">Deberá cambiar la contraseña al ingresar.</p><button className="admin-accounts-create" type="submit" disabled={busy}>Crear acceso</button></form>
  </section>
  <section className="dash-card"><h2>Accesos existentes</h2><p className="admin-accounts-description">Personas con acceso a la administración.</p><ul className="admin-accounts-list">{items.map(item=><li className="admin-accounts-item" key={item.id}><div><span className="admin-accounts-name">{item.displayName}</span><span className={'admin-accounts-role '+(item.accessLevel==='PRINCIPAL'?'admin-accounts-role-principal':'')}>{item.accessLevel==='PRINCIPAL'?'Administradora principal':'Profesor · '+(item.active?'Activo':'Inactivo')}</span></div>{item.accessLevel==='PRINCIPAL'?<span className="admin-accounts-badge">Principal</span>:item.active&&<button className="admin-accounts-remove" type="button" disabled={busy} onClick={()=>remove(item)}>Eliminar acceso</button>}</li>)}</ul></section>
  {error&&<p className="admin-accounts-message admin-accounts-error" role="alert">{error}</p>}{notice&&<p className="admin-accounts-message admin-accounts-success" role="status">{notice}</p>}
 </main>;
}