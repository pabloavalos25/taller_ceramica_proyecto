import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginDestination } from '../src/auth/login-destination.mjs';

test('a verified administrator enters the dashboard after login', () => {
  assert.equal(loginDestination({ role: 'ADMIN', mustChangePassword: false }), '/admin');
});

test('required password change takes precedence and students retain their current flow', () => {
  assert.equal(loginDestination({ role: 'ADMIN', mustChangePassword: true }), '/cambiar-contrasena');
  assert.equal(loginDestination({ role: 'USER', mustChangePassword: false }), null);
});
