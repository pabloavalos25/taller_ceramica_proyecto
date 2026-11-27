import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { webAuthHandlers } from '../../../src/auth/web.mjs';
import FeePrices from './fee-prices';
import './fee-prices.css';
export const dynamic = 'force-dynamic';
export default async function FeePricesPage() {
  const handlers = webAuthHandlers();
  if (!handlers) redirect('/');
  const cookieStore = await cookies();
  const response = await handlers.session(new Request('http://internal/', { headers: { cookie: cookieStore.toString() } }));
  if (response.status === 401) redirect('/');
  if (!response.ok) return <main className="fee-error-page"><p role="alert">No pudimos verificar tu sesión. Intentá nuevamente más tarde.</p></main>;
  const session = await response.json();
  if (session.mustChangePassword) redirect('/cambiar-contrasena');
  if (session.role !== 'ADMIN') redirect('/');
  return <FeePrices canEdit={session.accessLevel==='PRINCIPAL'} />;
}
