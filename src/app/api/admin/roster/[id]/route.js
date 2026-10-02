import { handle, json, assertSameOrigin } from '@/server/http';
import { requireAdmin } from '@/server/auth';
import { removePlayer } from '@/server/roster';

// Takes a golfer off the roster. Their account stays but can no longer log in.
export const DELETE = handle(async (req, { params }) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await params;
  await removePlayer(id, admin);
  return json({ success: true });
});
