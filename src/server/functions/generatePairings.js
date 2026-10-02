import 'server-only';
import { parseTeeRating, scrambleGroups } from '@/lib/scramble';

// Fixed column indices in the HI sheet
const COL = {
  FIRST_NAME: 1,
  LAST_NAME: 2,
  HI_INDEX: 3,    // current GHIN H.I.
  NORTH_SILVER: 4,
  NORTH_WHITE: 5,
  SOUTH_SILVER: 6,
  SOUTH_WHITE: 7,
  // cols 8-9 = GHIN Chg, previous H.I. — skip
  DATE_START: 10, // availability Y/N columns start here
};

// Map course + tee to column index
function handicapColFor(course, tee) {
  const key = `${course.toUpperCase()}_${tee.toUpperCase()}`;
  const map = {
    NORTH_SILVER: COL.NORTH_SILVER,
    NORTH_WHITE:  COL.NORTH_WHITE,
    SOUTH_SILVER: COL.SOUTH_SILVER,
    SOUTH_WHITE:  COL.SOUTH_WHITE,
  };
  return map[key] ?? null;
}

export default async function generatePairings(input, base44) {
  try {
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { date, tee = 'White', format = 'standard' } = input;
    if (!date) return Response.json({ error: 'Missing date' }, { status: 400 });
    const isScramble = format === 'scramble';
    const settings = await base44.settings();

    // Read handicap sheet URL from AppSettings (fallback to hardcoded default)
    const DEFAULT_HANDICAP_SHEET_ID = '1LvPRV7YrM1fquDf_rhdz8RG9kFePiEHpakVJRyHlChw';
    let spreadsheetId = DEFAULT_HANDICAP_SHEET_ID;
    try {
      const settings = await base44.asServiceRole.entities.AppSettings.filter({ setting_key: 'handicap_sheet_url' });
      if (settings.length > 0 && settings[0].setting_value) {
        const match = settings[0].setting_value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (match) spreadsheetId = match[1];
      }
    } catch (e) {
      console.log('Could not read handicap_sheet_url setting, using default');
    }

    const pairingTab = 'Pairings';

    // --- Get Google Sheets access token ---
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // --- Dynamically find the HI sheet for the current month ---
    const metaRes0 = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const meta0 = await metaRes0.json();
    const allSheetTitles = meta0.sheets.map(s => s.properties.title);
    // Find the single season-wide HI sheet tab
    const sheetName = allSheetTitles.find(t => t.startsWith('HI '));
    if (!sheetName) return Response.json({ error: 'No HI sheet tab found' }, { status: 404 });

    // --- Fetch TeeTime record for this date to determine course ---
    const teeTimes = await base44.asServiceRole.entities.TeeTime.filter({ date });
    const teeTimeRecord = teeTimes.find(t => t.date === date || t.date?.startsWith(date));
    const course = teeTimeRecord?.course || null;

    if (!course) {
      return Response.json({ error: `No tee time record found for ${date}, or course field is missing.` }, { status: 404 });
    }

    const handicapColIdx = handicapColFor(course, tee);
    if (handicapColIdx === null) {
      return Response.json({ error: `Unrecognised course/tee combination: ${course} / ${tee}` }, { status: 400 });
    }

    const courseLabel = `${course} ${tee}`; // e.g. "North White"

    // --- Read the sheet ---
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:AZ`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    if (!sheetRes.ok) {
      const err = await sheetRes.text();
      return Response.json({ error: 'Failed to read sheet', details: err }, { status: 500 });
    }
    const sheetData = await sheetRes.json();
    const rows = sheetData.values || [];
    if (rows.length < 2) {
      return Response.json({ error: 'Sheet has no data rows' }, { status: 400 });
    }

    const headers = rows[0];

    // Extract H.I. date from the HI index column header (e.g. "GHIN\nJun_1\nH.I." → "6/1/26")
    let hiIndexDate = null;
    const hiHeader = (headers[COL.HI_INDEX] || '').toString();
    const hiDateMatch = hiHeader.match(/([A-Za-z]+)_(\d+)/);
    if (hiDateMatch) {
      const monthNames2 = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
      const monthNum = monthNames2[hiDateMatch[1]];
      const day = parseInt(hiDateMatch[2]);
      if (monthNum && day) {
        const yr = String(new Date().getFullYear()).slice(-2);
        hiIndexDate = `${monthNum}/${day}/${yr}`;
      }
    }

    // Find which column corresponds to our target date (format "D-Mon")
    const monthNames = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
    const parseHeaderDate = (header) => {
      if (!header) return null;
      const parts = header.toString().split('-');
      if (parts.length !== 2) return null;
      const day = parseInt(parts[0]);
      const monthIdx = monthNames[parts[1]];
      if (isNaN(day) || monthIdx === undefined) return null;
      return new Date(Date.UTC(new Date().getFullYear(), monthIdx, day)).toISOString().split('T')[0];
    };

    let dateColIdx = -1;
    for (let i = COL.DATE_START; i < headers.length; i++) {
      if (parseHeaderDate(headers[i]) === date) { dateColIdx = i; break; }
    }

    // If the column exists but has no "Y" marks (wasn't synced), treat it as
    // missing and fall back to the Availability entity (source of truth).
    if (dateColIdx >= 0) {
      let anyY = false;
      for (let r = 1; r < rows.length; r++) {
        if ((rows[r][dateColIdx] || '').toString().trim().toUpperCase() === 'Y') {
          anyY = true; break;
        }
      }
      if (!anyY) dateColIdx = -1;
    }

    // If the sheet has no availability column for this date, fall back to the
    // Availability entity (source of truth) so generation still works.
    let entityAvailableNames = null;
    const isPlayerAvailable = (row) => {
      if (dateColIdx >= 0) {
        return (row[dateColIdx] || '').toString().trim().toUpperCase() === 'Y';
      }
      const firstName = (row[COL.FIRST_NAME] || '').trim();
      const lastName  = (row[COL.LAST_NAME]  || '').trim();
      return entityAvailableNames.has(`${firstName} ${lastName}`.toLowerCase());
    };

    if (dateColIdx === -1) {
      const availRecords = await base44.asServiceRole.entities.Availability.filter({ date });
      entityAvailableNames = new Set(
        availRecords
          .filter(a => (a.date || '').split('T')[0] === date)
          .map(a => (a.player_name || '').replace(/\s+/g, ' ').trim().toLowerCase())
      );
    }

    // --- Collect players marked Y for this date ---
    const seenNames = new Set();
    const players = [];
    const missingHandicap = [];

    for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const firstName = (row[COL.FIRST_NAME] || '').trim();
      const lastName  = (row[COL.LAST_NAME]  || '').trim();
      if (!firstName || !lastName) continue;

      if (!isPlayerAvailable(row)) continue;

      const fullName = `${firstName} ${lastName}`;
      const nameKey  = fullName.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);

      const rawHandicap = row[handicapColIdx];
      const handicap = (rawHandicap !== undefined && rawHandicap !== '')
        ? parseFloat(rawHandicap)
        : NaN;

      const rawHI = row[COL.HI_INDEX]; // current GHIN H.I.
      const hiIndex = (rawHI !== undefined && rawHI !== '') ? parseFloat(rawHI) : null;

      // Always fetch both silver and white handicaps for this course
      const silverColIdx = handicapColFor(course, 'Silver');
      const whiteColIdx  = handicapColFor(course, 'White');
      const rawSilver = row[silverColIdx];
      const rawWhite  = row[whiteColIdx];
      const silverHcp = (rawSilver !== undefined && rawSilver !== '') ? parseFloat(rawSilver) : null;
      const whiteHcp  = (rawWhite  !== undefined && rawWhite  !== '') ? parseFloat(rawWhite)  : null;

      if (isNaN(handicap)) {
        missingHandicap.push(fullName);
        players.push({ name: fullName, handicap: 999, missingHandicap: true, hiIndex: null, silverHcp: null, whiteHcp: null });
      } else {
        players.push({ name: fullName, handicap, hiIndex, silverHcp, whiteHcp });
      }
    }

    const playerCount = players.length;

    // --- Sort: course handicap low→high, ties alphabetical; missing go last ---
    players.sort((a, b) => a.handicap - b.handicap || a.name.localeCompare(b.name));

    // --- Determine number of groups (max 4 per group, never 5) ---
    let warning = null;
    let numGroups;
    if (playerCount < 3) {
      numGroups = 1;
      warning = `Only ${playerCount} player(s) — not enough to form a full group.`;
    } else {
      numGroups = Math.ceil(playerCount / 4);
    }

    if (missingHandicap.length > 0) {
      const missingWarning = `No ${courseLabel} handicap found for: ${missingHandicap.join(', ')}. They have been placed last.`;
      warning = warning ? `${warning} ${missingWarning}` : missingWarning;
    }

    // --- Calculate group sizes (max 4 per group) ---
    const base      = Math.floor(playerCount / numGroups);
    const remainder = playerCount % numGroups;
    // Sort so 3-player groups get the lowest group numbers (assigned first)
    const groupSizes = Array.from({ length: numGroups }, (_, i) => base + (i < remainder ? 1 : 0))
      .sort((a, b) => a - b);

    // --- Round-robin assignment respecting group size caps ---
    const groups      = Array.from({ length: numGroups }, () => []);
    const groupCounts = Array(numGroups).fill(0);
    let playerIdx = 0;
    let groupIdx  = 0;
    while (playerIdx < playerCount) {
      let assigned = false;
      for (let attempts = 0; attempts < numGroups; attempts++) {
        const g = (groupIdx + attempts) % numGroups;
        if (groupCounts[g] < groupSizes[g]) {
          groups[g].push(players[playerIdx]);
          groupCounts[g]++;
          groupIdx = (g + 1) % numGroups;
          playerIdx++;
          assigned = true;
          break;
        }
      }
      if (!assigned) break;
    }

    // Within each group sort by handicap
    groups.forEach(g => g.sort((a, b) => a.handicap - b.handicap || a.name.localeCompare(b.name)));

    // For foursomes (4 players), split into two 2-man teams whose combined
    // handicaps are as close as possible. Teammates are placed adjacent in the
    // sheet (rows 1-2 = team A, rows 3-4 = team B) so the pairing is visible.
    // A scramble plays the whole foursome as one team, so it keeps handicap order.
    groups.forEach((g, gi) => {
      if (isScramble || g.length !== 4) return;
      const h = g.map(p => p.handicap);
      const pairings = [
        [[0, 1], [2, 3]],
        [[0, 2], [1, 3]],
        [[0, 3], [1, 2]],
      ];
      let best = pairings[0], bestDiff = Infinity;
      for (const [a, b] of pairings) {
        const diff = Math.abs((h[a[0]] + h[a[1]]) - (h[b[0]] + h[b[1]]));
        if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
      }
      const [teamA, teamB] = best;
      groups[gi] = [g[teamA[0]], g[teamA[1]], g[teamB[0]], g[teamB[1]]];
    });

    // --- Build sheet output ---
    const dateObj   = new Date(date + 'T12:00:00Z');
    const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const outputRows = [
      [`Pairings — ${dateLabel}`],
      [`Course: ${courseLabel}`],
      [],
    ];
    if (warning) outputRows.push([`⚠️ ${warning}`], []);

    // Team handicap is a share of the exact course handicaps, using the rating in the tee's column header.
    const teeRating = parseTeeRating(headers[handicapColIdx]);
    const scramble = isScramble ? scrambleGroups(groups, teeRating, settings.scramble_team_pct / 100) : null;
    if (isScramble && !teeRating) {
      const ratingWarning = `Could not read the course rating from the ${courseLabel} column header, so team handicaps use rounded course handicaps.`;
      warning = warning ? `${warning} ${ratingWarning}` : ratingWarning;
    }

    groups.forEach((group, idx) => {
      const s = scramble?.[idx];
      const teamNote = !s ? '' : s.exhibition ? ' (exhibition)' : ` (team ${s.teamHandicap ?? 'N/A'}, strokes ${s.teamStrokes ?? 'N/A'})`;
      outputRows.push([`Group ${idx + 1}${teamNote}`]);
      group.forEach((p) => {
        outputRows.push([p.name, p.missingHandicap ? 'N/A' : p.handicap, `(${courseLabel})`]);
      });
      outputRows.push([]);
    });

    // --- Write to Pairings tab ---
    if (!allSheetTitles.includes(pairingTab)) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title: pairingTab } } }] })
        }
      );
    } else {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(pairingTab)}!A:Z:clear`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        }
      );
    }

    const writeRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(pairingTab)}!A1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: outputRows })
      }
    );
    if (!writeRes.ok) {
      const err = await writeRes.text();
      return Response.json({ error: 'Failed to write pairings', details: err }, { status: 500 });
    }

    return Response.json({
      success: true,
      date,
      course,
      tee,
      courseLabel,
      format: isScramble ? 'scramble' : 'standard',
      hiIndexDate,
      teeStartTime: teeTimeRecord?.start_time || null,
      playerCount,
      groupCount: groups.length,
      warning: warning || null,
      groups: groups.map((g, i) => ({
        group: i + 1,
        ...(scramble && {
          exhibition: scramble[i].exhibition,
          teamHandicap: scramble[i].teamHandicap,
          teamStrokes: scramble[i].teamStrokes,
        }),
        players: g.map((p) => ({
          name: p.name,
          handicap: p.missingHandicap ? null : p.handicap,
          hiIndex: p.hiIndex ?? null,
          silverHcp: p.silverHcp ?? null,
          whiteHcp: p.whiteHcp ?? null,
          missingHandicap: p.missingHandicap || false,
        }))
      }))
    });

  } catch (error) {
    console.error('generatePairings error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}