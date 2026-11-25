import { lineTotal } from './money.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxCents=9223372036854775807n;
const text=(value,max)=>typeof value==='string' && value.trim().length>0 && value.trim().length<=max;
function validDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day]=value.split('-').map(Number);
  if(year<1||month<1||month>12||day<1) return false;
  const leap=year%4===0&&(year%100!==0||year%400===0);
  return day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
}
export function validateBatch(batch) {
  if(!batch||!['KILN','MATERIAL'].includes(batch.type)||!validDate(batch.date)||typeof batch.period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(batch.period)||batch.period.startsWith('0000')||!Array.isArray(batch.students)||!batch.students.length||batch.students.length>500) throw new RangeError('Carga inválida');
  const seen=new Set(); let totalCents=0n; let records=0;
  const students=batch.students.map(block=>{
    if(!block||typeof block.studentId!=='string'||!uuid.test(block.studentId)||!Array.isArray(block.items)||!block.items.length) throw new RangeError('Bloque de alumna inválido');
    const studentId=block.studentId.toLowerCase(); if(seen.has(studentId)) throw new RangeError('Alumna duplicada'); seen.add(studentId);
    let subtotalCents=0n;
    const items=block.items.map(item=>{
      if(++records>5000||!item||!text(item.name,200)||typeof item.quantity!=='string'||item.quantity.length>20||typeof item.unitPrice!=='string'||item.unitPrice.length>24) throw new RangeError('Registro inválido');
      if(batch.type==='KILN'&&(!['BISQUE','GLAZE','OTHER'].includes(item.firingType)||!/^\d+$/.test(item.quantity))) throw new RangeError('Horneada inválida');
      if(batch.type==='MATERIAL'&&(typeof item.materialId!=='string'||!uuid.test(item.materialId))) throw new RangeError('Material inválido');
      const subtotal=lineTotal(item.quantity,item.unitPrice);
      const [whole,fraction='']=item.unitPrice.split('.');
      const unitPriceCents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
      if(unitPriceCents>maxCents) throw new RangeError('Precio fuera de rango');
      if(subtotal>maxCents) throw new RangeError('Importe fuera de rango');
      if(unitPriceCents===0n&&!text(item.zeroPriceReason,500)) throw new RangeError('Justificá el precio cero');
      subtotalCents+=subtotal; if(subtotalCents>maxCents) throw new RangeError('Importe fuera de rango');
      return {...item,name:item.name.trim(),subtotalCents:subtotal};
    });
    totalCents+=subtotalCents; if(totalCents>maxCents) throw new RangeError('Importe fuera de rango');
    return {...block,studentId,items,subtotalCents};
  });
  return {...batch,students,records,totalCents};
}
