import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthHandlers} from '../src/auth/http-handlers.mjs';
import {createTeacher} from '../src/auth/admin-management.mjs';

const token='a'.repeat(43);
const request=(body)=>new Request('https://suyai.example/api/admin/teachers',{method:'POST',headers:{origin:'https://suyai.example',cookie:`__Host-suyai_session=${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
const input={displayName:'Ana',email:'ana@example.test',temporaryPassword:'ClaveTemporal_8264!'};

test('transmite el perfil elegido al crear un acceso',async()=>{
  let received;
  const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,createTeacher:async data=>{received=data;return 'id';}});
  const response=await handlers.teachers(request({...input,accessLevel:'PRINCIPAL'}));
  assert.equal(response.status,201);
  assert.equal(received.accessLevel,'PRINCIPAL');
  assert.equal(received.actorToken,token);
});

test('rechaza perfiles desconocidos y datos que intenten reemplazar la sesión',async()=>{
  let calls=0;
  const handlers=createAuthHandlers({origin:'https://suyai.example',production:true,createTeacher:async()=>{calls++;}});
  assert.equal((await handlers.teachers(request({...input,accessLevel:'SUPERUSER'}))).status,400);
  assert.equal((await handlers.teachers(request({...input,accessLevel:'TEACHER',actorToken:'b'.repeat(43)}))).status,400);
  assert.equal(calls,0);
  assert.equal((await handlers.teachers(request({...input,accessLevel:'TEACHER'}))).status,201);
});

test('el servicio guarda el perfil solicitado solamente para una principal autorizada',async()=>{
  let profile;
  const client={release(){},async query(sql,params){
    if(sql.startsWith('SELECT u.id')) return {rowCount:1,rows:[{id:'actor'}]};
    if(sql.startsWith('INSERT INTO users')) return {rows:[{id:'new-user'}]};
    if(sql.startsWith('INSERT INTO admin_profiles')) profile=params;
    return {rowCount:1,rows:[]};
  }};
  await createTeacher({connect:async()=>client},{...input,actorToken:token,accessLevel:'PRINCIPAL'});
  assert.equal(profile[2],'PRINCIPAL');
  await createTeacher({connect:async()=>client},{...input,actorToken:token,accessLevel:'TEACHER'});
  assert.equal(profile[2],'TEACHER');
  const denied={release(){},async query(sql){return sql.startsWith('SELECT u.id')?{rowCount:0,rows:[]}:{rowCount:1,rows:[]};}};
  await assert.rejects(createTeacher({connect:async()=>denied},{...input,actorToken:token,accessLevel:'PRINCIPAL'}),/no autorizada/i);
  await assert.rejects(createTeacher({connect:async()=>client},{...input,actorToken:token,accessLevel:'OTHER'}),/inválido/i);
});
