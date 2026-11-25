import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studentServiceDiagnostic} from '../src/auth/diagnostics.mjs';

test('student diagnostics log only a known error code and operation', () => {
  const original=console.error, messages=[];
  console.error=message=>messages.push(message);
  try {
    studentServiceDiagnostic('create',{code:'42703',message:'private@example.com password'});
    studentServiceDiagnostic('list',{code:'private@example.com',message:'private password'});
  } finally {console.error=original;}
  assert.deepEqual(messages,['[student-service] operation=create code=42703','[student-service] operation=list code=OTHER']);
});
