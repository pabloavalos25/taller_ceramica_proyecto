import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudent} from '../src/students/create-student.mjs';

const input={actorToken:'A'.repeat(43),fullName:'Ana',email:'ana@example.com',phone:'123',initialPassword:'temporal segura',active:true,weekdays:[1],feeStart:'CURRENT',branch:'GODOY_CRUZ',teacherId:'11111111-1111-4111-8111-111111111111'};
test('rechaza una fecha de alta posterior a 2100 antes de acceder a la base', async () => {
  await assert.rejects(createStudent({connect(){throw Error('Accedió a la base');}}, {...input,enrolledOn:'2101-01-01'}), /fecha/i);
});
test('permite el último día de 2100 y rechaza fechas inexistentes', async () => {
  const pool={connect(){throw Error('fecha aceptada');}};
  await assert.rejects(createStudent(pool, {...input,enrolledOn:'2100-12-31'}), /fecha aceptada/);
  await assert.rejects(createStudent(pool, {...input,enrolledOn:'2100-02-29'}), /Fecha inválida/);
});
