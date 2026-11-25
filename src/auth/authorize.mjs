export function authorize(session, action) {
  if (!session || typeof session.userId !== 'string' || !session.userId || !['ADMIN', 'USER'].includes(session.role) || typeof session.mustChangePassword !== 'boolean' || !action) return false;
  if (action.kind === 'change-password') return true;
  if (session.mustChangePassword) return false;
  if (action.kind === 'admin') return session.role === 'ADMIN';
  if (action.kind === 'student') return typeof action.studentId === 'string' && !!action.studentId && (session.role === 'ADMIN' || session.userId === action.studentId);
  return false;
}
