'use client';
import { useEffect, useState } from 'react';
import './password.css';

export default function ChangePasswordPage() {
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/session', { cache: 'no-store', signal: controller.signal }).then((res) => {
      if (res.status === 401) window.location.replace('/');
      else if (!res.ok) setError('No pudimos verificar tu sesión. Intentá nuevamente.');
      else setReady(true);
    }).catch((err) => { if (err.name !== 'AbortError') setError('No pudimos verificar tu sesión. Intentá nuevamente.'); });
    return () => controller.abort();
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (next !== confirmation) { setError('Las contraseñas nuevas no coinciden.'); return; }
    if ([...next].length < 12) { setError('La nueva contraseña debe tener al menos 12 caracteres.'); return; }
    if (next === current) { setError('Elegí una contraseña diferente de la actual.'); return; }
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      if (res.ok) { window.location.replace('/?clave=actualizada'); return; }
      if (res.status === 401) { window.location.replace('/'); return; }
      const result = await res.json().catch(() => ({}));
      setError(result.error || 'No pudimos actualizar tu contraseña. Intentá nuevamente.');
    } catch { setError('No pudimos actualizar tu contraseña. Revisá tu conexión.'); }
    finally { setBusy(false); }
  }
  return <main className="password-page"><section className="password-panel"><img className="password-logo" src="/logo.png" alt="SUYAI – Multiespacio Cultural" /><div className="password-eyebrow">Tu cuenta · Seguridad</div><h1>Creá una nueva contraseña</h1><p className="password-intro">Por seguridad, cambiá la contraseña inicial antes de continuar.</p>{error && <p role="alert" className="password-error">{error}</p>}{ready ? <form onSubmit={submit}><label className="password-field">Contraseña actual<input type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required /></label><label className="password-field">Nueva contraseña<input type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} required aria-describedby="password-hint" /><span id="password-hint" className="password-hint">Usá al menos 12 caracteres.</span></label><label className="password-field">Repetir nueva contraseña<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label><button className="password-button" disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar contraseña'}</button></form> : !error && <p role="status">Verificando tu sesión…</p>}<p className="password-help">Al guardar, cerraremos tus sesiones y podrás ingresar con tu nueva contraseña.</p></section></main>;
}
