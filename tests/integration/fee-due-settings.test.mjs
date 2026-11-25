import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createSession } from '../../src/auth/sessions.mjs';
import { createAuthHandlers } from '../../src/auth/http-handlers.mjs';
import { initializeDueDay, scheduleDueDay, getDueDays } from '../../src/fees/due-settings.mjs';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('initial due day is restricted, audited, and initialized only once', async () => {
  const schema=`suyai_test_${randomUUID().replaceAll('-','')}`;
  const root=new pg.Client({connectionString:url}); await root.connect(); await root.query(`CREATE SCHEMA "${schema}"`);
  const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
  try {
    for(const file of ['001_initial.sql','006_auth_sessions.sql','012_fee_price_history.sql','013_fee_due_day_history.sql','003_financial_foundation.sql','015_fee_adjustments.sql','024_fee_tier_schedules.sql']) await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
    await pool.query('DELETE FROM fee_tier_rules');await pool.query('DELETE FROM fee_tier_schedules');
    const admin=(await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ('admin@example.com','hash','ADMIN',false) RETURNING id")).rows[0].id;
    const student=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('ana@example.com','hash','USER') RETURNING id")).rows[0].id;
    const token=await createSession(pool,admin), other=await createSession(pool,student);
    await assert.rejects(initializeDueDay(pool,{actorToken:other,day:10}),/autoriz/i);
    for(const day of [0,29,31,1.5]) await assert.rejects(initializeDueDay(pool,{actorToken:token,day}),/día/i);
    const results=await Promise.allSettled([initializeDueDay(pool,{actorToken:token,day:10}),initializeDueDay(pool,{actorToken:token,day:28})]);
    assert.equal(results.filter((r)=>r.status==='fulfilled').length,1);
    assert.equal(results.filter((r)=>r.status==='rejected').length,1);
    const settings=await getDueDays(pool,{actorToken:token});
    assert.ok([10,28].includes(settings.current.day));
    assert.equal(settings.history.length,1); assert.equal(settings.current.actorId,admin);
    assert.equal(settings.history[0].effectivePeriod,(await pool.query("SELECT to_char(date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires'),'YYYY-MM-DD') AS d")).rows[0].d);
    await scheduleDueDay(pool,{actorToken:token,day:15});
    await scheduleDueDay(pool,{actorToken:token,day:20});
    const updated=await getDueDays(pool,{actorToken:token});
    assert.equal(updated.current.day,settings.current.day); assert.equal(updated.next.day,20); assert.equal(updated.history.length,3);
    assert.equal(updated.next.effectivePeriod,(await pool.query("SELECT to_char(date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires') + interval '1 month','YYYY-MM-DD') AS d")).rows[0].d);
    await assert.rejects(scheduleDueDay(pool,{actorToken:token,day:29}),/día/i);
    await assert.rejects(scheduleDueDay(pool,{actorToken:other,day:15}),/autoriz/i);
    const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,getDueDays:(data)=>getDueDays(pool,data),setDueDay:({mode,...data})=>mode==='INITIAL'?initializeDueDay(pool,data):scheduleDueDay(pool,data)});
    const read=(cookie)=>new Request('https://suyai.example/api',{headers:{cookie:`__Host-suyai_session=${cookie}`}});
    assert.equal((await handlers.getDueDays(read(other))).status,403);
    const response=await handlers.getDueDays(read(token)); assert.equal(response.status,200); assert.equal((await response.json()).next.day,20);
    await pool.query('DELETE FROM fee_price_lock WHERE id=true');
    await assert.rejects(scheduleDueDay(pool,{actorToken:token,day:12}),/bloqueo/i);
  } finally { await pool.end(); await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await root.end(); }
});
