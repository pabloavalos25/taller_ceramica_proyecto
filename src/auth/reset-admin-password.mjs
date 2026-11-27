import {createHash} from 'node:crypto';
import {hashPassword} from './passwords.mjs';

// Administrative recovery requires direct privileged database access; never expose via HTTP.
export async function resetAdminPassword(pool,{email,password}){
 if(typeof email!=='string'||email.length>320||!/^\S+@\S+\.\S+$/.test(email.trim()))throw new RangeError('Correo inválido');
 const normalized=email.trim().toLowerCase();
 const hash=await hashPassword(password);
 const key=createHash('sha256').update(`account:${normalized}`).digest('hex');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT bucket FROM login_throttle WHERE bucket=$1 FOR UPDATE',[key]);
  const target=await client.query("SELECT id FROM users WHERE email=$1 AND role='ADMIN' FOR UPDATE",[normalized]);
  if(!target.rowCount)throw Error('No se encontró el administrador indicado');
  const id=target.rows[0].id;
  await client.query('UPDATE users SET password_hash=$1,must_change_password=false WHERE id=$2',[hash,id]);
  await client.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[id]);
  await client.query('DELETE FROM password_change_throttle WHERE user_id=$1',[id]);
  await client.query('DELETE FROM login_throttle WHERE bucket=$1',[key]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
