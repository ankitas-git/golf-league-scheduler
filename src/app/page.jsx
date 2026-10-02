import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth';
import { getSettings } from '@/server/settings';
import Home from '@/views/Home';

export const dynamic = 'force-dynamic';

export default async function Page() {
  if (await currentUser()) redirect('/PlayerDashboard');
  const { league_name } = await getSettings({ includeAdminOnly: false });
  return <Home leagueName={league_name} />;
}
