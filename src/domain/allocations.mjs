export function validateAllocations(paymentAmount, allocations) {
  if (typeof paymentAmount !== 'bigint' || paymentAmount <= 0n || !Array.isArray(allocations) || allocations.length === 0) throw new RangeError('Pago o asignaciones inválidas');
  const seen = new Set();
  let total = 0n;
  for (const { chargeId, amount, outstanding } of allocations) {
    if (typeof chargeId !== 'string' || !chargeId || seen.has(chargeId) || typeof amount !== 'bigint' || typeof outstanding !== 'bigint' || amount <= 0n || outstanding < amount) throw new RangeError('Asignación inválida');
    seen.add(chargeId);
    total += amount;
  }
  if (total !== paymentAmount) throw new RangeError('Las asignaciones no coinciden con el pago');
  return total;
}
