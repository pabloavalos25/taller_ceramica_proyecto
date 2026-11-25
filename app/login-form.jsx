'use client';
import { useEffect, useState } from 'react';

export default function LoginForm({ enabled }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [role, setRole] = useState(null);
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
      if (session.mustChangePassword) { window.location.assign('/cambiar-contrasena'); return; }
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
  if (signedIn) return <div><p role="status">Ingresaste correctamente.</p>{role === 'ADMIN' && <><p><a href="/admin/alumnas">Gestionar alumnas</a></p><p><a href="/admin/dispositivo">Cuidar datos de este dispositivo</a></p></>}{role === 'USER' && <p><a href="/mi-cuenta">Ver mi cuenta</a></p>}<button className="button" type="button" disabled={busy} onClick={logout}>Cerrar sesión</button>{error && <p role="alert" className="auth-error">{error}</p>}</div>;
  return <><form onSubmit={submit}><label className="field">Correo electrónico<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@ejemplo.com" disabled={!enabled || busy} required /></label><label className="field">Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ingresá tu contraseña" disabled={!enabled || busy} required /></label>{error && <p role="alert" className="auth-error">{error}</p>}{message && <p role="status">{message}</p>}<button className="button" type="submit" disabled={!enabled || busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button></form>{!enabled && <p role="status" className="note">El acceso se habilitará cuando finalice la configuración del sistema.</p>}</>;
}
