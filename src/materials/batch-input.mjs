import {parseArsCents} from '../fees/amounts.mjs';
import {validateBatch} from '../domain/batch-validation.mjs';
import {lineTotal} from '../domain/money.mjs';

export function materialBatchPayload(form){
  if(!form.date)throw new RangeError('Elegí la fecha de consumo.');
  if(!form.period)throw new RangeError('Elegí el período de cobro.');
  if(!form.students?.length)throw new RangeError('Agregá una alumna a la carga.');
  for(const block of form.students){
    if(!block.items?.length)throw new RangeError(`Agregá un material para ${block.name||'la alumna'}.`);
    for(const item of block.items){
      if(!item.materialId)throw new RangeError(`Seleccioná un material para ${block.name||'la alumna'}.`);
      let cents;try{cents=parseArsCents(item.price);}catch{throw new RangeError(`Revisá el precio del material de ${block.name||'la alumna'}.`);}
      try{lineTotal(item.quantity.replace(',','.'),'1.00');}catch{throw new RangeError(`Revisá la cantidad del material de ${block.name||'la alumna'}: debe ser mayor que cero y tener hasta tres decimales.`);}
      if(cents==='0'&&!item.zeroPriceReason?.trim())throw new RangeError(`Indicá el motivo del precio cero para ${block.name||'la alumna'}.`);
    }
  }
  const batch={type:'MATERIAL',date:form.date,period:form.period,students:form.students.map(block=>({studentId:block.id,confirmInactive:block.confirmInactive===true,items:block.items.map(item=>{const cents=BigInt(parseArsCents(item.price));return {materialId:item.materialId,name:item.name,quantity:item.quantity.replace(',','.'),unitPrice:`${cents/100n}.${String(cents%100n).padStart(2,'0')}`,zeroPriceReason:item.zeroPriceReason};})}))};
  validateBatch(batch);
  return batch;
}
