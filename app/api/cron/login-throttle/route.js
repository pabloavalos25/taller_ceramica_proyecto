import pg from 'pg';
import { createLoginThrottleCronHandler } from '../../../../src/auth/login-throttle-cron.mjs';
import { pruneLoginThrottle } from '../../../../src/auth/login-throttle-cleanup.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { DATABASE_URL, LOGIN_THROTTLE_CLEANUP_ENABLED, CRON_SECRET } = process.env;
  const handler = createLoginThrottleCronHandler({
    enabled: LOGIN_THROTTLE_CLEANUP_ENABLED === 'true' && Boolean(DATABASE_URL),
    secret: CRON_SECRET,
    run: async () => {
      const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
      try { return await pruneLoginThrottle(pool); }
      finally { await pool.end(); }
    },
  });
  return handler(request);
}
