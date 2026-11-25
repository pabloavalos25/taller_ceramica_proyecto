import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMutationOrigin } from '../src/auth/http-security.mjs';

test('accepts only the configured exact origin and JSON content type', () => {
  const make = (origin, type = 'application/json') => new Request('https://suyai.example/api', { method: 'POST', headers: { Origin: origin, 'Content-Type': type } });
  assert.equal(checkMutationOrigin(make('https://suyai.example'), 'https://suyai.example', true), true);
  assert.equal(checkMutationOrigin(make('https://evil.example'), 'https://suyai.example', true), false);
  assert.equal(checkMutationOrigin(make('https://suyai.example', 'text/plain'), 'https://suyai.example', true), false);
  assert.equal(checkMutationOrigin(make('https://suyai.example'), 'http://suyai.example', true), false);
  assert.equal(checkMutationOrigin(new Request('https://suyai.example/api', { method: 'POST' }), 'https://suyai.example', true), false);
  assert.equal(checkMutationOrigin(make('https://suyai.example'), 'https://suyai.example/path', true), false);
});
