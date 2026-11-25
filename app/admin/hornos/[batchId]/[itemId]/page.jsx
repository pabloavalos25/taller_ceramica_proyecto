import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {webAuthHandlers} from '../../../../../src/auth/web.mjs';
import Correction from './screen';
import '../../../cuotas/fee-prices.css';
import './screen.css';
export const dynamic='force-dynamic';
export default async function Page({params}){
  const handlers=webAuthHandlers();if(!handlers)redirect('/');
  const store=await cookies();const response=await handlers.session(new Request('http://internal/',{headers:{cookie:store.toString()}}));
  if(response.status===401)redirect('/');
  if(!response.ok)return <main className="fee-error-page"><p role="alert">No pudimos verificar tu sesión.</p></main>;
  const session=await response.json();if(session.mustChangePassword)redirect('/cambiar-contrasena');if(session.role!=='ADMIN')redirect('/');
  const {batchId,itemId}=await params;return <Correction batchId={batchId} itemId={itemId}/>;
}
