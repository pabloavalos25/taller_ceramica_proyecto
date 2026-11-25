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
import { createAuthHandlers } from './http-handlers.mjs';

let pool;
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
    listStudents: (input) => listStudents(pool, input),
    setFeePrice: (input) => setFeePrice(pool, input),
    getFeePrices: (input) => getFeePrices(pool, input),
    setDueDay: ({ mode, ...input }) => mode === 'INITIAL' ? initializeDueDay(pool,input) : scheduleDueDay(pool,input),
    getDueDays: (input) => getDueDays(pool,input),
    adjustFee: (input) => adjustFee(pool,input),
    listAdjustableFees: (input) => listAdjustableFees(pool,input),
    saveKilnBatch: (input) => saveKilnBatch(pool,input),
    listKilnBatches: (input) => listKilnBatches(pool,input),
    getKilnBatch: (input) => getKilnBatch(pool,input),
    correctKilnItem: (input) => correctKilnItem(pool,input),
    saveMaterial: (input) => saveMaterial(pool,input),
    listMaterials: (input) => listMaterials(pool,input),
  });
}
export function unavailable() {
  return Response.json({ error: 'Servicio no disponible' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
