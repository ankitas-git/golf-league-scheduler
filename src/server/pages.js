import 'server-only';
import { redirect } from 'next/navigation';
import { currentUser, publicUser } from './auth';

// Page guard. Signed out goes to login, and players on admin pages go to their calendar.
export async function pageUser({ admin = false } = {}) {
  const user = await currentUser();
  if (!user) redirect('/');
  if (admin && user.role !== 'admin') redirect('/PlayerDashboard');
  return publicUser(user);
}
