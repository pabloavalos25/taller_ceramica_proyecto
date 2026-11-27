import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {webAuthHandlers} from '../../../src/auth/web.mjs';
import LogoutButton from '../logout-button';
import '../dashboard.css';

export const dynamic='force-dynamic';
export default async function Settings(){
  const handlers=webAuthHandlers();if(!handlers)redirect('/');
  const store=await cookies();const response=await handlers.session(new Request('http://internal/',{headers:{cookie:store.toString()}}));
  if(response.status===401)redirect('/');
  if(!response.ok)return <main><p role="alert">No pudimos verificar tu sesión. Intentá nuevamente.</p></main>;
  const session=await response.json();if(session.mustChangePassword)redirect('/cambiar-contrasena');if(session.role!=='ADMIN')redirect('/');
  return <div className="dash-layout"><aside className="dash-side"><div className="dash-brand"><img src="/logo.png" alt="Logo de SUYAI"/><div><strong>SUYAI</strong><small>Multiespacio cultural</small></div></div><span className="dash-eyebrow">Administración</span><nav aria-label="Secciones administrativas"><a href="/admin">Inicio</a><a href="/admin/alumnas">Alumnas</a><a href="/admin/cuotas">Cuotas</a><a href="/admin/hornos">Hornos</a><a href="/admin/materiales">Materiales e insumos</a><a href="/admin/pagos">Pagos</a><strong aria-current="page">Configuración</strong><LogoutButton/></nav></aside><div><header className="dash-top"><span>SUYAI · Administración</span></header><main className="dash-main"><span className="dash-eyebrow">Administración</span><h1>Configuración</h1><p className="dash-muted">Administrá tu acceso y los datos de este dispositivo.</p><section className="dash-card"><h2>Tu cuenta</h2><p className="dash-muted">Actualizá la contraseña que usás para ingresar.</p><div className="dash-quick"><a href="/cambiar-contrasena">Cambiar contraseña →</a></div></section>{session.accessLevel==="PRINCIPAL"&&<section className="dash-card"><h2>Administradores y profesores</h2><p>Creá o quitá accesos de profesores.</p><a className="dash-access-pink" href="/admin/administradores">Administrar accesos →</a></section>}<section className="dash-card"><h2>Este dispositivo</h2><p className="dash-muted">Revisá y cuidá los datos guardados en este navegador.</p><div className="dash-quick"><a href="/admin/dispositivo">Cuidar datos de este dispositivo →</a></div></section></main></div></div>;
}
