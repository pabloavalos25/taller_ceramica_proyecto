import {parseArsCents} from '../fees/amounts.mjs';
export function prepareMaterial(form){
  if(!form||typeof form.name!=='string'||!form.name.trim()||form.name.trim().length>200)throw new RangeError('Ingresá un nombre válido.');
  if(typeof form.category!=='string'||!form.category.trim()||form.category.trim().length>120)throw new RangeError('Ingresá una categoría válida.');
  if(!['UNIT','G','KG','ML','L','CUSTOM'].includes(form.unit)||(form.unit==='CUSTOM'&&(typeof form.customUnit!=='string'||!form.customUnit.trim()||form.customUnit.trim().length>80)))throw new RangeError('Ingresá una unidad válida.');
  if(typeof form.description!=='string'||form.description.length>2000||typeof form.active!=='boolean')throw new RangeError('Revisá los datos ingresados.');
  let priceCents;try{priceCents=parseArsCents(form.price);}catch{throw new RangeError('Ingresá un precio válido, por ejemplo 4.000,00.');}
  return {name:form.name.trim(),category:form.category.trim(),description:form.description.trim()||null,unit:form.unit,customUnit:form.unit==='CUSTOM'?form.customUnit.trim():null,priceCents,active:form.active};
}
