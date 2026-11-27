import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPeriod, makePeriod } from '../src/kiln/period.mjs';

test('presenta el período guardado y convierte la elección a su formato existente', () => {
  assert.equal(formatPeriod('2026-12'), 'diciembre de 2026');
  assert.equal(makePeriod(2026, 11), '2026-12');
});

test('maneja enero, períodos vacíos y valores fuera de rango', () => {
  assert.equal(formatPeriod('2027-01'), 'enero de 2027');
  assert.equal(makePeriod(2027, 0), '2027-01');
  assert.equal(formatPeriod('Diciembre'), '');
  assert.equal(makePeriod(0, 12), '');
});
