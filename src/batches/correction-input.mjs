import {parseArsCents} from '../fees/amounts.mjs';
export function prepareCorrection(action,amount,reason,paid){
  if(!['ADJUST','VOID'].includes(action)||typeof reason!=='string'||!reason.trim()||reason.trim().length>500)throw new RangeError('Ingresá un motivo válido.');
  if(typeof paid!=='string'||!/^\d+$/.test(paid))throw new RangeError('El saldo requiere revisión.');
  let amountCents;
  try{amountCents=action==='VOID'?'0':parseArsCents(amount);}catch{throw new RangeError('Ingresá un importe válido, por ejemplo 3.500,00.');}
  if(BigInt(amountCents)<BigInt(paid))throw new RangeError('El importe no puede ser menor a lo abonado.');
  return {amountCents,reason:reason.trim()};
}
