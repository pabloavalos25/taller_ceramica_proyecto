export const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
export function makePeriod(year, month) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 0 || month > 11) return '';
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`;
}
export function formatPeriod(value) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value || '');
  if (!match || match[1] === '0000') return '';
  return `${monthNames[Number(match[2]) - 1]} de ${match[1]}`;
}
export function periodHint(kind) {
  return kind === 'materiales' ? 'Elegí el mes en el que se cobrarán los materiales.' : 'Elegí el mes en el que se cobrará la horneada.';
}
