export function dueDateForPeriod(year, month, day, policy) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31 || !['LAST_DAY','MAX_28'].includes(policy) || (policy === 'MAX_28' && day > 28)) throw new RangeError('Fecha o política de vencimiento inválida');
  const last = new Date(0);
  last.setUTCFullYear(year, month, 0);
  const chosen = Math.min(day, last.getUTCDate());
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(chosen).padStart(2,'0')}`;
}
