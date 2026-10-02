import { pageUser } from '@/server/pages';
import Layout from '@/components/Layout';
import View from '@/views/PlayerDashboard';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await pageUser();
  return (
    <Layout currentPageName="PlayerDashboard" user={user}>
      <View user={user} />
    </Layout>
  );
}
