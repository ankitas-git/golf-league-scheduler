import 'server-only';


const DEFAULT_SPREADSHEET_ID = '1VOsLV3Ly52j8stu_oBipnq6E1p5nO1G6NJxBZBUd6j8';

export default async function populatePairingsSheet(input, base44) {
  try {
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { groups, courseLabel, date, teeStartTime, hiIndexDate, gameText, format = 'standard' } = input;
    const isScramble = format === 'scramble';
    const settings = await base44.settings();

    // Read pairings sheet URL from AppSettings (fallback to hardcoded default)
    let SPREADSHEET_ID = DEFAULT_SPREADSHEET_ID;
    try {
      const settings = await base44.asServiceRole.entities.AppSettings.filter({ setting_key: 'pairings_sheet_url' });
      if (settings.length > 0 && settings[0].setting_value) {
        const match = settings[0].setting_value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (match) SPREADSHEET_ID = match[1];
      }
    } catch (e) {
      console.log('Could not read pairings_sheet_url setting, using default');
    }

    // Fetch next 2 upcoming tee times after the current date
    const allTeeTimes = await base44.asServiceRole.entities.TeeTime.list('date', 50);
    const nextTwo = allTeeTimes
      .filter(t => t.date > date && t.notes !== 'CLOSED')
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 2);
    if (!groups || !Array.isArray(groups)) {
      return Response.json({ error: 'Missing groups data' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Get the sheet name (first/only sheet)
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const meta = await metaRes.json();
    const sheetId = meta.sheets?.[0]?.properties?.sheetId;
    const oldTabName = meta.sheets?.[0]?.properties?.title;
    if (!oldTabName) {
      return Response.json({ error: 'Could not find sheet tab' }, { status: 500 });
    }

    // Rename the sheet tab to include the tee time date
    let tabName = oldTabName;
    if (date) {
      const [y, m, d] = date.split('-');
      const newTabName = `Pairings Worksheet ${parseInt(m)}/${parseInt(d)}/${y}`;
      const renameRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [
              {
                updateSpreadsheetProperties: {
                  properties: { title: newTabName },
                  fields: 'title'
                }
              },
              {
                updateSheetProperties: {
                  properties: { sheetId, title: newTabName },
                  fields: 'title'
                }
              }
            ]
          })
        }
      );
      if (renameRes.ok) {
        tabName = newTabName;
      }
    }

    // Read current sheet content
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(tabName)}!A1:Z60`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const sheetData = await sheetRes.json();
    const rows = sheetData.values || [];

    // In this sheet layout, the group number row comes AFTER the player rows.
    // Structure per group:
    //   Row N:   "Tee #XY" in col A, first player in col B, handicap in C, silver in D, white in E
    //   Row N+1: "North Course" in col A, second player in col B ...
    //   Row N+2: time in col A, third player in col B ...
    //   Row N+3: (optional 4th player in col B, or empty)
    //   Row N+?: group number (just a digit) in col A
    //
    // Find the group number rows, then back-fill players starting from the tee row above them.

    // Find all group-number rows (col A is just digits, optionally with "(9 Holes)" etc.)
    const groupNumberRowIdxs = [];
    for (let i = 0; i < rows.length; i++) {
      const cellA = (rows[i]?.[0] || '').toString().trim();
      if (/^\d+(\s*\(.*\))?$/.test(cellA)) {
        groupNumberRowIdxs.push(i);
      }
    }

    // Derive course short name (e.g. "North Course", "South Course")
    const courseName = courseLabel
      ? courseLabel.split(' ')[0] + ' Course'   // "North White" → "North Course"
      : 'Course';

    // If a previous run collapsed/wiped the template (no group-number rows
    // remain), regenerate the group slots so the sheet is self-healing rather
    // than erroring out.
    if (groupNumberRowIdxs.length === 0) {
      const slotsToCreate = Math.max(groups.length, 1);
      const startRowIdx = 12; // row 13 (0-based 12) is the first group Tee row
      const neededRowCount = startRowIdx + slotsToCreate * 4 + 2;

      // Ensure the sheet grid has enough rows
      const curRowCount = meta.sheets?.[0]?.properties?.gridProperties?.rowCount || 0;
      if (curRowCount < neededRowCount) {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [{ appendDimension: { sheetId, dimension: 'ROWS', length: neededRowCount - curRowCount } }]
            })
          }
        );
      }

      // Write the A-column template structure for each slot and keep the
      // in-memory `rows` snapshot consistent so the later Tee-row scan works.
      const templateWrites = [];
      for (let g = 0; g < slotsToCreate; g++) {
        const teeRowIdx = startRowIdx + g * 4;
        const groupNumRowIdx = teeRowIdx + 3;
        templateWrites.push({ range: `'${tabName}'!A${teeRowIdx + 1}`, values: [['Tee #1']] });
        templateWrites.push({ range: `'${tabName}'!A${teeRowIdx + 2}`, values: [[courseName]] });
        templateWrites.push({ range: `'${tabName}'!A${groupNumRowIdx + 1}`, values: [[String(g + 1)]] });
        rows[teeRowIdx] = ['Tee #1'];
        rows[teeRowIdx + 1] = [courseName];
        rows[teeRowIdx + 3] = [String(g + 1)];
        groupNumberRowIdxs.push(groupNumRowIdx);
      }
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchUpdate`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ valueInputOption: 'RAW', data: templateWrites })
        }
      );
    }

    const updateData = [];

    // Helper: parse "HH:MM" into total minutes
    const parseTime = (t) => {
      if (!t) return null;
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    // Helper: format total minutes back to "H:MM AM/PM"
    const formatTime = (totalMins) => {
      const h24 = Math.floor(totalMins / 60) % 24;
      const m   = totalMins % 60;
      const ampm = h24 >= 12 ? 'PM' : 'AM';
      const h12  = h24 % 12 || 12;
      return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
    };

    const startMinutes = parseTime(teeStartTime); // null if no start time

    // --- Row 11 & 12 column headers (match Example template) ---
    const courseFirstWord = courseLabel ? courseLabel.split(' ')[0] : 'North';
    // R11: handicap group + score/points labels
    updateData.push({ range: `${tabName}!C11`, values: [['Handicap']] });
    updateData.push({ range: `${tabName}!D11`, values: [['Handicap']] });
    updateData.push({ range: `${tabName}!E11`, values: [['Handicap']] });
    // A scramble records one score per team, so F is the team score.
    updateData.push({ range: `${tabName}!F11`, values: [[isScramble ? 'Team' : 'Individual']] });
    updateData.push({ range: `${tabName}!G11`, values: [['Team']] });
    // R12: column headers (H12/I12 commissioner overwritten later by Intent section)
    updateData.push({ range: `${tabName}!B12`, values: [['Player']] });
    if (hiIndexDate) {
      updateData.push({ range: `${tabName}!C12`, values: [[`Index\n(${hiIndexDate})`]] });
    }
    // A scramble shows only the tee being played, then the team handicap in E.
    if (isScramble) {
      updateData.push({ range: `${tabName}!D12`, values: [[courseLabel || `${courseFirstWord} Silver`]] });
      updateData.push({ range: `${tabName}!E12`, values: [['Team\n(@50%)\nStrokes']] });
    } else {
      updateData.push({ range: `${tabName}!D12`, values: [[`${courseFirstWord} Silver`]] });
      updateData.push({ range: `${tabName}!E12`, values: [[`${courseFirstWord} White`]] });
    }
    updateData.push({ range: `${tabName}!F12`, values: [['Score']] });
    updateData.push({ range: `${tabName}!G12`, values: [['Points']] });

    // Update A2 with the selected game text
    if (gameText) {
      updateData.push({ range: `${tabName}!A2`, values: [[gameText]] });
    }

    // Update A1 heading with date, course, and tee start time
    if (date) {
      const dateObj = new Date(date + 'T12:00:00Z');
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
      const monthDay = dateObj.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
      const headingCourse = courseLabel ? courseLabel.split(' ')[0] + ' Course' : 'Course';
      const formatHeadingTime = (t) => {
        if (!t) return '';
        const [h, m] = t.split(':').map(Number);
        const ampm = h >= 12 ? 'pm' : 'am';
        const h12 = h % 12 || 12;
        return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
      };
      const timeStr = teeStartTime ? `, tee times starting at ${formatHeadingTime(teeStartTime)}` : '';
      const heading = `${settings.sheet_title_prefix}, ${dayName} ${monthDay} — ${headingCourse}${isScramble ? ' Scramble' : ''}${timeStr}`;
      updateData.push({ range: `${tabName}!A1`, values: [[heading]] });
    }

    // --- Rows 1–9: match the Example pairings template exactly ---
    updateData.push({ range: `${tabName}!A3`, values: [['*** Stableford scoring ***']] });
    const returnWhat = isScramble ? 'team gross score, team points and intent to play' : 'each individual gross score, team points, intent to play';
    updateData.push({ range: `${tabName}!A4`, values: [[`Captains (“C”) please return this sheet with ${returnWhat}, also, please collect ${settings.player_fee_text} from each player.`]] });
    updateData.push({ range: `${tabName}!A5`, values: [['Reminder:  All balls counting for team score must be holed out']] });
    updateData.push({ range: `${tabName}!A6`, values: [['Blind Draws please keep a separate score card.']] });
    updateData.push({ range: `${tabName}!A7`, values: [[`**To increase pace of play, please pickup if you are out of the hole.**`]] });
    updateData.push({ range: `${tabName}!A8`, values: [[`** On morning of play, if you need to cancel please call 1st Tee ${settings.cancel_phone} **`]] });
    updateData.push({ range: `${tabName}!A9`, values: [[`**${settings.local_rule_text} **`]] });
    updateData.push({ range: `${tabName}!H9`, values: [['Intent to Play (Y/N)']] });

    // Blind Draws box (G3:I7) text
    updateData.push({ range: `${tabName}!G3`, values: [['Blind Draws']] });
    updateData.push({ range: `${tabName}!G4`, values: [['BD #1']] });
    updateData.push({ range: `${tabName}!G5`, values: [['BD #2']] });
    updateData.push({ range: `${tabName}!G6`, values: [['BD #3']] });
    updateData.push({ range: `${tabName}!G7`, values: [['BD #4']] });
    updateData.push({ range: `${tabName}!I4`, values: [[`If req'd`]] });
    updateData.push({ range: `${tabName}!I5`, values: [[`If req'd`]] });
    updateData.push({ range: `${tabName}!I6`, values: [[`If req'd`]] });
    updateData.push({ range: `${tabName}!I7`, values: [[`If req'd`]] });

    // Find the NEXT immediate tee time after this game
    const nextGame = allTeeTimes
      .filter(t => t.date > date)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    
    const nextCommissionerFirstNames = new Set();
    if (nextGame?.commissioner) {
      const parts = nextGame.commissioner.trim().split(' ');
      parts.forEach(part => {
        if (part.length > 0) {
          nextCommissionerFirstNames.add(part.toLowerCase());
        }
      });
    }

    // Find the CURRENT game's commissioner
    const currentGame = allTeeTimes.find(t => t.date === date);
    const currentCommissionerFirstNames = new Set();
    if (currentGame?.commissioner) {
      const parts = currentGame.commissioner.trim().split(' ');
      parts.forEach(part => {
        if (part.length > 0) {
          currentCommissionerFirstNames.add(part.toLowerCase());
        }
      });
    }

    console.log('Next game date:', nextGame?.date, 'Commissioner:', nextGame?.commissioner);
    console.log('Next commissioner name parts:', [...nextCommissionerFirstNames]);
    console.log('Player names in groups:', groups.map(g => g.players.map(p => p.name)));

    const isCommissioner = (playerName) => {
      const nameParts = playerName.trim().split(' ');
      const match = nameParts.some(part => nextCommissionerFirstNames.has(part.toLowerCase()));
      console.log(`Checking ${playerName}: match=${match}`);
      return match;
    };

    const isCurrentCommissioner = (playerName) => {
      const nameParts = playerName.trim().split(' ');
      return nameParts.some(part => currentCommissionerFirstNames.has(part.toLowerCase()));
    };

    // Sort groups: threesomes first (earliest tee times), then move the
    // commissioner's group to the front (earliest tee time, group #1).
    const sortedGroups = [...groups].sort((a, b) => a.players.length - b.players.length);
    const commGroupIdx = sortedGroups.findIndex(g =>
      g.players.some(p => isCommissioner(p.name))
    );
    console.log('Commissioner group index found:', commGroupIdx);
    if (commGroupIdx >= 0 && commGroupIdx !== 0) {
      const [commGroup] = sortedGroups.splice(commGroupIdx, 1);
      sortedGroups.unshift(commGroup);
    }

    // Move the current game's commissioner's group to the end (latest tee time)
    const currentCommGroupIdx = sortedGroups.findIndex(g =>
      g.players.some(p => isCurrentCommissioner(p.name))
    );
    if (currentCommGroupIdx >= 0 && currentCommGroupIdx !== sortedGroups.length - 1) {
      const [currentCommGroup] = sortedGroups.splice(currentCommGroupIdx, 1);
      sortedGroups.push(currentCommGroup);
    }

    // Process group slots — write generated groups, clear unused template slots,
    // and extend the template when there are more groups than existing slots.
    const totalTemplateGroups = groupNumberRowIdxs.length;
    // Slot size: rows per group slot. A fresh template uses 5 rows (4 group +
    // 1 blank separator); a sheet already made adjacent by a prior run uses 4.
    // Detect from the gap between the first two group-number rows.
    const slotSize = groupNumberRowIdxs.length > 1
      ? (groupNumberRowIdxs[1] - groupNumberRowIdxs[0])
      : 5;
    const lastGroupNumRowIdx = groupNumberRowIdxs[groupNumberRowIdxs.length - 1];
    const groupSlotTeeRowIdxs = []; // 0-based tee row index of each slot, for format copying

    // Ensure the sheet grid has enough rows for all generated groups (incl.
    // slots extended beyond the existing template). A prior run may have
    // trimmed the grid; the extend branch below writes into rows that must
    // already exist or the values batchUpdate fails with "exceeds grid limits".
    if (sortedGroups.length > totalTemplateGroups) {
      const extCount = sortedGroups.length - totalTemplateGroups;
      const lastExtTeeRowIdx = lastGroupNumRowIdx + (slotSize - 3) + (extCount - 1) * slotSize;
      const neededRowCount = lastExtTeeRowIdx + 4; // 4 rows per group (0-based idx + 1 → +4)
      const curRowCount = meta.sheets?.[0]?.properties?.gridProperties?.rowCount || 0;
      if (curRowCount < neededRowCount) {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [{ appendDimension: { sheetId, dimension: 'ROWS', length: neededRowCount - curRowCount } }]
            })
          }
        );
      }
    }

    for (let idx = 0; idx < Math.max(totalTemplateGroups, sortedGroups.length); idx++) {
      let group = sortedGroups[idx]; // undefined if beyond generated groups

      // If any player in this group is a commissioner in an upcoming game, move them first
      if (group) {
        const commIdx = group.players.findIndex(p => isCommissioner(p.name));
        if (commIdx > 0) {
          const reordered = [...group.players];
          const [commPlayer] = reordered.splice(commIdx, 1);
          reordered.unshift(commPlayer);
          group = { ...group, players: reordered };
        }
      }

      const captainSlot = group ? Math.floor(Math.random() * group.players.length) : 0;

      // Determine this slot's group-number row and tee row. For slots beyond the
      // existing template, extend by writing the col-A structure into empty rows
      // below the last slot (each group slot = 4 rows + 1 blank = 5 rows).
      let groupNumRowIdx;
      let teeRowIdx;
      if (idx < totalTemplateGroups) {
        groupNumRowIdx = groupNumberRowIdxs[idx];
        teeRowIdx = groupNumRowIdx - 1;
        for (let r = groupNumRowIdx - 1; r >= 0; r--) {
          const cellA = (rows[r]?.[0] || '').toString().trim();
          if (/^(Tee|Team)/i.test(cellA)) {
            teeRowIdx = r;
            break;
          }
        }
      } else {
        const extIdx = idx - totalTemplateGroups;
        teeRowIdx = lastGroupNumRowIdx + (slotSize - 3) + extIdx * slotSize;
        groupNumRowIdx = teeRowIdx + 3;
        updateData.push({ range: `${tabName}!A${teeRowIdx + 1}`, values: [['Tee #1']] });
        updateData.push({ range: `${tabName}!A${teeRowIdx + 2}`, values: [[courseName]] });
        updateData.push({ range: `${tabName}!A${groupNumRowIdx + 1}`, values: [[String(idx + 1)]] });
      }

      groupSlotTeeRowIdxs.push(teeRowIdx);

      // Unused template slot (not enough teams generated) — clear player cells but
      // keep the template rows intact so future runs with more groups still fit.
      if (!group) {
        const teeSheetRow      = teeRowIdx + 1;
        const courseSheetRow   = teeRowIdx + 2;
        const timeSheetRow     = teeRowIdx + 3;
        const groupNumSheetRow = groupNumRowIdx + 1;
        updateData.push({ range: `${tabName}!A${timeSheetRow}`, values: [['']] });
        updateData.push({ range: `${tabName}!B${teeSheetRow}:E${teeSheetRow}`, values: [['', '', '', '']] });
        updateData.push({ range: `${tabName}!B${courseSheetRow}:E${courseSheetRow}`, values: [['', '', '', '']] });
        updateData.push({ range: `${tabName}!B${timeSheetRow}:E${timeSheetRow}`, values: [['', '', '', '']] });
        updateData.push({ range: `${tabName}!B${groupNumSheetRow}:E${groupNumSheetRow}`, values: [['', '', '', '']] });
        continue;
      }

      const groupTeeMin = startMinutes !== null ? startMinutes + idx * settings.tee_interval_minutes : null;
      const groupTeeStr = groupTeeMin !== null ? formatTime(groupTeeMin) : '';

      // Update col A for the 3 fixed rows of this group slot
      const teeSheetRow    = teeRowIdx + 1;
      const courseSheetRow = teeRowIdx + 2;
      const timeSheetRow   = teeRowIdx + 3;

      updateData.push({ range: `${tabName}!A${teeSheetRow}`,    values: [[`Tee #1`]] });
      updateData.push({ range: `${tabName}!A${courseSheetRow}`, values: [[courseName]] });
      updateData.push({ range: `${tabName}!A${timeSheetRow}`,   values: [[groupTeeStr]] });

      const playerSlotRowIdxs = [
        teeRowIdx,
        teeRowIdx + 1,
        teeRowIdx + 2,
        groupNumRowIdx
      ];

      playerSlotRowIdxs.forEach((rowIdx, slotNum) => {
        const sheetRowNum = rowIdx + 1;
        const player = group?.players[slotNum];

        if (player) {
          const hiIndex = (player.hiIndex !== null && player.hiIndex !== undefined) ? player.hiIndex : '';
          const silverHcp = (!player.missingHandicap && player.silverHcp !== null && player.silverHcp !== undefined) ? player.silverHcp : '';
          const whiteHcp  = (!player.missingHandicap && player.whiteHcp  !== null && player.whiteHcp  !== undefined) ? player.whiteHcp  : '';
          const displayName = slotNum === captainSlot ? `${player.name} - C` : player.name;
          const playedHcp = (!player.missingHandicap && player.handicap !== null && player.handicap !== undefined) ? player.handicap : '';
          updateData.push({
            range: `${tabName}!B${sheetRowNum}:E${sheetRowNum}`,
            values: [isScramble
              ? [displayName, hiIndex, playedHcp, scrambleCell(group, slotNum)]
              : [displayName, hiIndex, silverHcp, whiteHcp]]
          });
        } else {
          updateData.push({
            range: `${tabName}!B${sheetRowNum}:E${sheetRowNum}`,
            values: [['', '', '', isScramble ? scrambleCell(group, slotNum) : '']]
          });
        }
      });
    }

    // --- Update "Intent to Play" section (rows 10-12, cols H & I) ---
    // Row 10: dates as "M/D"
    // Row 11: course + start time
    // Row 12: clear (player fills in manually)
    const formatIntentDate = (isoDate) => {
      const [, m, d] = isoDate.split('-');
      return `${parseInt(m)}/${parseInt(d)}`;
    };
    const formatIntentTime = (t) => {
      if (!t) return '';
      const [h, m] = t.split(':').map(Number);
      const ampm = h >= 12 ? 'pm' : 'am';
      const h12 = h % 12 || 12;
      return m === 0 ? `${h12}${ampm}` : `${h12}.${m.toString().padStart(2, '0')}${ampm}`;
    };

    // H col = col index 7, rows 10, 11, 12 (1-based)
    const g1 = nextTwo[0];
    const g2 = nextTwo[1];
    updateData.push({ range: `${tabName}!H10`, values: [[g1 ? formatIntentDate(g1.date) : '']] });
    updateData.push({ range: `${tabName}!I10`, values: [[g2 ? formatIntentDate(g2.date) : '']] });
    updateData.push({ range: `${tabName}!H11`, values: [[g1 ? g1.course.split(' ')[0] : '']] });
    updateData.push({ range: `${tabName}!I11`, values: [[g2 ? g2.course.split(' ')[0] : '']] });
    // Row 12: commissioner name (auto-populated)
    updateData.push({ range: `${tabName}!H12`, values: [[g1?.commissioner || '']] });
    updateData.push({ range: `${tabName}!I12`, values: [[g2?.commissioner || '']] });

    if (updateData.length === 0) {
      return Response.json({ error: 'No updates to write' }, { status: 400 });
    }

    // A previous scramble run merges E:G per team. Undo that and its styling before writing.
    if (groupSlotTeeRowIdxs.length > 0) {
      const areaStart = Math.min(...groupSlotTeeRowIdxs);
      const areaEnd = Math.max(...groupSlotTeeRowIdxs) + slotSize;
      const area = { sheetId, startRowIndex: areaStart, endRowIndex: areaEnd, startColumnIndex: 4, endColumnIndex: 7 };
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [
            { unmergeCells: { range: area } },
            {
              repeatCell: {
                range: area,
                cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: { italic: false } } },
                fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.italic'
              }
            }
          ] })
        }
      );
    }

    // Batch write
    const writeRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchUpdate`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            valueInputOption: 'RAW',
            data: updateData
          })
        }
      );

    // Apply text wrapping to header rows (1-12) and all group player rows so
    // long text (headings, notes, wrapped column headers, player names)
    // displays fully instead of overflowing or being clipped.
    const wrapRequests = [
      // Header block: rows 1-12, columns A-I
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 12, startColumnIndex: 0, endColumnIndex: 9 },
          cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
          fields: 'userEnteredFormat.wrapStrategy'
        }
      }
    ];
    // Player name + handicap cells for each generated group (columns B-E across the 4 group rows)
    for (let i = 0; i < sortedGroups.length; i++) {
      const r = groupSlotTeeRowIdxs[i];
      wrapRequests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: r, endRowIndex: r + 4, startColumnIndex: 1, endColumnIndex: 5 },
          cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
          fields: 'userEnteredFormat.wrapStrategy'
        }
      });
    }
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: wrapRequests })
      }
    );

    if (!writeRes.ok) {
      const err = await writeRes.text();
      return Response.json({ error: 'Failed to write to sheet', details: err }, { status: 500 });
    }

    // Copy cell formatting (borders/outlines) from the first group slot to all
    // other slots so extended and previously-corrupted slots match the template.
    if (groupSlotTeeRowIdxs.length > 1) {
      const sourceStart = groupSlotTeeRowIdxs[0];
      const formatRequests = groupSlotTeeRowIdxs.slice(1).map(destStart => ({
        copyPaste: {
          source: { sheetId, startRowIndex: sourceStart, endRowIndex: sourceStart + slotSize, startColumnIndex: 0, endColumnIndex: 5 },
          destination: { sheetId, startRowIndex: destStart, endRowIndex: destStart + slotSize, startColumnIndex: 0, endColumnIndex: 5 },
          pasteType: 'PASTE_FORMAT'
        }
      }));
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: formatRequests })
        }
      );
    }

    // Delete extra blank rows beyond the last used group's separator (unused
    // template slots + leftover empty rows from previous runs).
    if (sortedGroups.length > 0) {
      const lastUsedTeeIdx = groupSlotTeeRowIdxs[sortedGroups.length - 1];
      const lastUsedSeparatorIdx = lastUsedTeeIdx + 4; // 0-based
      const lastTemplateSeparatorIdx = groupNumberRowIdxs[totalTemplateGroups - 1] + 1; // 0-based
      const deleteStartIdx = lastUsedSeparatorIdx; // 0-based, include the separator after the last group
      const deleteEndIdx = Math.max(lastTemplateSeparatorIdx + 2, deleteStartIdx + 25); // 0-based, exclusive
      if (deleteEndIdx > deleteStartIdx) {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [{
                deleteDimension: {
                  range: { sheetId, dimension: 'ROWS', startIndex: deleteStartIdx, endIndex: deleteEndIdx }
                }
              }]
            })
          }
        );
      }
    }

    // Set consistent row heights for all group content + separator rows so
    // extended/previously-collapsed slots match the template (34px).
    if (groupSlotTeeRowIdxs.length > 0 && sortedGroups.length > 0) {
      const firstGroupRowIdx = groupSlotTeeRowIdxs[0]; // 0-based
      const lastGroupRowIdx = groupSlotTeeRowIdxs[sortedGroups.length - 1] + 3; // 0-based, group number row (exclude trailing separator)
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              updateDimensionProperties: {
                range: { sheetId, dimension: 'ROWS', startIndex: firstGroupRowIdx, endIndex: lastGroupRowIdx + 1 },
                properties: { pixelSize: 34 },
                fields: 'pixelSize'
              }
            }]
          })
        }
      );
    }

    // Set explicit row heights for header rows 1-12 so all text (headings,
    // notes, wrapped column headers) displays with correct spacing.
    // Auto-resize doesn't work reliably with merged cells, so we set
    // heights manually based on font size and estimated line count.
    // R2 (game text) height grows with text length so wrapped content
    // (e.g. the long Scramble rules) is fully visible, not clipped.
    // A2:F2 ≈ 633px wide ≈ ~80 chars/line at 15pt bold; ~20px per line.
    const row2Lines = gameText ? Math.max(2, Math.ceil(gameText.length / 80)) : 2;
    const row2Height = Math.max(54, row2Lines * 20 + 14);

    const headerRowHeights = [
      [0, 34],   // R1:  15pt bold heading
      [1, row2Height],   // R2:  15pt bold game text (wraps, height scales with length)
      [2, 42],   // R3:  16pt bold
      [3, 78],   // R4:  15pt bold, long wrapped text
      [4, 54],   // R5:  17pt bold
      [5, 38],   // R6:  15pt bold
      [6, 45],   // R7:  16pt bold
      [7, 46],   // R8:  14pt bold
      [8, 29],   // R9:  16pt bold
      [9, 23],   // R10: dates
      [10, 32],  // R11: course headers
      [11, 46],  // R12: wrapped column headers
    ];
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: headerRowHeights.map(([rowIdx, height]) => ({
            updateDimensionProperties: {
              range: { sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 },
              properties: { pixelSize: height },
              fields: 'pixelSize'
            }
          }))
        })
      }
    );

    // Set column widths to match the Example template
    const columnWidths = [
      [0, 98], [1, 216], [2, 80], [3, 80], [4, 80],
      [5, 79], [6, 79], [7, 73], [8, 71]
    ];
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: columnWidths.map(([colIdx, width]) => ({
            updateDimensionProperties: {
              range: { sheetId, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 },
              properties: { pixelSize: width },
              fields: 'pixelSize'
            }
          }))
        })
      }
    );

    // Set borders: Blind Draws box (G3:I7), F column separator, and group data blocks
    const borderRequests = [
      // Blind Draws box — thick outer border
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 7, startColumnIndex: 6, endColumnIndex: 9 },
          top: { style: 'SOLID_THICK' }, bottom: { style: 'SOLID_THICK' },
          left: { style: 'SOLID_THICK' }, right: { style: 'SOLID_THICK' }
        }
      },
      // Blind Draws header divider (row 3 bottom) — thick
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 6, endColumnIndex: 9 },
          bottom: { style: 'SOLID_THICK' }
        }
      },
      // Blind Draws internal BD row dividers (rows 4-6 bottom) — medium
      ...[4, 5, 6].map(r => ({
        updateBorders: {
          range: { sheetId, startRowIndex: r - 1, endRowIndex: r, startColumnIndex: 6, endColumnIndex: 9 },
          bottom: { style: 'SOLID_MEDIUM' }
        }
      })),
      // Blind Draws internal column dividers — medium between G-H, H-I (BD rows only)
      ...[7, 8].map(c => ({
        updateBorders: {
          range: { sheetId, startRowIndex: 3, endRowIndex: 7, startColumnIndex: c - 1, endColumnIndex: c },
          right: { style: 'SOLID_MEDIUM' }
        }
      })),
      // F column separator — thick right border on F4:F7
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 3, endRowIndex: 7, startColumnIndex: 5, endColumnIndex: 6 },
          right: { style: 'SOLID_THICK' }
        }
      }
    ];

    // E column border-clearing requests (sent in a separate batchUpdate so a
    // failure here never blocks the main outline borders).
    const eClearRequests = [];

    // Group data block borders — match the example template exactly. The
    // outlined box spans columns A-D (Tee/Course/Time/Group# rows); column E
    // (White HCP) sits to the right with horizontal lines extending across it
    // but no vertical walls. Per the example:
    //   Vertical:  A-left=thick, A|B=thick, B|C=thick, C|D=medium, D|E=thick
    //   Top edge:  A=medium, B-E=thick
    //   Dividers:  A-B=thin, C-E=medium  (3 internal)
    //   Bottom:    A=medium, B-E=thick
    for (let i = 0; i < sortedGroups.length; i++) {
      const r = groupSlotTeeRowIdxs[i]; // 0-based Tee row index

      // --- Vertical borders (uniform across all 4 rows) ---
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 4, startColumnIndex: 0, endColumnIndex: 1 }, left: { style: 'SOLID_THICK' } } });   // A-left
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 4, startColumnIndex: 0, endColumnIndex: 1 }, right: { style: 'SOLID_THICK' } } });  // A|B
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 4, startColumnIndex: 1, endColumnIndex: 2 }, right: { style: 'SOLID_THICK' } } });  // B|C
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 4, startColumnIndex: 2, endColumnIndex: 3 }, right: { style: 'SOLID_MEDIUM' } } }); // C|D
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 4, startColumnIndex: 3, endColumnIndex: 4 }, right: { style: 'SOLID_THICK' } } });  // D|E (box right edge)

      // --- Top edge: A=medium, B-E=thick ---
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 1 }, top: { style: 'SOLID_MEDIUM' } } });
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 5 }, top: { style: 'SOLID_THICK' } } });

      // --- Internal horizontal dividers (3): A-B=thin, C-E=medium ---
      for (let d = 0; d < 3; d++) {
        borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r + d, endRowIndex: r + d + 1, startColumnIndex: 0, endColumnIndex: 2 }, bottom: { style: 'SOLID' } } });
        borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r + d, endRowIndex: r + d + 1, startColumnIndex: 2, endColumnIndex: 5 }, bottom: { style: 'SOLID_MEDIUM' } } });
      }

      // --- Bottom edge: A=medium, B-E=thick ---
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r + 3, endRowIndex: r + 4, startColumnIndex: 0, endColumnIndex: 1 }, bottom: { style: 'SOLID_MEDIUM' } } });
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r + 3, endRowIndex: r + 4, startColumnIndex: 1, endColumnIndex: 5 }, bottom: { style: 'SOLID_THICK' } } });

      // --- F, G, H, I columns: score / points / intent-to-play grid ---
      //   Verticals matching the header separators:
      //     F-left=medium, F|G=thick, G|H=thick, H|I=medium, I-right=thick
      //   Horizontals: thin top/bottom + 3 thin internal dividers (4 cells per group)
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 4, startColumnIndex: 5, endColumnIndex: 6 }, left: { style: 'SOLID_MEDIUM' } } });   // F-left (E|F)
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 4, startColumnIndex: 5, endColumnIndex: 6 }, right: { style: 'SOLID_THICK' } } });  // F|G
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 4, startColumnIndex: 6, endColumnIndex: 7 }, right: { style: 'SOLID_THICK' } } });  // G|H
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 4, startColumnIndex: 7, endColumnIndex: 8 }, right: { style: 'SOLID_MEDIUM' } } });  // H|I
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 4, startColumnIndex: 8, endColumnIndex: 9 }, right: { style: 'SOLID_THICK' } } });  // I-right
      // Top edge — thick to match A-E box (bold line extends to end of table)
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 5, endColumnIndex: 9 }, top: { style: 'SOLID_THICK' } } });
      // Bottom edge — thick to match A-E box (bold line extends to end of table)
      borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r + 3, endRowIndex: r + 4, startColumnIndex: 5, endColumnIndex: 9 }, bottom: { style: 'SOLID_THICK' } } });
      // 3 internal horizontal dividers (thin)
      for (let d = 0; d < 3; d++) {
        borderRequests.push({ updateBorders: { range: { sheetId, startRowIndex: r + d, endRowIndex: r + d + 1, startColumnIndex: 5, endColumnIndex: 9 }, bottom: { style: 'SOLID' } } });
      }

      // --- Clear all of column E's borders (open area, no vertical walls) ---
      // Sent BEFORE the main batch, which then re-applies E's horizontal lines.
      eClearRequests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: r, endRowIndex: r + 4, startColumnIndex: 4, endColumnIndex: 5 },
          cell: { userEnteredFormat: { borders: {} } },
          fields: 'userEnteredFormat.borders'
        }
      });
    }

    // Clear column E borders first (all 4 sides) — best-effort, never blocks outlines.
    // A scramble keeps E boxed since it holds the team handicap.
    if (!isScramble && eClearRequests.length > 0) {
      const eClearRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: eClearRequests })
        }
      );
      if (!eClearRes.ok) {
        console.error('E-clear batchUpdate failed:', await eClearRes.text());
      }
    }

    const borderRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: borderRequests })
      }
    );
    if (!borderRes.ok) {
      console.error('Border batchUpdate failed:', await borderRes.text());
    }

    if (isScramble) {
      const scrambleRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: scrambleFormatRequests(sheetId, sortedGroups, groupSlotTeeRowIdxs) })
        }
      );
      if (!scrambleRes.ok) {
        console.error('Scramble format batchUpdate failed:', await scrambleRes.text());
      }
    }

    // Bold the group-number rows (the row after each team's player rows) to
    // match the sample template. Done before separator-row deletion so the
    // 0-based indices still line up with the in-memory groupSlotTeeRowIdxs.
    if (groupSlotTeeRowIdxs.length > 0 && sortedGroups.length > 0) {
      const boldRequests = [];
      for (let i = 0; i < sortedGroups.length; i++) {
        const groupNumRowIdx = groupSlotTeeRowIdxs[i] + 3; // 0-based
        boldRequests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: groupNumRowIdx, endRowIndex: groupNumRowIdx + 1, startColumnIndex: 0, endColumnIndex: 9 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold'
          }
        });
      }
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: boldRequests })
        }
      );
    }

    // Delete blank separator rows between groups so groups are directly adjacent.
    // Process bottom-to-top to preserve row indices above each deletion.
    // Only delete separators when the template uses 5-row slots (4 group rows +
    // 1 blank separator). A sheet already made adjacent by a prior run has
    // slotSize 4 and no separators — deleting at +4 would destroy group rows.
    if (slotSize >= 5 && sortedGroups.length > 1) {
      const separatorRequests = [];
      for (let i = sortedGroups.length - 2; i >= 0; i--) {
        const sepRowIdx = groupSlotTeeRowIdxs[i] + 4; // 0-based, blank row after group number row
        separatorRequests.push({
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: sepRowIdx, endIndex: sepRowIdx + 1 }
          }
        });
      }
      if (separatorRequests.length > 0) {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: separatorRequests })
          }
        );
      }
    }

    return Response.json({ success: true, groupsWritten: sortedGroups.length, tab: tabName });

  } catch (error) {
    console.error('populatePairingsSheet error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
// Column E for a scramble. Row 1 shows the team handicap and rows 2 to 4 the strokes, like the paper sheet.
function scrambleCell(group, slotNum) {
  if (!group) return '';
  if (group.exhibition) return group.players[slotNum] ? 'exhibition' : '';
  if (slotNum === 0) return group.teamHandicap === null || group.teamHandicap === undefined ? '' : `(${group.teamHandicap})`;
  if (slotNum === 1) return group.teamStrokes === null || group.teamStrokes === undefined ? '' : group.teamStrokes;
  return '';
}

// One score and one points box per team. Exhibition groups do not score points, so G is grayed out.
function scrambleFormatRequests(sheetId, groups, teeRowIdxs) {
  const cell = (r0, r1, c) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c, endColumnIndex: c + 1 });
  const centered = { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' };
  const requests = [];
  groups.forEach((group, i) => {
    const r = teeRowIdxs[i];
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: r, endRowIndex: r + 4, startColumnIndex: 4, endColumnIndex: 7 },
        cell: { userEnteredFormat: centered },
        fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment'
      }
    });
    if (group.exhibition) {
      requests.push({
        repeatCell: {
          range: cell(r, r + 4, 6),
          cell: { userEnteredFormat: { backgroundColor: { red: 0.851, green: 0.851, blue: 0.851 } } },
          fields: 'userEnteredFormat.backgroundColor'
        }
      });
      return;
    }
    requests.push({
      repeatCell: {
        range: cell(r, r + 1, 4),
        cell: { userEnteredFormat: { textFormat: { italic: true } } },
        fields: 'userEnteredFormat.textFormat.italic'
      }
    });
    requests.push({ mergeCells: { range: cell(r + 1, r + 4, 4), mergeType: 'MERGE_ALL' } });
    requests.push({ mergeCells: { range: cell(r, r + 4, 5), mergeType: 'MERGE_ALL' } });
    requests.push({ mergeCells: { range: cell(r, r + 4, 6), mergeType: 'MERGE_ALL' } });
  });
  return requests;
}
