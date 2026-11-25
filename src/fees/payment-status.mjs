function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0,10) === value;
}
export function feePaymentStatus(amountCents, paidCents, dueDate, today) {
  if (typeof amountCents !== 'bigint' || typeof paidCents !== 'bigint' || amountCents < 0n || paidCents < 0n || paidCents > amountCents || !validDate(dueDate) || !validDate(today)) throw new RangeError('Datos de cuota inválidos');
  const balanceCents = amountCents - paidCents;
  const overdue = balanceCents > 0n && today > dueDate;
  const status = balanceCents === 0n ? 'PAID' : paidCents > 0n ? 'PARTIAL' : overdue ? 'OVERDUE' : 'PENDING';
  return { status, overdue, balanceCents };
}
