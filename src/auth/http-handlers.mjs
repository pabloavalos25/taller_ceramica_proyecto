import { checkMutationOrigin } from './http-security.mjs';
import { studentServiceDiagnostic } from './diagnostics.mjs';

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
async function readBody(request, limit = 4096) {
  if (!request.body) throw new Error('Sin datos');
  const reader = request.body.getReader();
  const chunks = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); throw new Error('Datos demasiado extensos'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function getCookie(request, name) {
  const values = (request.headers.get('cookie') ?? '').split(';').map((v) => v.trim()).filter((v) => v.startsWith(`${name}=`)).map((v) => v.slice(name.length + 1));
  return values.length === 1 && tokenPattern.test(values[0]) ? values[0] : null;
}

export function createAuthHandlers({ origin, production, authenticate, revokeSession, getSession, changePassword, resetStudentPassword, createStudent, changeStudentStatus, listStudents, getDashboardCounts, setFeePrice, getFeePrices, getFeeTierSchedules, scheduleFeeTiers, setDueDay, getDueDays, adjustFee, listAdjustableFees, saveKilnBatch, listKilnBatches, getKilnBatch, correctKilnItem, saveMaterial, listMaterials, saveMaterialBatch, listMaterialBatches, getMaterialBatch, listPayableCharges, recordAuthorizedPayment, listPayments, getPayment, voidAuthorizedPayment, getStudentPortal, getAdminSummary, correctMaterialItem, listDrafts, getDraft, saveDraft, confirmDraft, createTeacher, listTeachers, deactivateTeacher, assignStudentTeacher, listStudentTeacherHistory }) {
  const name = production ? '__Host-suyai_session' : 'suyai_session';
  const cookie = (value, maxAge) => `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production ? '; Secure' : ''}`;
  const allowed = (request) => checkMutationOrigin(request, origin, production);
  return {
    async studentTeacher(request) {
      if(request.method==='GET'){
        const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);
        const params=new URL(request.url).searchParams;
        if([...params.keys()].some(k=>k!=='studentId'||params.getAll(k).length!==1)||!params.get('studentId'))return json({error:'Datos inválidos'},400);
        try{return json(await listStudentTeacherHistory({actorToken:token,studentId:params.get('studentId')}));}
        catch(error){if(/no autorizada/i.test(error?.message??''))return json({error:'Operación no autorizada'},403);if(error instanceof RangeError)return json({error:'Datos inválidos'},400);return json({error:'Servicio no disponible'},503);}
      }
      if(!allowed(request))return json({error:'Solicitud no permitida'},403);
      const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);
      let body;try{body=await readBody(request);}catch{return json({error:'Datos inválidos'},400);}
      if(!body||Object.keys(body).some(k=>!['studentId','teacherId'].includes(k))||typeof body.studentId!=='string'||typeof body.teacherId!=='string')return json({error:'Datos inválidos'},400);
      try{await assignStudentTeacher({actorToken:token,studentId:body.studentId,teacherId:body.teacherId});return json({ok:true});}
      catch(error){if(/no autorizada/i.test(error?.message??''))return json({error:'Operación no autorizada'},403);if(error instanceof RangeError)return json({error:'Datos inválidos'},400);return json({error:'Servicio no disponible'},503);}
    },
    async teachers(request) {
      const token=getCookie(request,name); if(!token)return json({error:'No autenticado'},401);
      try {
        if(request.method==='GET') return json(await listTeachers({actorToken:token}));
        if(!allowed(request))return json({error:'Solicitud no permitida'},403);
        let body;try{body=await readBody(request);}catch{return json({error:'Datos inválidos'},400);}
        if(request.method==='POST'){
          if(!body||Object.keys(body).some(k=>!['displayName','email','temporaryPassword','accessLevel'].includes(k))||typeof body.displayName!=='string'||typeof body.email!=='string'||typeof body.temporaryPassword!=='string'||(body.accessLevel!==undefined&&!['PRINCIPAL','TEACHER'].includes(body.accessLevel)))return json({error:'Datos inválidos'},400);
          const id=await createTeacher({actorToken:token,...body});return json({id},201);
        }
        if(request.method==='DELETE'){
          if(!body||Object.keys(body).some(k=>k!=='teacherId')||typeof body.teacherId!=='string')return json({error:'Datos inválidos'},400);
          await deactivateTeacher({actorToken:token,teacherId:body.teacherId});return json({ok:true});
        }
        return json({error:'Solicitud no permitida'},403);
      } catch(error){if(/no autorizada/i.test(error?.message??''))return json({error:'Operación no autorizada'},403);if(error instanceof RangeError||error?.code==='23505')return json({error:'Revisá los datos ingresados.'},400);return json({error:'Servicio no disponible'},503);}
    },
    async feeTiers(request) {
      const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);
      try {
        if(request.method==='GET')return json(await getFeeTierSchedules({actorToken:token}));
        if(request.method!=='POST'||!allowed(request))return json({error:'Solicitud no permitida'},403);
        let body;try{body=await readBody(request);}catch{return json({error:'Datos inválidos'},400);}
        if(!body||!Array.isArray(body.tiers)||Object.keys(body).some(key=>key!=='tiers')||body.tiers.some(rule=>!rule||Object.keys(rule).some(key=>!['startDay','amountCents'].includes(key))))return json({error:'Datos inválidos'},400);
        return json(await scheduleFeeTiers({actorToken:token,tiers:body.tiers}));
      }catch(error){if(error instanceof RangeError)return json({error:error.message},400);if(/no autorizada/i.test(error?.message??''))return json({error:'Operación no autorizada'},403);return json({error:'Servicio no disponible'},503);}
    },
    async adminSummary(request) {
      const token=getCookie(request,name);
      if(!token)return json({error:'Sesión requerida'},401);
      try{return json(await getAdminSummary({actorToken:token}));}
      catch(error){return /no autorizada/i.test(error.message) ? json({error:'Operación no autorizada'},403) : json({error:'Servicio no disponible'},503);}
    },
    async login(request) {
      if (!allowed(request)) return json({ error: 'Solicitud no permitida' }, 403);
      let body;
      try { body = await readBody(request); } catch { return json({ error: 'Datos inválidos' }, 400); }
      if (!body || typeof body.email !== 'string' || typeof body.password !== 'string' || Object.keys(body).some((key) => !['email', 'password'].includes(key))) return json({ error: 'Datos inválidos' }, 400);
      try {
        const token = await authenticate({ email: body.email, password: body.password, source: null });
        if (!token || !tokenPattern.test(token)) return json({ error: 'No fue posible ingresar con esos datos' }, 401);
        return json({ ok: true }, 200, { 'Set-Cookie': cookie(token, 43200) });
      } catch { return json({ error: 'Servicio no disponible' }, 503); }
    },
    async logout(request) {
      if (!allowed(request)) return json({ error: 'Solicitud no permitida' }, 403);
      const token = getCookie(request, name);
      try { if (token) await revokeSession(token); }
      catch { return json({ error: 'Servicio no disponible' }, 503); }
      return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
    },
    async changePassword(request) {
      if (!allowed(request)) return json({ error: 'Solicitud no permitida' }, 403);
      const token = getCookie(request, name);
      if (!token) return json({ error: 'No autenticado' }, 401);
      let body;
      try { body = await readBody(request); } catch { return json({ error: 'Datos inválidos' }, 400); }
      if (!body || typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string' || Object.keys(body).some((key) => !['currentPassword', 'newPassword'].includes(key))) return json({ error: 'Datos inválidos' }, 400);
      try {
        await changePassword(token, body.currentPassword, body.newPassword);
        return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
      } catch (error) {
        if (error?.code === 'SESSION') return json({ error: 'No autenticado' }, 401);
        if (error?.code === 'LIMIT') return json({ error: 'Demasiados intentos. Intentá nuevamente más tarde.' }, 429);
        if (error?.code === 'CREDENTIALS' || error instanceof RangeError) return json({ error: 'Revisá la contraseña actual y la nueva contraseña.' }, 400);
        return json({ error: 'Servicio no disponible' }, 503);
      }
    },
    async resetStudentPassword(request) {
      if (!allowed(request)) return json({ error: 'Solicitud no permitida' }, 403);
      const token = getCookie(request, name);
      if (!token) return json({ error: 'No autenticado' }, 401);
      let body;
      try { body = await readBody(request); } catch { return json({ error: 'Datos inválidos' }, 400); }
      if (!body || typeof body.studentId !== 'string' || typeof body.temporaryPassword !== 'string' || typeof body.reason !== 'string' || Object.keys(body).some((key) => !['studentId', 'temporaryPassword', 'reason'].includes(key))) return json({ error: 'Datos inválidos' }, 400);
      try {
        await resetStudentPassword({ actorToken: token, studentId: body.studentId, temporaryPassword: body.temporaryPassword, reason: body.reason });
        return json({ ok: true });
      } catch (error) {
        if (error?.code === 'FORBIDDEN') return json({ error: 'Operación no autorizada' }, 403);
        if (error?.code === 'STUDENT' || error instanceof RangeError) return json({ error: 'Revisá los datos ingresados.' }, 400);
        return json({ error: 'Servicio no disponible' }, 503);
      }
    },
    async createStudent(request) {
      if (!allowed(request)) return json({ error: 'Solicitud no permitida' }, 403);
      const token = getCookie(request, name);
      if (!token) return json({ error: 'No autenticado' }, 401);
      let body;
      try { body = await readBody(request); } catch { return json({ error: 'Datos inválidos' }, 400); }
      const keys = ['fullName', 'email', 'phone', 'initialPassword', 'enrolledOn', 'active', 'weekdays', 'feeStart', 'branch','teacherId'];
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(body, key))) return json({ error: 'Datos inválidos' }, 400);
      try {
        const id = await createStudent({ actorToken: token, fullName: body.fullName, email: body.email, phone: body.phone, initialPassword: body.initialPassword, enrolledOn: body.enrolledOn, active: body.active, weekdays: body.weekdays, feeStart: body.feeStart, branch:body.branch,teacherId:body.teacherId });
        return json({ id }, 201);
      } catch (error) {
        if (error?.code === 'FORBIDDEN') return json({ error: 'Operación no autorizada' }, 403);
        if (error?.code === 'DUPLICATE') return json({ error: 'El correo ya está registrado.' }, 409);
        if (error instanceof RangeError) return json({ error: 'Revisá los datos ingresados.' }, 400);
        studentServiceDiagnostic('create', error);
        return json({ error: 'Servicio no disponible' }, 503);
      }
    },
    async changeStudentStatus(request) {
      if (!allowed(request)) return json({ error: 'Solicitud no permitida' }, 403);
      const token = getCookie(request, name);
      if (!token) return json({ error: 'No autenticado' }, 401);
      let body;
      try { body = await readBody(request); } catch { return json({ error: 'Datos inválidos' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.studentId !== 'string' || typeof body.action !== 'string' || Object.keys(body).some((key) => !['studentId', 'action', 'feeStart'].includes(key))) return json({ error: 'Datos inválidos' }, 400);
      try {
        const result = await changeStudentStatus({ actorToken: token, studentId: body.studentId, action: body.action, feeStart: body.feeStart });
        return json(result);
      } catch (error) {
        if (error?.code === 'FORBIDDEN') return json({ error: 'Operación no autorizada' }, 403);
        if (error?.code === 'STATE') return json({ error: 'La alumna ya tiene ese estado.' }, 409);
        if (error?.code === 'STUDENT' || error instanceof RangeError) return json({ error: 'Revisá los datos ingresados.' }, 400);
        return json({ error: 'Servicio no disponible' }, 503);
      }
    },
    async dashboardCounts(request) {
      const token=getCookie(request,name);
      if(!token)return json({error:'No autenticado'},401);
      try{return json(await getDashboardCounts({actorToken:token}));}
      catch(error){if(error?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);return json({error:'Servicio no disponible'},503);}
    },
    async listStudents(request) {
      const token = getCookie(request, name);
      if (!token) return json({ error: 'No autenticado' }, 401);
      const params = new URL(request.url).searchParams;
      const keys = ['search','status','weekday','economic','branch','teacherId','limit','offset'];
      if ([...params.keys()].some((key) => !keys.includes(key) || params.getAll(key).length !== 1)) return json({ error: 'Filtros inválidos' }, 400);
      const number = (key, fallback) => { const value = params.get(key); if (value === null) return fallback; if (!/^\d{1,6}$/.test(value)) throw new RangeError('Filtro inválido'); return Number(value); };
      try {
        const data = await listStudents({ actorToken:token, search:params.get('search') ?? '', status:params.get('status') ?? 'ALL', weekday:number('weekday', null), economic:params.get('economic') ?? 'ALL', branch:params.get('branch') ?? 'ALL', teacherId:params.get('teacherId'),limit:number('limit', 50), offset:number('offset', 0) });
        return json(data);
      } catch (error) {
        if (error?.code === 'FORBIDDEN') return json({ error: 'Operación no autorizada' }, 403);
        if (error instanceof RangeError) return json({ error: 'Filtros inválidos' }, 400);
        studentServiceDiagnostic('list', error);
        return json({ error: 'Servicio no disponible' }, 503);
      }
    },
    async getFeePrices(request) {
      const token = getCookie(request, name);
      if (!token) return json({ error:'No autenticado' }, 401);
      try { return json(await getFeePrices({ actorToken:token })); }
      catch (error) { if (error?.code === 'FORBIDDEN') return json({ error:'Operación no autorizada' },403); return json({ error:'Servicio no disponible' },503); }
    },
    async setFeePrice(request) {
      if (!allowed(request)) return json({ error:'Solicitud no permitida' },403);
      const token = getCookie(request, name);
      if (!token) return json({ error:'No autenticado' },401);
      let body;
      try { body = await readBody(request); } catch { return json({ error:'Datos inválidos' },400); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.amountCents !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(body.amountCents) || !['INITIAL','SCHEDULE'].includes(body.mode) || Object.keys(body).some((key)=>!['mode','amountCents'].includes(key))) return json({ error:'Datos inválidos' },400);
      try { await setFeePrice({ actorToken:token, mode:body.mode, amountCents:BigInt(body.amountCents) }); return json({ ok:true }); }
      catch (error) {
        if (error?.code === 'FORBIDDEN') return json({ error:'Operación no autorizada' },403);
        if (error?.code === 'TIERS') return json({ error:'Configurá los importes desde la sección de tramos.' },409);
        if (error?.code === 'INITIAL') return json({ error:'Revisá la configuración inicial de la cuota.' },409);
        if (error instanceof RangeError) return json({ error:'Datos inválidos' },400);
        return json({ error:'Servicio no disponible' },503);
      }
    },
    async getDueDays(request) {
      const token=getCookie(request,name);
      if (!token) return json({error:'No autenticado'},401);
      try { return json(await getDueDays({actorToken:token})); }
      catch(error) { if(error?.code==='FORBIDDEN') return json({error:'Operación no autorizada'},403); return json({error:'Servicio no disponible'},503); }
    },
    async setDueDay(request) {
      if (!allowed(request)) return json({error:'Solicitud no permitida'},403);
      const token=getCookie(request,name);
      if (!token) return json({error:'No autenticado'},401);
      let body;
      try { body=await readBody(request); } catch { return json({error:'Datos inválidos'},400); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || !['INITIAL','SCHEDULE'].includes(body.mode) || !Number.isInteger(body.day) || body.day<1 || body.day>28 || Object.keys(body).some((key)=>!['mode','day'].includes(key))) return json({error:'Datos inválidos'},400);
      try { await setDueDay({actorToken:token,mode:body.mode,day:body.day}); return json({ok:true}); }
      catch(error) {
        if(error?.code==='FORBIDDEN') return json({error:'Operación no autorizada'},403);
        if(error?.code==='TIERS') return json({error:'Configurá los vencimientos desde la sección de tramos.'},409);
        if(error?.code==='INITIAL') return json({error:'Revisá la configuración inicial del vencimiento.'},409);
        if(error instanceof RangeError) return json({error:'Datos inválidos'},400);
        return json({error:'Servicio no disponible'},503);
      }
    },
    async listAdjustableFees(request) {
      const token=getCookie(request,name);
      if (!token) return json({error:'No autenticado'},401);
      const params=new URL(request.url).searchParams;
      if ([...params.keys()].some(key=>!['search','offset'].includes(key) || params.getAll(key).length!==1) || !/^\d{1,6}$/.test(params.get('offset') ?? '0')) return json({error:'Filtros inválidos'},400);
      try { return json(await listAdjustableFees({actorToken:token,search:params.get('search') ?? '',offset:Number(params.get('offset') ?? '0')})); }
      catch(error) { if(error?.code==='FORBIDDEN') return json({error:'Operación no autorizada'},403); if(error instanceof RangeError) return json({error:'Filtros inválidos'},400); return json({error:'Servicio no disponible'},503); }
    },
    async listMaterials(request) {
      const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);
      const params=new URL(request.url).searchParams;
      if([...params.keys()].some(key=>!['search','active','offset'].includes(key)||params.getAll(key).length!==1)||!/^\d{1,6}$/.test(params.get('offset')??'0'))return json({error:'Filtros inválidos'},400);
      try{return json(await listMaterials({actorToken:token,search:params.get('search')??'',active:params.get('active')??'ALL',offset:Number(params.get('offset')??'0')}));}
      catch(error){if(error?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(error instanceof RangeError)return json({error:'Filtros inválidos'},400);return json({error:'Servicio no disponible'},503);}
    },
    async saveMaterial(request) {
      if(!allowed(request))return json({error:'Solicitud no permitida'},403);
      const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);
      let body;try{body=await readBody(request);}catch{return json({error:'Datos inválidos'},400);}
      const fields=['name','category','description','unit','customUnit','priceCents','active'];
      if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.idempotencyKey!=='string'||Object.keys(body).some(k=>!['idempotencyKey','materialId','expectedVersion','material'].includes(k))||!body.material||typeof body.material!=='object'||Array.isArray(body.material)||fields.some(k=>!Object.hasOwn(body.material,k))||Object.keys(body.material).some(k=>!fields.includes(k))||typeof body.material.priceCents!=='string'||!/^(0|[1-9]\d{0,18})$/.test(body.material.priceCents))return json({error:'Datos inválidos'},400);
      try{return json(await saveMaterial({actorToken:token,idempotencyKey:body.idempotencyKey,materialId:body.materialId??null,expectedVersion:body.expectedVersion??null,material:{...body.material,priceCents:BigInt(body.material.priceCents)}}));}
      catch(error){if(error?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(['VERSION','IDEMPOTENCY'].includes(error?.code))return json({error:error.message},409);if(error?.code==='MATERIAL'||error instanceof RangeError)return json({error:'Revisá los datos ingresados.'},400);return json({error:'Servicio no disponible'},503);}
    },
    async correctKilnItem(request) {
      if(!allowed(request))return json({error:'Solicitud no permitida'},403);
      const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);
      let body;try{body=await readBody(request);}catch{return json({error:'Datos inválidos'},400);}
      const fields=['itemId','action','amountCents','reason','idempotencyKey'];
      if(!body||typeof body!=='object'||Array.isArray(body)||fields.some(field=>typeof body[field]!=='string')||Object.keys(body).some(key=>!fields.includes(key))||!/^(0|[1-9]\d{0,18})$/.test(body.amountCents))return json({error:'Datos inválidos'},400);
      try{return json(await correctKilnItem({actorToken:token,itemId:body.itemId,action:body.action,amountCents:BigInt(body.amountCents),reason:body.reason,idempotencyKey:body.idempotencyKey}));}
      catch(error){if(error?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(['PAID','INCONSISTENT','IDEMPOTENCY','VOIDED','UNCHANGED'].includes(error?.code))return json({error:error.message},409);if(error?.code==='ITEM'||error instanceof RangeError)return json({error:'Revisá los datos ingresados.'},400);return json({error:'Servicio no disponible'},503);}
    },
    async draftQuery(request){
      const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);const p=new URL(request.url).searchParams;
      if([...p.keys()].some(k=>!['draftId','type','offset'].includes(k)||p.getAll(k).length!==1)||(p.has('draftId')&&[...p.keys()].length!==1)||(!p.has('draftId')&&(!p.has('type')||!/^\d{1,6}$/.test(p.get('offset')??'0'))))return json({error:'Filtros inválidos'},400);
      try{if(p.has('draftId')){const result=await getDraft({actorToken:token,draftId:p.get('draftId')});return result?json(result):json({error:'Borrador inexistente'},404);}return json(await listDrafts({actorToken:token,type:p.get('type'),offset:Number(p.get('offset')??'0')}));}
      catch(e){if(e?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(e instanceof RangeError)return json({error:'Filtros inválidos'},400);return json({error:'Servicio no disponible'},503);}
    },
    async draftMutation(request){
      if(!allowed(request))return json({error:'Solicitud no permitida'},403);const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);let body;try{body=await readBody(request,1100000);}catch{return json({error:'Datos inválidos o demasiado extensos'},400);}
      const common=['action','draftId','expectedVersion','idempotencyKey'],fields=body?.action==='SAVE'?[...common,'type','data']:common;if(!body||typeof body!=='object'||Array.isArray(body)||!['SAVE','CONFIRM'].includes(body.action)||typeof body.draftId!=='string'||typeof body.idempotencyKey!=='string'||!Number.isInteger(body.expectedVersion)||Object.keys(body).some(k=>!fields.includes(k)))return json({error:'Datos inválidos'},400);
      try{const input={actorToken:token,draftId:body.draftId,expectedVersion:body.expectedVersion,idempotencyKey:body.idempotencyKey};return json(body.action==='SAVE'?await saveDraft({...input,type:body.type,data:body.data}):await confirmDraft(input));}
      catch(e){if(e?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(['VERSION','CONFIRMED','IDEMPOTENCY','INACTIVE','MATERIAL','PRICE'].includes(e?.code))return json({error:e.message,code:e.code},409);if(e?.code==='DRAFT'||e?.code==='STUDENT'||e instanceof RangeError||e instanceof TypeError)return json({error:'Revisá los datos del borrador.'},400);return json({error:'Servicio no disponible'},503);}
    },
    async correctMaterialItem(request){
      if(!allowed(request))return json({error:'Solicitud no permitida'},403);const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);let body;try{body=await readBody(request);}catch{return json({error:'Datos inválidos'},400);}
      const fields=['itemId','action','amountCents','reason','idempotencyKey'];if(!body||typeof body!=='object'||Array.isArray(body)||fields.some(k=>typeof body[k]!=='string')||Object.keys(body).some(k=>!fields.includes(k))||!/^(0|[1-9]\d{0,18})$/.test(body.amountCents))return json({error:'Datos inválidos'},400);
      try{return json(await correctMaterialItem({actorToken:token,itemId:body.itemId,action:body.action,amountCents:BigInt(body.amountCents),reason:body.reason,idempotencyKey:body.idempotencyKey}));}
      catch(e){if(e?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(['PAID','INCONSISTENT','IDEMPOTENCY','VOIDED','UNCHANGED'].includes(e?.code))return json({error:e.message},409);if(e?.code==='ITEM'||e instanceof RangeError)return json({error:'Revisá los datos ingresados.'},400);return json({error:'Servicio no disponible'},503);}
    },
    async studentPortal(request){
      const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);const p=new URL(request.url).searchParams;
      if([...p.keys()].some(k=>!['chargesOffset','paymentsOffset'].includes(k)||p.getAll(k).length!==1)||!/^\d{1,6}$/.test(p.get('chargesOffset')??'0')||!/^\d{1,6}$/.test(p.get('paymentsOffset')??'0'))return json({error:'Filtros inválidos'},400);
      try{return json(await getStudentPortal({actorToken:token,chargesOffset:Number(p.get('chargesOffset')??'0'),paymentsOffset:Number(p.get('paymentsOffset')??'0')}));}
      catch(e){if(e?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(e instanceof RangeError)return json({error:'Filtros inválidos'},400);return json({error:'Servicio no disponible'},503);}
    },
    async paymentHistory(request){
      const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);const p=new URL(request.url).searchParams;
      if([...p.keys()].some(k=>!['paymentId','search','status','offset'].includes(k)||p.getAll(k).length!==1)||!/^\d{1,6}$/.test(p.get('offset')??'0')||(p.has('paymentId')&&[...p.keys()].length!==1))return json({error:'Filtros inválidos'},400);
      try{if(p.has('paymentId')){const result=await getPayment({actorToken:token,paymentId:p.get('paymentId')});return result?json(result):json({error:'Pago inexistente'},404);}return json(await listPayments({actorToken:token,search:p.get('search')??'',status:p.get('status')??'ALL',offset:Number(p.get('offset')??'0')}));}
      catch(e){if(e?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(e instanceof RangeError)return json({error:'Filtros inválidos'},400);return json({error:'Servicio no disponible'},503);}
    },
    async voidPayment(request){
      if(!allowed(request))return json({error:'Solicitud no permitida'},403);const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);let body;try{body=await readBody(request);}catch{return json({error:'Datos inválidos'},400);}
      if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.paymentId!=='string'||typeof body.reason!=='string'||Object.keys(body).some(k=>!['paymentId','reason'].includes(k)))return json({error:'Datos inválidos'},400);
      try{return json(await voidAuthorizedPayment({actorToken:token,paymentId:body.paymentId,reason:body.reason}));}
      catch(e){if(e?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(e instanceof RangeError)return json({error:'Revisá el motivo y los datos.'},400);if(/anulado|inexistente/i.test(e?.message??''))return json({error:e.message},409);return json({error:'Servicio no disponible'},503);}
    },
    async payableCharges(request){
      const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);
      const p=new URL(request.url).searchParams;if([...p.keys()].some(k=>!['studentId','offset'].includes(k)||p.getAll(k).length!==1)||!p.get('studentId')||!/^\d{1,6}$/.test(p.get('offset')??'0'))return json({error:'Filtros inválidos'},400);
      try{return json(await listPayableCharges({actorToken:token,studentId:p.get('studentId'),offset:Number(p.get('offset')??'0')}));}catch(e){if(e?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(e?.code==='STUDENT'||e instanceof RangeError)return json({error:'Revisá los datos.'},400);return json({error:'Servicio no disponible'},503);}
    },
    async recordPayment(request){
      if(!allowed(request))return json({error:'Solicitud no permitida'},403);const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);
      let body;try{body=await readBody(request,131072);}catch{return json({error:'Datos inválidos o demasiado extensos'},400);}
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['studentId','idempotencyKey','method','allocations','notes'].includes(k))||!Array.isArray(body.allocations)||!body.allocations.length||body.allocations.length>500||body.allocations.some(x=>!x||Object.keys(x).some(k=>!['chargeId','amountCents'].includes(k))||typeof x.chargeId!=='string'||typeof x.amountCents!=='string'||!/^[1-9]\d{0,18}$/.test(x.amountCents)))return json({error:'Datos inválidos'},400);
      try{return json(await recordAuthorizedPayment({actorToken:token,studentId:body.studentId,idempotencyKey:body.idempotencyKey,method:body.method,notes:body.notes??null,allocations:body.allocations.map(x=>({chargeId:x.chargeId,amount:BigInt(x.amountCents)}))}));}
      catch(e){if(e?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(e instanceof RangeError&&e.message==='La cuota debe abonarse completa.')return json({error:'La cuota debe abonarse completa.'},409);if(e instanceof RangeError||/idempotencia|cargo inexistente/i.test(e?.message??''))return json({error:'No se pudo registrar: revisá los importes y saldos actualizados.'},409);return json({error:'Servicio no disponible'},503);}
    },
    async materialHistory(request) {
      const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);
      const params=new URL(request.url).searchParams;
      if([...params.keys()].some(key=>!['period','offset','batchId'].includes(key)||params.getAll(key).length!==1)||!/^\d{1,6}$/.test(params.get('offset')??'0')||(params.has('batchId')&&(params.has('period')||params.has('offset'))))return json({error:'Filtros inválidos'},400);
      try{if(params.has('batchId')){const result=await getMaterialBatch({actorToken:token,batchId:params.get('batchId')});return result?json(result):json({error:'Carga inexistente'},404);}return json(await listMaterialBatches({actorToken:token,period:params.get('period')??'',offset:Number(params.get('offset')??'0')}));}
      catch(error){if(error?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(error instanceof RangeError)return json({error:'Filtros inválidos'},400);return json({error:'Servicio no disponible'},503);}
    },
    async kilnHistory(request) {
      const token=getCookie(request,name); if(!token)return json({error:'No autenticado'},401);
      const params=new URL(request.url).searchParams;
      if([...params.keys()].some(key=>!['period','offset','batchId'].includes(key)||params.getAll(key).length!==1)||!/^\d{1,6}$/.test(params.get('offset')??'0')||(params.has('batchId')&&(params.has('period')||params.has('offset'))))return json({error:'Filtros inválidos'},400);
      try {
        if(params.has('batchId')){const result=await getKilnBatch({actorToken:token,batchId:params.get('batchId')});return result?json(result):json({error:'Carga inexistente'},404);}
        return json(await listKilnBatches({actorToken:token,period:params.get('period')??'',offset:Number(params.get('offset')??'0')}));
      } catch(error){if(error?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(error instanceof RangeError)return json({error:'Filtros inválidos'},400);return json({error:'Servicio no disponible'},503);}
    },
    async saveMaterialBatch(request) {
      if(!allowed(request))return json({error:'Solicitud no permitida'},403);
      const token=getCookie(request,name);if(!token)return json({error:'No autenticado'},401);
      let body;try{body=await readBody(request,1048576);}catch{return json({error:'Datos inválidos o demasiado extensos'},400);}
      if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.idempotencyKey!=='string'||!body.batch||Object.keys(body).some(key=>!['idempotencyKey','batch'].includes(key)))return json({error:'Datos inválidos'},400);
      try{return json(await saveMaterialBatch({actorToken:token,idempotencyKey:body.idempotencyKey,batch:body.batch}));}
      catch(error){if(error?.code==='FORBIDDEN')return json({error:'Operación no autorizada'},403);if(['IDEMPOTENCY','INACTIVE','MATERIAL','PRICE'].includes(error?.code))return json({error:error.message},409);if(error?.code==='STUDENT'||error instanceof RangeError)return json({error:'Revisá los datos de la carga.'},400);return json({error:'Servicio no disponible'},503);}
    },
    async saveKilnBatch(request) {
      if(!allowed(request)) return json({error:'Solicitud no permitida'},403);
      const token=getCookie(request,name); if(!token) return json({error:'No autenticado'},401);
      let body; try {body=await readBody(request,1048576);} catch {return json({error:'Datos inválidos o demasiado extensos'},400);}
      if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.idempotencyKey!=='string'||!body.batch||Object.keys(body).some(key=>!['idempotencyKey','batch'].includes(key))) return json({error:'Datos inválidos'},400);
      try {return json(await saveKilnBatch({actorToken:token,idempotencyKey:body.idempotencyKey,batch:body.batch}));}
      catch(error) {
        if(error?.code==='FORBIDDEN') return json({error:'Operación no autorizada'},403);
        if(error?.code==='IDEMPOTENCY'||error?.code==='INACTIVE') return json({error:error.message},409);
        if(error?.code==='STUDENT'||error instanceof RangeError) return json({error:'Revisá los datos de la carga.'},400);
        return json({error:'Servicio no disponible'},503);
      }
    },
    async adjustFee(request) {
      if (!allowed(request)) return json({error:'Solicitud no permitida'},403);
      const token=getCookie(request,name);
      if (!token) return json({error:'No autenticado'},401);
      let body;
      try { body=await readBody(request); } catch { return json({error:'Datos inválidos'},400); }
      const fields=['feeId','amountCents','reason','idempotencyKey'];
      if (!body || typeof body !== 'object' || Array.isArray(body) || fields.some((field)=>typeof body[field] !== 'string') || Object.keys(body).some((key)=>!fields.includes(key)) || !/^(0|[1-9]\d{0,18})$/.test(body.amountCents)) return json({error:'Datos inválidos'},400);
      try { return json(await adjustFee({actorToken:token,feeId:body.feeId,amountCents:BigInt(body.amountCents),reason:body.reason,idempotencyKey:body.idempotencyKey})); }
      catch(error) {
        if(error?.code==='FORBIDDEN') return json({error:'Operación no autorizada'},403);
        if(error?.code==='IDEMPOTENCY') return json({error:'La clave ya fue utilizada con otros datos.'},409);
        if(error?.code==='PAID') return json({error:'El importe no puede ser menor a lo abonado.'},409);
        if(error?.code==='INCONSISTENT') return json({error:'El saldo requiere revisión antes del ajuste.'},409);
        if(error?.code==='UNCHANGED') return json({error:'El importe no cambió.'},409);
        if(error?.code==='FEE' || error instanceof RangeError) return json({error:'Revisá los datos ingresados.'},400);
        return json({error:'Servicio no disponible'},503);
      }
    },
    async session(request) {
      const token = getCookie(request, name);
      if (!token) return json({ error: 'No autenticado' }, 401);
      try {
        const current = await getSession(token);
        if (!current) return json({ error: 'No autenticado' }, 401);
        return json({ role: current.role, mustChangePassword: current.mustChangePassword, ...(current.role === 'ADMIN' ? { displayName: current.displayName, accessLevel: current.accessLevel } : {}) });
      } catch { return json({ error: 'Servicio no disponible' }, 503); }
    },
  };
}
