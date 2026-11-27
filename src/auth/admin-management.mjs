import { createHash } from 'node:crypto';
import { hashPassword } from './passwords.mjs';

// Offline provisioning only. Call after explicit approval and backup; never expose by HTTP.
export async function provisionPrincipalInTransaction(client,{email,displayName}){
 if(typeof email!=='string'||email.length>320||!/^\S+@\S+\.\S+$/.test(email.trim().toLowerCase())||typeof displayName!=='string'||!displayName.trim()||displayName.trim().length>200)throw new RangeError('Datos inválidos');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('suyai-principal-provision',0))");
  const target=await client.query("SELECT id FROM users WHERE email=$1 AND role='ADMIN' FOR UPDATE",[email.trim().toLowerCase()]);
  if(!target.rowCount)throw new Error('Cuenta administrativa no encontrada');
  const id=target.rows[0].id;
  const existing=await client.query("SELECT user_id,display_name,active FROM admin_profiles WHERE access_level='PRINCIPAL' FOR UPDATE");
  if(existing.rowCount>1)throw new Error('Existen múltiples principales; la provisión inicial no corresponde');
  if(existing.rowCount){if(existing.rows[0].user_id!==id||existing.rows[0].display_name!==displayName.trim()||!existing.rows[0].active)throw new Error('Ya existe una principal distinta');return id;}
  const others=await client.query("SELECT 1 FROM users WHERE role='ADMIN' AND id<>$1 LIMIT 1",[id]);
  if(others.rowCount)throw new Error('Hay otras cuentas administrativas que requieren revisión antes de continuar');
  await client.query("INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,$2,'PRINCIPAL')",[id,displayName.trim()]);
  return id;
}
export async function provisionPrincipal(pool,input){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const id=await provisionPrincipalInTransaction(client,input);
  await client.query('COMMIT');return id;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

export async function listTeachers(pool,{actorToken}) {
  if(typeof actorToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(actorToken))throw new Error('Operación no autorizada');
  const hash=createHash('sha256').update(actorToken).digest('hex');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const actor=await client.query("SELECT p.access_level FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN admin_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password AND p.active FOR SHARE OF s,u,p",[hash]);
    if(!actor.rowCount)throw new Error('Operación no autorizada');
    const rows=await client.query('SELECT p.user_id AS id,p.display_name AS "displayName",p.access_level AS "accessLevel",p.active FROM admin_profiles p ORDER BY p.active DESC,lower(p.display_name),p.user_id');
    await client.query('COMMIT');return {items:rows.rows};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

export async function createTeacher(pool, { actorToken, displayName, email, temporaryPassword, accessLevel = 'TEACHER' }) {
  if (typeof actorToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(actorToken)) throw new Error('Operación no autorizada');
  if (!['PRINCIPAL','TEACHER'].includes(accessLevel)) throw new RangeError('Nivel de acceso inválido');
  if (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length>200 || typeof email !== 'string' || email.length>320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())) throw new RangeError('Datos inválidos');
  const tokenHash=createHash('sha256').update(actorToken).digest('hex');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const actor=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN admin_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password AND p.access_level='PRINCIPAL' AND p.active FOR SHARE OF s,u,p",[tokenHash]);
    if(!actor.rowCount)throw new Error('Operación no autorizada');
    const hash=await hashPassword(temporaryPassword);
    const result=await client.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES ($1,$2,'ADMIN',true) RETURNING id",[email.trim().toLowerCase(),hash]);
    const id=result.rows[0].id;
    await client.query('INSERT INTO admin_profiles(user_id,display_name,access_level) VALUES ($1,$2,$3)',[id,displayName.trim(),accessLevel]);
    await client.query("INSERT INTO admin_access_events(actor_id,target_id,event_type) VALUES ($1,$2,'CREATED')",[actor.rows[0].id,id]);
    await client.query('COMMIT');
    return id;
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

// Do not expose until login and every privileged service enforce profile status.
export async function deactivateTeacher(pool, { actorToken, teacherId }) {
  if (typeof actorToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(actorToken)) throw new Error('Operación no autorizada');
  if (typeof teacherId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teacherId)) throw new RangeError('Profesor inválido');
  const tokenHash = createHash('sha256').update(actorToken).digest('hex');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const actor=await client.query("SELECT u.id FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN admin_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.role='ADMIN' AND NOT u.must_change_password AND p.access_level='PRINCIPAL' AND p.active FOR SHARE OF s,u,p",[tokenHash]);
    if(!actor.rowCount)throw new Error('Operación no autorizada');
    const target=await client.query("UPDATE admin_profiles SET active=false WHERE user_id=$1 AND access_level='TEACHER' AND active RETURNING user_id",[teacherId]);
    if(!target.rowCount)throw new Error('Profesor no disponible');
    await client.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[teacherId]);
    await client.query("INSERT INTO admin_access_events(actor_id,target_id,event_type) VALUES ($1,$2,'DEACTIVATED')",[actor.rows[0].id,teacherId]);
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
