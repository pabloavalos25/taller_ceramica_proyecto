import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoginThrottleCronHandler } from '../src/auth/login-throttle-cron.mjs';
import { readFile } from 'node:fs/promises';

const secret = 'a'.repeat(32);
const request = token => new Request('http://localhost/api/cron/login-throttle', {headers: token ? {authorization: `Bearer ${token}`} : {}});

test('cron refuses disabled configuration and unauthenticated calls without executing cleanup', async () => {
  let calls = 0;
  const run = async () => { calls++; return 1; };
  assert.equal((await createLoginThrottleCronHandler({enabled:false, secret, run})(request(secret))).status, 503);
  assert.equal((await createLoginThrottleCronHandler({enabled:true, secret:'short', run})(request(secret))).status, 503);
  const handler = createLoginThrottleCronHandler({enabled:true, secret, run});
  assert.equal((await handler(request())).status, 401);
  assert.equal((await handler(request('b'.repeat(32)))).status, 401);
  assert.equal(calls, 0);
});

test('authorized cleanup reports bounded result without caching', async () => {
  let calls = 0;
  const handler = createLoginThrottleCronHandler({ enabled:true, secret, run:async () => { calls++; return 3; } });
  const response = await handler(request(secret));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { removed:3 });
  assert.equal(calls, 1);
});

test('cleanup errors do not expose database details', async () => {
  const handler = createLoginThrottleCronHandler({ enabled:true, secret, run:async () => { throw new Error('private database details'); } });
  const response = await handler(request(secret));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private database details/);
});

test('daily schedule registers the disabled-by-default maintenance route', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.crons.find(job => job.path === '/api/cron/login-throttle'), {
    path:'/api/cron/login-throttle', schedule:'0 7 * * *',
  });
});
