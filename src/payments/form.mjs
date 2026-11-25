import {parseArsCents} from '../fees/amounts.mjs';
export function preparePayment(form,charges){
 if(!form.studentId)throw new RangeError('Elegí una alumna.');
 if(!['CASH','TRANSFER','MERCADO_PAGO','OTHER'].includes(form.method))throw new RangeError('Elegí un medio de pago.');
 if(typeof (form.notes??'')!=='string'||(form.notes??'').length>2000)throw new RangeError('Revisá las observaciones.');
 const allocations=[];let total=0n;
 for(const [id,value] of Object.entries(form.amounts??{})){
  if(value===''||value==null)continue;const charge=charges.find(x=>x.id===id);if(!charge||charge.inconsistent)throw new RangeError('El cargo requiere revisión.');
  let amount;try{amount=BigInt(parseArsCents(value));}catch{throw new RangeError('Ingresá un importe válido.');}
  if(amount<=0n||amount>BigInt(charge.outstandingCents))throw new RangeError('El importe debe ser mayor que cero y no superar el saldo pendiente.');
  allocations.push({chargeId:id,amountCents:amount.toString()});total+=amount;
 }
 if(!allocations.length)throw new RangeError('Elegí al menos un cargo e ingresá un importe.');
 if(total>9223372036854775807n)throw new RangeError('El total es demasiado grande.');
 return {studentId:form.studentId,method:form.method,notes:form.notes?.trim()||null,allocations,totalCents:total.toString()};
}
