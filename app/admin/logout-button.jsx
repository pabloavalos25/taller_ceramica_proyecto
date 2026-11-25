'use client';
import {useState} from 'react';

export default function LogoutButton({hasUnsavedChanges=false}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(false);
  async function logout(){if(hasUnsavedChanges&&!window.confirm('Hay datos sin guardar. ¿Querés cerrar sesión?'))return;setBusy(true);setError(false);try{const response=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw Error();window.location.assign('/');}catch{setError(true);setBusy(false);}}
  return <div className="admin-session"><button className="admin-logout" type="button" disabled={busy} onClick={logout}>{busy?'Cerrando sesión…':'Cerrar sesión'}</button>{error&&<p role="alert">No pudimos cerrar la sesión. Intentá nuevamente.</p>}</div>;
}
