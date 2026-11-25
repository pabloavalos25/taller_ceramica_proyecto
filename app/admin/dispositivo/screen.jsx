'use client';
import {useEffect,useRef,useState} from 'react';
import {inspectDevice,prepareTransfer,finishTransfer,clearDevice} from '../../../src/drafts/device-privacy.mjs';

const routes={KILN:'/admin/hornos/nueva',MATERIAL:'/admin/materiales/nueva'};
function pendingLink(key){
 if(key==='suyai-kiln-pending-v1')return ['Carga de horno',routes.KILN];
 if(key==='suyai-material-batch-pending-v1')return ['Carga de materiales',routes.MATERIAL];
 if(key==='suyai-payment-pending-v1')return ['Registro de pago','/admin/pagos'];
 if(key==='suyai-void-payment-pending-v1')return ['Anulación de pago','/admin/pagos/historial'];
 if(key==='suyai-pending-fee-adjustment')return ['Ajuste de cuota','/admin/cuotas/ajustar'];
 if(key==='suyai-material-pending-v1')return ['Cambio de material','/admin/materiales'];
 if(key.startsWith('suyai-kiln-correction-'))return ['Corrección de horno: buscá la pieza en el historial','/admin/hornos'];
 if(key.startsWith('suyai-material-correction-'))return ['Corrección de material: buscá el consumo en el historial','/admin/materiales/historial'];
 if(key.startsWith('suyai-new-shared-draft-'))return ['Creación de borrador',`/admin/borradores?tipo=${key.endsWith('MATERIAL')?'materiales':'hornos'}`];
 if(key.startsWith('suyai-shared-draft-op-')){const id=key.slice('suyai-shared-draft-op-'.length);try{const op=JSON.parse(sessionStorage.getItem(key));if(op.type==='MATERIAL'||op.type==='KILN')return ['Operación de borrador',`${routes[op.type]}?borrador=${encodeURIComponent(id)}`];return ['Confirmación de borrador: buscá el borrador en su lista','/admin/borradores'];}catch{return ['Operación de borrador','/admin/borradores'];}}
 return ['Operación pendiente: volvé a la pantalla donde la iniciaste','/'];
}
export default function DeviceScreen(){
 const [state,setState]=useState(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const sending=useRef(false);
 function refresh(){try{setState(inspectDevice(localStorage,sessionStorage));}catch{setState(null);setError('No pudimos consultar el almacenamiento de este navegador.');}}
 useEffect(()=>{refresh();const update=()=>refresh();window.addEventListener('storage',update);window.addEventListener('focus',update);return()=>{window.removeEventListener('storage',update);window.removeEventListener('focus',update);};},[]);
 async function transfer(type){
  if(sending.current)return;sending.current=true;setBusy(true);setError('');setMessage('');
  try{
   const op=prepareTransfer(localStorage,sessionStorage,type,()=>crypto.randomUUID());
   const response=await fetch('/api/admin/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(op)});
   if(!response.ok)throw Error('No pudimos confirmar el guardado. Volvé a ingresar si es necesario y reintentá la misma operación.');
   const result=await response.json();if(result.id!==op.draftId||result.version!==1)throw Error('No pudimos verificar el borrador guardado. Reintentá la misma operación.');
   const unchanged=finishTransfer(localStorage,type,op);
   setMessage(unchanged?'Borrador guardado en el sistema. No se generaron cargos.':'Se guardó una copia, pero la carga local cambió. Revisala y guardá los cambios restantes.');
  }catch(e){setError(e.message||'No pudimos guardar el borrador.');}finally{sending.current=false;setBusy(false);refresh();}
 }
 function clear(){try{clearDevice(localStorage,sessionStorage);setMessage('Se quitaron los datos locales de cargas de este navegador.');setError('');refresh();}catch{setError('Hay cargas u operaciones pendientes. Revisalas antes de limpiar.');refresh();}}
 const blocked=!state||state.pending.length>0||Object.values(state.drafts).some(Boolean)||Object.values(state.transfers).some(Boolean);
 return <div className="fee-layout"><aside className="fee-side"><img src="/logo.png" alt="SUYAI"/><span className="admin-nav-label">Administración</span><nav aria-label="Secciones administrativas"><a href="/admin/alumnas">Alumnas</a><a href="/admin/cuotas">Cuotas</a><a href="/admin/hornos">Hornos</a><a href="/admin/materiales">Materiales e insumos</a><a href="/admin/pagos">Pagos</a><strong>Datos del dispositivo</strong></nav></aside><div><header className="fee-mobile"><img src="/logo.png" alt="SUYAI"/><span>SUYAI · Datos del dispositivo</span></header><main className="fee-main history-main"><span className="fee-eyebrow">Seguridad / Este dispositivo</span><h1>Cuidar los datos de este dispositivo</h1><p className="fee-intro">Revisá las cargas guardadas en este navegador antes de limpiar sus datos locales.</p><p><a href="/">Volver al inicio</a></p>{error&&<p className="fee-error" role="alert">{error}</p>}{message&&<p className="fee-success" role="status">{message}</p>}
 <section className="fee-card"><h2>Cargas guardadas en este navegador</h2><p>Podés guardarlas como borradores compartidos para retomarlas con tu cuenta desde otro dispositivo.</p>{['KILN','MATERIAL'].map(type=><div key={type}><h3>{type==='KILN'?'Hornos':'Materiales'}</h3>{!state?<p>Consultando…</p>:state.transfers[type]?<><p>Guardado pendiente de confirmar. Reintentá la misma operación.</p><button className="fee-primary" disabled={busy} onClick={()=>transfer(type)}>Reintentar guardado</button></>:state.drafts[type]?<><p>Hay una carga sin terminar.</p><button className="fee-primary" disabled={busy} onClick={()=>transfer(type)}>Guardar como borrador</button>{' '}<a href={routes[type]}>Revisar carga</a></>:<p>No hay una carga local sin terminar.</p>}</div>)}</section>
 <section className="fee-card"><h2>Operaciones por resolver</h2>{!state?<p>Consultando…</p>:state.pending.length?<><p className="fee-error">Reintentá las operaciones pendientes antes de quitar datos, para evitar duplicados.</p><ul>{state.pending.map(key=>{const [label,href]=pendingLink(key);return <li key={key}><a href={href}>{label}</a></li>;})}</ul></>:<p>No encontramos operaciones pendientes en este navegador y esta pestaña.</p>}<p className="fee-note">Otras pestañas o dispositivos pueden tener datos pendientes que esta pantalla no puede revisar.</p></section>
 <section className="fee-card"><h2>Quitar datos locales</h2><p>Cuando no queden cargas ni operaciones pendientes, podés quitar los datos locales vacíos de cargas. Los borradores compartidos y cargos guardados permanecen en el sistema.</p><button className="fee-secondary" disabled={blocked||busy} onClick={clear}>Quitar datos locales</button>{blocked&&<p className="fee-note">Disponible cuando no queden cargas ni operaciones pendientes.</p>}</section></main></div></div>;
}
