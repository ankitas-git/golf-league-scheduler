import 'server-only';
import { prisma } from './db';
import { ENTITIES, repo } from './entities';
import { getSheetsToken } from './sheets';
import { sendEmail } from './email';
import { getSettings } from './settings';

// Mimics the slice of the Base44 SDK the ported functions call, so their logic stays as it was.
export function serverClient(user) {
  const entities = Object.fromEntries(Object.entries(ENTITIES).map(([name, cfg]) => [name, repo(cfg)]));
  return {
    auth: { me: async () => user },
    settings: () => getSettings(),
    integrations: { Core: { SendEmail: sendEmail } },
    asServiceRole: {
      entities,
      connectors: { getConnection: async () => ({ accessToken: await getSheetsToken() }) },
      // Lowercase player name to the address on their account, for golfers who added one.
      playerEmails: async () => {
        const users = await prisma.user.findMany({ where: { email: { not: null } }, select: { player_name: true, email: true } });
        return new Map(users.map((u) => [u.player_name.toLowerCase().trim(), u.email]));
      },
    },
  };
}
