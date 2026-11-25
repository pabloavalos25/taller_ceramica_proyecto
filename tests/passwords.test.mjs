import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth/passwords.mjs';

test('password hashes are salted and verify only the right password', async () => {
  const one = await hashPassword('contraseña segura 123');
  const two = await hashPassword('contraseña segura 123');
  assert.notEqual(one, two);
  assert.ok(!one.includes('contraseña segura 123'));
  assert.equal(await verifyPassword('contraseña segura 123', one), true);
  assert.equal(await verifyPassword('incorrecta', one), false);
});

test('rejects weak inputs and malformed or untrusted hashes', async () => {
  await assert.rejects(hashPassword('corta'), RangeError);
  await assert.rejects(hashPassword('x'.repeat(1025)), RangeError);
  assert.equal(await verifyPassword('a password', 'not-a-hash'), false);
  assert.equal(await verifyPassword('a password', 'scrypt$v1$999999999$8$1$00$00'), false);
});
