import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createSession} from '../../src/auth/sessions.mjs';
import {getFeeTierSchedules,scheduleFeeTiers} from '../../src/fees/tier-schedules.mjs';
import {setFeePrice} from '../../src/fees/prices.mjs';
import {scheduleDueDay} from '../../src/fees/due-settings.mjs';

test('la administradora consulta valores iniciales y programa valores futuros sin cambiar el historial',async()=>{
  const url=process.env.TEST_DATABASE_URL;if(!url)throw Error('TEST_DATABASE_URL debe apuntar a una base aislada');
  const schema=`suyai_test_${randomUUID().replaceAll('-','')}`,root=new pg.Client({connectionString:url});await root.connect();await root.query(`CREATE SCHEMA "${schema}"`);
  const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
  try {
    for(const file of ['001_initial.sql','003_financial_foundation.sql','006_auth_sessions.sql','012_fee_price_history.sql','013_fee_due_day_history.sql','015_fee_adjustments.sql','024_fee_tier_schedules.sql','025_admin_profiles.sql'])await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
    const admin=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('admin@test.invalid','hash','ADMIN',false) RETURNING id")).rows[0].id; await pool.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,'Principal','PRINCIPAL')",[admin]);
    const student=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('student@test.invalid','hash','USER',false) RETURNING id")).rows[0].id;
    const adminToken=await createSession(pool,admin),studentToken=await createSession(pool,student);
    await assert.rejects(getFeeTierSchedules(pool,{actorToken:studentToken}),/autoriz/i);
    const initial=await getFeeTierSchedules(pool,{actorToken:adminToken});
    assert.deepEqual(initial.history[0].tiers,[{startDay:1,amountCents:'4500000'},{startDay:11,amountCents:'5000000'},{startDay:21,amountCents:'6000000'},{startDay:31,amountCents:'7500000'}]);
    const next=[{startDay:1,amountCents:'4600000'},{startDay:11,amountCents:'5100000'},{startDay:21,amountCents:'6100000'},{startDay:31,amountCents:'7600000'}];
    await assert.rejects(scheduleFeeTiers(pool,{actorToken:studentToken,tiers:next}),/autoriz/i);
    await scheduleFeeTiers(pool,{actorToken:adminToken,tiers:next});
    await assert.rejects(setFeePrice(pool,{actorToken:adminToken,mode:'SCHEDULE',amountCents:10000n}),/tramos/i);
    await assert.rejects(scheduleDueDay(pool,{actorToken:adminToken,day:10}),/tramos/i);
    const after=await getFeeTierSchedules(pool,{actorToken:adminToken});
    assert.equal(after.history.length,2);assert.deepEqual(after.history[0].tiers,next);assert.deepEqual(after.history[1].tiers,initial.history[0].tiers);
  } finally {await pool.end();await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await root.end();}
});
