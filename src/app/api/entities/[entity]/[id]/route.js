import { after } from 'next/server';
import { handle, json, readJson, assertSameOrigin, HttpError } from '@/server/http';
import { requireUser } from '@/server/auth';
import { entityConfig, assertAllowed, assertOwns, prepareUpdate, delegate } from '@/server/entities';
import { afterAvailabilityChange } from '@/server/availabilityHooks';

async function load(cfg, id) {
  const row = await delegate(cfg).findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'Not found');
  return row;
}

export const GET = handle(async (req, { params }) => {
  const { entity, id } = await params;
  const cfg = entityConfig(entity);
  const user = await requireUser(req);
  assertAllowed(cfg.read, user);
  return json(await load(cfg, id));
});

export const PATCH = handle(async (req, { params }) => {
  assertSameOrigin(req);
  const { entity, id } = await params;
  const cfg = entityConfig(entity);
  const user = await requireUser(req);
  assertAllowed(cfg.update, user);

  const data = prepareUpdate(cfg, await readJson(req));
  await load(cfg, id);
  return json(await delegate(cfg).update({ where: { id }, data }));
});

export const DELETE = handle(async (req, { params }) => {
  assertSameOrigin(req);
  const { entity, id } = await params;
  const cfg = entityConfig(entity);
  const user = await requireUser(req);
  assertAllowed(cfg.delete, user);

  const row = await load(cfg, id);
  assertOwns(entity, cfg, user, row);
  await delegate(cfg).delete({ where: { id } });
  if (entity === 'Availability') after(() => afterAvailabilityChange(user, row, 'delete'));
  return json({ success: true });
});
