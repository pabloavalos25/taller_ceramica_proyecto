const safeCodes = new Set(['42703','42P01','23502','23503','23514','42501','28P01','3D000','53300','57P01','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','ERR_CRYPTO_INVALID_SCRYPT_PARAMS','ERR_CRYPTO_SCRYPT_INVALID_PARAMETER']);

export function studentServiceDiagnostic(operation,error) {
  const safeOperation = operation === 'create' ? 'create' : 'list';
  const code = safeCodes.has(error?.code) ? error.code : 'OTHER';
  console.error(`[student-service] operation=${safeOperation} code=${code}`);
}
