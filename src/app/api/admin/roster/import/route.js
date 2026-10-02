import { z } from 'zod';
import { handle, json, readJson, assertSameOrigin } from '@/server/http';
import { requireAdmin } from '@/server/auth';
import { parse } from '@/server/validation';
import { previewImport, applyImport } from '@/server/roster';

// Read only. Shows what the sheet would change without touching the roster.
export const GET = handle(async (req) => {
  await requireAdmin(req);
  return json(await previewImport());
});

const Body = z.object({
  add: z.array(z.string().max(100)).max(500).default([]),
  remove: z.array(z.string().max(100)).max(500).default([]),
  updateHandicaps: z.boolean().default(false),
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  return json(await applyImport(parse(Body, await readJson(req)), admin));
});
