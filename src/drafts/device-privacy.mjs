const drafts={KILN:'suyai-kiln-draft-v1',MATERIAL:'suyai-material-batch-draft-v1'};
const transfers={KILN:'suyai-device-transfer-KILN',MATERIAL:'suyai-device-transfer-MATERIAL'};
const localPending=['suyai-kiln-pending-v1','suyai-material-batch-pending-v1'];
function keys(storage){return Array.from({length:storage.length},(_,i)=>storage.key(i)).filter(Boolean);}
function hasData(raw){
 if(raw===null)return false;
 try{const data=JSON.parse(raw);return !data||typeof data!=='object'||Array.isArray(data)||Object.entries(data).some(([key,value])=>key==='students'? !Array.isArray(value)||value.length>0 : value!==''&&value!==null);}
 catch{return true;}
}
export function inspectDevice(local,session){
 const found=Object.fromEntries(Object.entries(drafts).map(([type,key])=>[type,hasData(local.getItem(key))]));
 const pending=[...localPending.filter(key=>local.getItem(key)!==null),...keys(session).filter(key=>key.startsWith('suyai-'))];
 return {drafts:found,pending,transfers:Object.fromEntries(Object.entries(transfers).map(([type,key])=>[type,local.getItem(key)!==null]))};
}
export function prepareTransfer(local,session,type,uuid){
 if(!Object.hasOwn(drafts,type))throw Error('Tipo inválido');
 const stored=local.getItem(transfers[type]);if(stored!==null)return JSON.parse(stored);
 if(localPending.some(key=>local.getItem(key)!==null))throw Error('Resolvé primero las cargas pendientes.');
 const raw=local.getItem(drafts[type]);if(!hasData(raw))throw Error('No hay un borrador local para guardar.');
 const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('No se pudo leer el borrador.');
 const op={action:'SAVE',draftId:uuid(),type,expectedVersion:0,idempotencyKey:uuid(),data};
 local.setItem(transfers[type],JSON.stringify(op));return op;
}
export function finishTransfer(local,type,op){
 const raw=local.getItem(drafts[type]);const unchanged=raw!==null&&JSON.stringify(JSON.parse(raw))===JSON.stringify(op.data);
 if(unchanged)local.removeItem(drafts[type]);
 local.removeItem(transfers[type]);return unchanged;
}
export function clearDevice(local,session){
 const state=inspectDevice(local,session);
 if(state.pending.length||Object.values(state.drafts).some(Boolean)||Object.values(state.transfers).some(Boolean))throw Error('Hay datos pendientes de resolver.');
 for(const key of Object.values(drafts))local.removeItem(key);
}
