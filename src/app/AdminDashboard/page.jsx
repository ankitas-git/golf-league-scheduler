import { pageUser } from '@/server/pages';
import Layout from '@/components/Layout';
import View from '@/views/AdminDashboard';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await pageUser({ admin: true });
  return (
    <Layout currentPageName="AdminDashboard" user={user}>
      <View user={user} />
    </Layout>
  );
}
