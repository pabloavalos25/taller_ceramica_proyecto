export function loginDestination(session) {
  if (session.mustChangePassword) return '/cambiar-contrasena';
  return session.role === 'ADMIN' ? '/admin' : null;
}
