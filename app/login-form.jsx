'use client';
import { useEffect, useState } from 'react';
import { loginDestination } from '../src/auth/login-destination.mjs';

export default function LoginForm({ enabled }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [role, setRole] = useState(null);
  const [access, setAccess] = useState(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('clave') === 'actualizada') setMessage('Contraseña actualizada. Ingresá con tu nueva contraseña.');
  }, []);
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const login = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (!login.ok) { setError(login.status === 401 ? 'No pudimos ingresar con esos datos. Revisalos e intentá nuevamente.' : 'No pudimos ingresar. Intentá nuevamente más tarde.'); return; }
      setPassword('');
      const current = await fetch('/api/auth/session', { cache: 'no-store' });
      if (!current.ok) { setError('No pudimos verificar tu sesión. Intentá nuevamente.'); return; }
      const session = await current.json();
      const destination = loginDestination(session);
      if (destination) { window.location.assign(destination); return; }
      setRole(session.role); setSignedIn(true);
    } catch { setError('No pudimos ingresar. Revisá tu conexión.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) throw new Error('logout');
      setSignedIn(false); setRole(null); setMessage('Cerraste tu sesión.');
    } catch { setError('No pudimos cerrar la sesión. Intentá nuevamente.'); }
    finally { setBusy(false); }
  }
  if (signedIn) return <div className="session-actions"><p className="session-success" role="status"><span className="session-success-icon" aria-hidden="true">✓</span>Ingresaste correctamente.</p><nav className="session-links" aria-label="Acciones disponibles">{role === 'ADMIN' && <><a className="session-link" href="/admin"><span>Ir al panel de administración</span><span aria-hidden="true">→</span></a><a className="session-link session-link-secondary" href="/admin/alumnas"><span>Gestionar alumnas</span><span aria-hidden="true">→</span></a><a className="session-link session-link-secondary" href="/admin/dispositivo"><span>Cuidar datos de este dispositivo</span><span aria-hidden="true">→</span></a></>}{role === 'USER' && <a className="session-link" href="/mi-cuenta"><span>Ver mi cuenta</span><span aria-hidden="true">→</span></a>}</nav><button className="session-logout" type="button" disabled={busy} onClick={logout}>Cerrar sesión</button>{error && <p role="alert" className="auth-error">{error}</p>}</div>;
  return <>{!access ? <div className="access-options" aria-label="Elegí cómo querés ingresar"><button type="button" onClick={() => setAccess('alumnos')}>Acceso alumnos <span aria-hidden="true">→</span></button><button type="button" onClick={() => setAccess('administración')}>Acceso administración <span aria-hidden="true">→</span></button></div> : <form onSubmit={submit}><button className="access-back" type="button" disabled={busy} onClick={() => { setAccess(null); setPassword(''); setError(''); }}>← Volver a los accesos</button><p className="access-selected">Acceso {access} · Ingresá tus datos.</p><label className="field">Correo electrónico<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@ejemplo.com" disabled={!enabled || busy} required autoFocus /></label><label className="field">Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ingresá tu contraseña" disabled={!enabled || busy} required /></label>{error && <p role="alert" className="auth-error">{error}</p>}<button className="button" type="submit" disabled={!enabled || busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button></form>}{message && <p role="status">{message}</p>}{!enabled && <p role="status" className="note">El acceso se habilitará cuando finalice la configuración del sistema.</p>}</>;
}
