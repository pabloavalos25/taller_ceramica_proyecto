function periodIndex(year, month) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('Período inválido');
  return year * 12 + month - 1;
}

export function nextPeriod(year, month) {
  periodIndex(year, month);
  if (year === 9999 && month === 12) throw new RangeError('Período fuera de rango');
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function feeApplies(student, year, month) {
  const period = periodIndex(year, month);
  const start = periodIndex(student.startYear, student.startMonth);
  if (typeof student.activeAtPeriod !== 'boolean') throw new TypeError('Estado inválido');
  return student.activeAtPeriod && period >= start;
}
