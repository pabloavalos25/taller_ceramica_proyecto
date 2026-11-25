function parseFixed(value, scale, allowZero) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) throw new RangeError('Decimal inválido');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > scale) throw new RangeError('Demasiados decimales');
  const result = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'));
  if (!allowZero && result === 0n) throw new RangeError('La cantidad debe ser positiva');
  return result;
}

// Cantidades con hasta tres decimales; precios en centavos. Redondeo por línea, mitad hacia arriba.
export function lineTotal(quantity, unitPrice) {
  const thousandths = parseFixed(quantity, 3, false);
  const cents = parseFixed(unitPrice, 2, true);
  return (thousandths * cents + 500n) / 1000n;
}
