import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('maintenance refuses to run unless explicitly enabled and database is configured', () => {
  for (const env of [
    { LOGIN_THROTTLE_CLEANUP_ENABLED: '', DATABASE_URL: '' },
    { LOGIN_THROTTLE_CLEANUP_ENABLED: 'true', DATABASE_URL: '' },
  ]) {
    const result = spawnSync(process.execPath, ['scripts/prune-login-throttle.mjs'], { encoding: 'utf8', env: { ...process.env, ...env } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /configuraci/i);
  }
});
