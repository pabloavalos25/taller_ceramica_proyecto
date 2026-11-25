import {formatArsCents} from '../fees/amounts.mjs';
export function balanceLabel(amount,paid){
  if(typeof amount!=='string'||typeof paid!=='string'||!/^\d+$/.test(amount)||!/^\d+$/.test(paid))return 'Requiere revisión';
  const balance=BigInt(amount)-BigInt(paid);
  return balance<0n?'Requiere revisión':formatArsCents(balance.toString());
}
