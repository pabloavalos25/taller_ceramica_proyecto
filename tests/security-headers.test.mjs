import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../next.config.mjs';

test('security headers protect every route from sniffing and framing', async () => {
  const rules = await config.headers();
  const allRoutes = rules.find((rule) => rule.source === '/:path*');
  assert.ok(allRoutes);
  const headers = Object.fromEntries(allRoutes.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
});

test('security headers limit referrers and device capabilities without disclosing the framework', async () => {
  const rules = await config.headers();
  const allRoutes = rules.find((rule) => rule.source === '/:path*');
  const headers = Object.fromEntries(allRoutes.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()');
  assert.equal(config.poweredByHeader, false);
});
