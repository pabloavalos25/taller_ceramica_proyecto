import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorize } from '../src/auth/authorize.mjs';

test('only administrators with changed passwords may access administrative operations', () => {
  assert.equal(authorize({ userId: 'a', role: 'ADMIN', mustChangePassword: false }, { kind: 'admin' }), true);
  assert.equal(authorize({ userId: 'a', role: 'USER', mustChangePassword: false }, { kind: 'admin' }), false);
  assert.equal(authorize({ userId: 'a', role: 'ADMIN', mustChangePassword: true }, { kind: 'admin' }), false);
  assert.equal(authorize(null, { kind: 'admin' }), false);
});

test('students may see only their own data and must first change a temporary password', () => {
  const student = { userId: 'one', role: 'USER', mustChangePassword: false };
  assert.equal(authorize(student, { kind: 'student', studentId: 'one' }), true);
  assert.equal(authorize(student, { kind: 'student', studentId: 'other' }), false);
  assert.equal(authorize({ ...student, mustChangePassword: true }, { kind: 'student', studentId: 'one' }), false);
  assert.equal(authorize({ ...student, mustChangePassword: true }, { kind: 'change-password' }), true);
  assert.equal(authorize(student, { kind: 'unknown' }), false);
});
