import pg from 'pg';
import { authenticate } from './login.mjs';
import { getSession, revokeSession } from './sessions.mjs';
import { changePassword } from './change-password.mjs';
import { resetStudentPassword } from './reset-student-password.mjs';
import { createStudent } from '../students/create-student.mjs';
import { changeStudentStatus } from '../students/change-status.mjs';
import { listStudents } from '../students/list-students.mjs';
import { setFeePrice, getFeePrices } from '../fees/prices.mjs';
import { initializeDueDay, scheduleDueDay, getDueDays } from '../fees/due-settings.mjs';
import { adjustFee, listAdjustableFees } from '../fees/adjust-fee.mjs';
import { saveKilnBatch } from '../batches/kiln-batches.mjs';
import { listKilnBatches,getKilnBatch } from '../batches/kiln-history.mjs';
import { correctKilnItem } from '../batches/kiln-corrections.mjs';
import { saveMaterial,listMaterials } from '../materials/catalog.mjs';
import { saveMaterialBatch } from '../materials/batches.mjs';
import { listMaterialBatches,getMaterialBatch } from '../materials/history.mjs';
import { listPayableCharges,recordAuthorizedPayment,listPayments,getPayment,voidAuthorizedPayment } from '../payments/web.mjs';
import { getStudentPortal } from '../students/portal.mjs';
import {getFeeTierSchedules,scheduleFeeTiers} from '../fees/tier-schedules.mjs';
import {ensureTierGeneration} from '../fees/ensure-tier-generation.mjs';
import {createTierGenerationGate} from '../fees/tier-generation-gate.mjs';
import { getAdminSummary } from '../students/admin-summary.mjs';
import { correctMaterialItem } from '../materials/corrections.mjs';
import { listDrafts,getDraft,saveDraft,confirmDraft } from '../drafts/store.mjs';
import { createAuthHandlers } from './http-handlers.mjs';

let pool;
const ensureFeesForSession=createTierGenerationGate({loadSession:(token)=>getSession(pool,token),run:()=>ensureTierGeneration(pool)});
export function webAuthHandlers() {
  if (process.env.AUTH_WEB_ENABLED !== 'true' || !process.env.DATABASE_URL || !process.env.APP_ORIGIN) return null;
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 });
  return createAuthHandlers({
    origin: process.env.APP_ORIGIN,
    production: process.env.NODE_ENV === 'production',
    authenticate: (input) => authenticate(pool, input),
    getSession: (token) => getSession(pool, token),
    revokeSession: (token) => revokeSession(pool, token),
    changePassword: (token, current, next) => changePassword(pool, token, current, next),
    resetStudentPassword: (input) => resetStudentPassword(pool, input),
    createStudent: (input) => createStudent(pool, input),
    changeStudentStatus: (input) => changeStudentStatus(pool, input),
    listStudents: async (input) => {await ensureFeesForSession(input.actorToken,'ADMIN');return listStudents(pool,input);},
    setFeePrice: (input) => setFeePrice(pool, input),
    getFeePrices: (input) => getFeePrices(pool, input),
    setDueDay: ({ mode, ...input }) => mode === 'INITIAL' ? initializeDueDay(pool,input) : scheduleDueDay(pool,input),
    getDueDays: (input) => getDueDays(pool,input),
    adjustFee: (input) => adjustFee(pool,input),
    listAdjustableFees: async (input) => {await ensureFeesForSession(input.actorToken,'ADMIN');return listAdjustableFees(pool,input);},
    saveKilnBatch: (input) => saveKilnBatch(pool,input),
    listKilnBatches: (input) => listKilnBatches(pool,input),
    getKilnBatch: (input) => getKilnBatch(pool,input),
    correctKilnItem: (input) => correctKilnItem(pool,input),
    saveMaterial: (input) => saveMaterial(pool,input),
    listMaterials: (input) => listMaterials(pool,input),
    saveMaterialBatch: (input) => saveMaterialBatch(pool,input),
    listMaterialBatches: (input) => listMaterialBatches(pool,input),
    getMaterialBatch: (input) => getMaterialBatch(pool,input),
    listPayableCharges: async (input) => {await ensureFeesForSession(input.actorToken,'ADMIN');return listPayableCharges(pool,input);},
    recordAuthorizedPayment: (input) => recordAuthorizedPayment(pool,input),
    listPayments: (input) => listPayments(pool,input),
    getPayment: (input) => getPayment(pool,input),
    voidAuthorizedPayment: (input) => voidAuthorizedPayment(pool,input),
    getStudentPortal: async (input) => {await ensureFeesForSession(input.actorToken,'USER');return getStudentPortal(pool,input);},
    getFeeTierSchedules: (input) => getFeeTierSchedules(pool,input),
    scheduleFeeTiers: (input) => scheduleFeeTiers(pool,input),
    getAdminSummary: async (input) => {await ensureFeesForSession(input.actorToken,'ADMIN');return getAdminSummary(pool,input);},
    correctMaterialItem: (input) => correctMaterialItem(pool,input),
    listDrafts: (input) => listDrafts(pool,input),
    getDraft: (input) => getDraft(pool,input),
    saveDraft: (input) => saveDraft(pool,input),
    confirmDraft: (input) => confirmDraft(pool,input),
  });
}
export function unavailable() {
  return Response.json({ error: 'Servicio no disponible' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
