import pg from 'pg';
import { pruneLoginThrottle } from '../src/auth/login-throttle-cleanup.mjs';

if (process.env.LOGIN_THROTTLE_CLEANUP_ENABLED !== 'true' || !process.env.DATABASE_URL) {
  console.error('Configuración incompleta: se requiere habilitar la limpieza y configurar la base de datos.');
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const removed = await pruneLoginThrottle(pool);
    console.log(`Registros de intentos vencidos eliminados: ${removed}.`);
  } catch {
    console.error('No se pudo completar la limpieza de intentos.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
