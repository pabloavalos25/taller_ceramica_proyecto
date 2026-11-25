import {test} from 'node:test';
import assert from 'node:assert/strict';
import {databaseEndpoint} from '../src/auth/database-location.mjs';

test('returns only the Neon endpoint identifier without credentials or host',()=>{
  assert.equal(databaseEndpoint('postgresql://user:secret@ep-blue-hill-123-pooler.us-east-2.aws.neon.tech/neondb'),'ep-blue-hill-123');
  assert.equal(databaseEndpoint('postgresql://user:secret@ep-blue-hill-123.us-east-2.aws.neon.tech/neondb'),'ep-blue-hill-123');
  assert.equal(databaseEndpoint('postgresql://user:secret@example.com/neondb'),null);
  assert.equal(databaseEndpoint('invalid'),null);
});
