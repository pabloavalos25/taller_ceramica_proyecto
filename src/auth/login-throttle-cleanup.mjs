// A login window lasts 15 minutes. Keep inactive buckets for at least a day,
// and skip rows held by concurrent authentication rather than delaying it.
export async function pruneLoginThrottle(pool, { limit = 500 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('Tamaño de lote inválido');
  const result = await pool.query(`
    DELETE FROM login_throttle
    WHERE bucket IN (
      SELECT bucket FROM login_throttle
      WHERE window_started_at < now() - interval '24 hours'
      ORDER BY window_started_at, bucket
      LIMIT $1 FOR UPDATE SKIP LOCKED
    )`, [limit]);
  return result.rowCount;
}
