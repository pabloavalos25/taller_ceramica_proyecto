function parse(value) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value.startsWith('0000')) throw new RangeError('Período inválido');
  const [year,month]=value.split('-').map(Number);
  return year*12+month-1;
}
export function periodsBetween(start,end) {
  const first=parse(start), last=parse(end);
  if (first>last || last-first>=1200) throw new RangeError('Rango de períodos inválido');
  return Array.from({length:last-first+1},(_,i)=>{ const value=first+i; return `${String(Math.floor(value/12)).padStart(4,'0')}-${String(value%12+1).padStart(2,'0')}`; });
}
