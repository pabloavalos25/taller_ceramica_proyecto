const maxCents = 9223372036854775807n;
export function parseArsCents(value) {
  if (typeof value !== 'string' || value.length > 32) throw new RangeError('Importe inválido');
  const input = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(input)) throw new RangeError('Importe inválido');
  const [integer, decimals = ''] = input.split(',');
  const result = BigInt(integer.replaceAll('.', '')) * 100n + BigInt(decimals.padEnd(2, '0'));
  if (result > maxCents) throw new RangeError('Importe fuera de rango');
  return result.toString();
}
export function formatArsCents(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new RangeError('Importe inválido');
  const cents = BigInt(value);
  return `$ ${new Intl.NumberFormat('es-AR').format(cents / 100n)},${String(cents % 100n).padStart(2, '0')}`;
}
