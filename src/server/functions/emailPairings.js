import 'server-only';


export default async function emailPairings(input, base44) {
  try {
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { groups, date, courseLabel, teeStartTime } = input;
    const settings = await base44.settings();
    if (!groups || !Array.isArray(groups) || !date) {
      return Response.json({ error: 'Missing groups or date' }, { status: 400 });
    }

    // Availability only holds the synthetic @player.local key, so real addresses come from accounts.
    const nameToEmail = await base44.asServiceRole.playerEmails();

    // --- Helpers ---
    const parseTime = (t) => {
      if (!t) return null;
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const formatTime = (totalMins) => {
      const h24 = Math.floor(totalMins / 60) % 24;
      const m = totalMins % 60;
      const ampm = h24 >= 12 ? 'PM' : 'AM';
      const h12 = h24 % 12 || 12;
      return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
    };

    const formatDate = (isoDate) => {
      const d = new Date(isoDate + 'T12:00:00Z');
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    };

    const startMinutes = parseTime(teeStartTime);
    const dateStr = formatDate(date);
    const courseName = courseLabel || 'Course';

    // --- Send email to each player ---
    const sent = [];
    const skipped = [];
    const failed = [];

    for (const group of groups) {
      const groupNum = group.group;
      const groupIdx = groupNum - 1;
      const groupTeeMin = startMinutes !== null ? startMinutes + groupIdx * settings.tee_interval_minutes : null;
      const groupTeeStr = groupTeeMin !== null ? formatTime(groupTeeMin) : 'TBD';
      const playerNames = group.players.map(p => p.name);
      const playerListStr = playerNames.map((n, i) => `${i + 1}. ${n}`).join('\n');

      for (const player of group.players) {
        const email = nameToEmail.get(player.name.toLowerCase().trim());

        if (!email) {
          skipped.push(player.name);
          continue;
        }

        const subject = `Your Tee Time for ${dateStr} — Group ${groupNum}`;
        const body = [
          `Hi ${player.name},`,
          ``,
          `Here are your pairings for the upcoming round:`,
          ``,
          `📅 Date: ${dateStr}`,
          `⛳ Course: ${courseName}`,
          `🕐 Tee Time: ${groupTeeStr}`,
          `👥 Group ${groupNum}`,
          ``,
          `Your group members:`,
          playerListStr,
          ``,
          `See you on the course!`,
          ``,
          settings.league_name,
        ].join('\n');

        try {
          await base44.integrations.Core.SendEmail({ to: email, subject, body });
          sent.push(player.name);
        } catch (err) {
          failed.push({ name: player.name, error: err.message });
        }
      }
    }

    return Response.json({
      success: true,
      sentCount: sent.length,
      skippedCount: skipped.length,
      failedCount: failed.length,
      sent,
      skipped,
      failed,
    });
  } catch (error) {
    console.error('emailPairings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}