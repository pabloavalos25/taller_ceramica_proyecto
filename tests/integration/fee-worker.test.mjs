import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {createFeeCronHandler} from '../../src/fees/cron.mjs';
import {runGeneration} from '../../src/fees/run-generation.mjs';
const exec=promisify(execFile);
const url=process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL debe apuntar a una base de pruebas aislada');

test('scheduled job fails closed until configured and safely resumes after restart', async () => {
  const schema=`suyai_test_${randomUUID().replaceAll('-','')}`;
  const root=new pg.Client({connectionString:url}); await root.connect(); await root.query(`CREATE SCHEMA "${schema}"`);
  const pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
  try {
    for(const file of ['001_initial.sql','002_student_status_history.sql','003_financial_foundation.sql','010_student_creation.sql','011_student_status_changes.sql','012_fee_price_history.sql','013_fee_due_day_history.sql','014_fee_generation.sql','004_payment_idempotency.sql','005_payment_void.sql','015_fee_adjustments.sql','024_fee_tier_schedules.sql']) await pool.query(await readFile(new URL(`../../db/migrations/${file}`,import.meta.url),'utf8'));
    await pool.query('DELETE FROM fee_tier_rules');await pool.query('DELETE FROM fee_tier_schedules');
  const admin=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('admin@example.com','hash','ADMIN') RETURNING id")).rows[0].id;
    const student=(await pool.query("INSERT INTO users(email,password_hash,role) VALUES ('ana@example.com','hash','USER') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO student_profiles(user_id,full_name,enrolled_on) VALUES ($1,'Ana',current_date)",[student]);
    const month=(await pool.query("SELECT to_char(date_trunc('month',now() AT TIME ZONE 'America/Argentina/Buenos_Aires'),'YYYY-MM') AS p")).rows[0].p;
    await pool.query("INSERT INTO student_fee_preferences(student_id,start_period) VALUES ($1,($2||'-01')::date)",[student,month]);
    await pool.query('INSERT INTO student_creation_events(actor_id,student_id) VALUES ($1,$2)',[admin,student]);
    await pool.query("INSERT INTO fee_price_history(effective_period,amount_cents,actor_id) VALUES (($1||'-01')::date,3500000,$2)",[month,admin]);
    const script=fileURLToPath(new URL('../../scripts/fees-worker.mjs',import.meta.url));
    const env={...process.env,DATABASE_URL:url,PGOPTIONS:`-c search_path=${schema}`,FEE_GENERATION_START:month,FEE_WORKER_ENABLED:'true'};
    await assert.rejects(exec(process.execPath,[script,'--once'],{env}));
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM monthly_fees')).rows[0].n,0);
    await pool.query("INSERT INTO fee_due_day_history(effective_period,due_day,actor_id) VALUES (($1||'-01')::date,10,$2)",[month,admin]);
    const secret='a'.repeat(48);const cron=createFeeCronHandler({enabled:true,secret,startPeriod:month,run:period=>runGeneration(pool,period)});
    const request=token=>new Request('https://suyai.example/api/cron/fees',{headers:{authorization:`Bearer ${token}`}});
    assert.equal((await cron(request('bad'))).status,401);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM monthly_fees')).rows[0].n,0);
    assert.equal((await (await cron(request(secret))).json()).created,1);
    assert.equal((await (await cron(request(secret))).json()).created,0);
    const first=await exec(process.execPath,[script,'--once'],{env}); assert.match(first.stdout,/nuevas: 0/);
    const second=await exec(process.execPath,[script,'--once'],{env}); assert.match(second.stdout,/nuevas: 0/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM monthly_fees')).rows[0].n,1);
    await assert.rejects(exec(process.execPath,[script,'--once'],{env:{...env,FEE_WORKER_ENABLED:'false'}}));
  } finally { await pool.end(); await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await root.end(); }
});
