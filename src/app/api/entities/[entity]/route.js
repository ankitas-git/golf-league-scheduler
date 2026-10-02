import { after } from 'next/server';
import { handle, json, readJson, assertSameOrigin, HttpError } from '@/server/http';
import { requireUser } from '@/server/auth';
import { entityConfig, assertAllowed, orderBy, whereFrom, prepareCreate, delegate } from '@/server/entities';
import { afterAvailabilityChange } from '@/server/availabilityHooks';

const MAX_LIMIT = 1000;

// GET ?sort=-date&limit=50&skip=0&q={"date":"2026-06-02"}
export const GET = handle(async (req, { params }) => {
  const { entity } = await params;
  const cfg = entityConfig(entity);
  const user = await requireUser(req);
  assertAllowed(cfg.read, user);

  const sp = req.nextUrl.searchParams;
  let filter;
  if (sp.get('q')) {
    try {
      filter = JSON.parse(sp.get('q'));
    } catch {
      throw new HttpError(400, 'Bad filter');
    }
  }
  const limit = Math.min(Number(sp.get('limit')) || MAX_LIMIT, MAX_LIMIT);
  const skip = Math.max(Number(sp.get('skip')) || 0, 0);

  const rows = await delegate(cfg).findMany({
    where: whereFrom(cfg, filter),
    orderBy: orderBy(cfg, sp.get('sort')),
    take: limit,
    skip,
  });
  return json(rows);
});

export const POST = handle(async (req, { params }) => {
  assertSameOrigin(req);
  const { entity } = await params;
  const cfg = entityConfig(entity);
  const user = await requireUser(req);
  assertAllowed(cfg.create, user);

  const data = await prepareCreate(entity, cfg, user, await readJson(req));
  const row = await delegate(cfg).create({ data });
  if (entity === 'Availability') after(() => afterAvailabilityChange(user, row, 'create'));
  return json(row, 201);
});
