import { pageUser } from '@/server/pages';
import Layout from '@/components/Layout';
import View from '@/views/ManagerDashboard';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await pageUser({ admin: true });
  return (
    <Layout currentPageName="ManagerDashboard" user={user}>
      <View user={user} />
    </Layout>
  );
}
