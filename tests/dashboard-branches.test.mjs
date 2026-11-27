import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dashboardDayFilters, dashboardDaysByBranch} from '../src/students/dashboard-branches.mjs';

test('requests active-student counts separately for each branch and day',()=>{
 const filters=dashboardDayFilters();
 assert.equal(filters.length,12);
 assert.deepEqual(filters[0],{status:'ACTIVE',branch:'GODOY_CRUZ',weekday:'1'});
 assert.deepEqual(filters[11],{status:'ACTIVE',branch:'LUJAN_DE_CUYO',weekday:'6'});
});

test('keeps counts associated with each branch including empty days',()=>{
 const counts=[0,1,2,3,4,5,6,5,4,3,2,0];
 assert.deepEqual(dashboardDaysByBranch(counts),{GODOY_CRUZ:[0,1,2,3,4,5],LUJAN_DE_CUYO:[6,5,4,3,2,0]});
});
