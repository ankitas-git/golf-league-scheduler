import { handle, json, readJson, assertSameOrigin, HttpError } from '@/server/http';
import { requireAdmin } from '@/server/auth';
import { serverClient } from '@/server/compat';
import { sortedRoster, sheetsConfigured } from '@/server/sheets';
import { emailConfigured } from '@/server/email';
import { HANDICAPS } from '@/server/roster';
import autoSyncAvailability from '@/server/functions/autoSyncAvailability';
import generatePairings from '@/server/functions/generatePairings';
import populatePairingsSheet from '@/server/functions/populatePairingsSheet';
import emailPairings from '@/server/functions/emailPairings';

// Every function here is an admin tool. Player sheet updates happen server side on save.
const FUNCTIONS = {
  getGolferNames: async () => {
    const golferNames = await sortedRoster();
    return Response.json({ success: true, golferNames, count: golferNames.length });
  },
  getHandicaps: async () => Response.json({ success: true, handicapMap: HANDICAPS }),
  autoSyncAvailability,
  generatePairings,
  populatePairingsSheet,
  emailPairings,
};

const NEEDS_SHEETS = new Set(['autoSyncAvailability', 'generatePairings', 'populatePairingsSheet']);

export const POST = handle(async (req, { params }) => {
  assertSameOrigin(req);
  const { name } = await params;
  const fn = Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : null;
  if (!fn) throw new HttpError(404, 'Unknown function');
  const user = await requireAdmin(req);
  if (NEEDS_SHEETS.has(name) && !sheetsConfigured()) {
    throw new HttpError(503, 'Google Sheets is not connected yet. Add the service account key to the deployment.');
  }
  if (name === 'emailPairings' && !emailConfigured()) {
    throw new HttpError(503, 'Email is not set up yet. Add SMTP_URL and MAIL_FROM to the deployment.');
  }
  const input = await readJson(req);
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return json({ error: 'Body must be an object' }, 400);
  return fn(input, serverClient(user));
});
