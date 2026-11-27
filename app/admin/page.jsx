import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { webAuthHandlers } from '../../src/auth/web.mjs';
import Dashboard from './dashboard';
import './dashboard.css';

export const dynamic = 'force-dynamic';
export default async function AdminPage() {
  const handlers = webAuthHandlers();
  if (!handlers) redirect('/');
  const store = await cookies();
  const response = await handlers.session(new Request('http://internal/', {headers:{cookie:store.toString()}}));
  if (response.status === 401) redirect('/');
  if (!response.ok) return <main><p role="alert">No pudimos verificar tu sesión. Intentá nuevamente.</p></main>;
  const session = await response.json();
  if (session.mustChangePassword) redirect('/cambiar-contrasena');
  if (session.role !== 'ADMIN') redirect('/');
  return <Dashboard displayName={session.displayName} accessLevel={session.accessLevel}/>;
}
