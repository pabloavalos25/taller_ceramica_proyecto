import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardPresentation } from '../src/auth/dashboard-identity.mjs';

test('personalizes administrator welcome and restricts income chart to principal',()=>{
  assert.deepEqual(dashboardPresentation({displayName:'Abril',accessLevel:'PRINCIPAL'}),{welcome:'Te damos la bienvenida, Abril',showIncomeChart:true});
  assert.deepEqual(dashboardPresentation({displayName:'Claudia',accessLevel:'TEACHER'}),{welcome:'Te damos la bienvenida, Claudia',showIncomeChart:false});
});

test('unknown access level never enables the income chart',()=>{
  assert.deepEqual(dashboardPresentation({displayName:'',accessLevel:'UNKNOWN'}),{welcome:'Te damos la bienvenida',showIncomeChart:false});
});
