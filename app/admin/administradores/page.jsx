import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {webAuthHandlers} from '../../../src/auth/web.mjs';
import AdminAccounts from './screen';
import '../dashboard.css';
import './administradores.css';

export const dynamic='force-dynamic';
export default async function AdminAccountsPage(){
 const handlers=webAuthHandlers();if(!handlers)redirect('/');
 const store=await cookies();const response=await handlers.session(new Request('http://internal/',{headers:{cookie:store.toString()}}));
 if(!response.ok)redirect('/');const session=await response.json();
 if(session.mustChangePassword)redirect('/cambiar-contrasena');
 if(session.role!=='ADMIN'||session.accessLevel!=='PRINCIPAL')redirect('/admin');
 return <AdminAccounts/>;
}
