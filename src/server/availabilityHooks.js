import 'server-only';
import { prisma } from './db';
import { sheetsConfigured } from './sheets';
import { emailConfigured, sendEmail } from './email';
import { serverClient } from './compat';
import updateSheetAvailability from './functions/updateSheetAvailability';
import { getSettings } from './settings';

const formatDate = (d) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

// Replaces the Base44 workflow. Emails a golfer when an admin changes their availability for them.
async function notifyPlayer(actor, record, event) {
  if (!emailConfigured()) return;
  if (actor.player_name.toLowerCase() === record.player_name.toLowerCase()) return;
  const player = await prisma.user.findUnique({ where: { player_name: record.player_name } });
  if (!player?.email) return;
  const when = formatDate(record.date);
  const { league_name: league } = await getSettings();
  const subject = event === 'create'
    ? `You've been added to tee time on ${when}`
    : `Your availability removed for ${when}`;
  const body = event === 'create'
    ? `Hi ${record.player_name},\n\nYou have been marked as available for the golf tee time on ${when}.\n\nIf this is incorrect, please log in to the League Scheduler to update your availability.\n\nSee you on the course!\n${league}`
    : `Hi ${record.player_name},\n\nYour availability for the golf tee time on ${when} has been removed.\n\nIf this is incorrect, please log in to the League Scheduler to update your availability.\n\n${league}`;
  await sendEmail({ to: player.email, subject, body });
}

// Runs after the response is sent, so a slow Sheets call never holds up the calendar.
export async function afterAvailabilityChange(actor, record, event) {
  if (sheetsConfigured()) {
    try {
      const res = await updateSheetAvailability(
        { player_name: record.player_name, date: record.date, value: event === 'create' ? 'Y' : 'N' },
        serverClient(actor),
      );
      if (!res.ok) console.error('sheet update failed:', await res.text());
    } catch (err) {
      console.error('sheet update failed:', err.message);
    }
  }
  try {
    await notifyPlayer(actor, record, event);
  } catch (err) {
    console.error('availability email failed:', err.message);
  }
}
