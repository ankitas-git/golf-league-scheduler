import { handle, json, readJson, assertSameOrigin } from '@/server/http';
import { requireUser, requireAdmin } from '@/server/auth';
import { getSettings, saveSettings } from '@/server/settings';

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  return json(await getSettings({ includeAdminOnly: user.role === 'admin' }));
});

export const PUT = handle(async (req) => {
  assertSameOrigin(req);
  await requireAdmin(req);
  return json(await saveSettings(await readJson(req)));
});
