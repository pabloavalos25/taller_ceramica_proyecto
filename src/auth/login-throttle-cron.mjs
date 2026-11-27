import { createHash, timingSafeEqual } from 'node:crypto';

const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function createLoginThrottleCronHandler({ enabled, secret, run }) {
  return async request => {
    if (!enabled || typeof secret !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(secret) || typeof run !== 'function') return json({ error: 'Servicio no disponible' }, 503);
    const digest = value => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`))) return json({ error: 'No autorizado' }, 401);
    try { return json({ removed: await run() }, 200); }
    catch { return json({ error: 'No se pudo completar la limpieza' }, 503); }
  };
}
