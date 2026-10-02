import 'server-only';


async function syncSheet(accessToken, spreadsheetId, dateColStart) {
  // Find the HI sheet tab (single season-wide sheet)
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const meta = await metaRes.json();
  const allTitles = meta.sheets.map(s => s.properties.title);
  const sheetName = allTitles.find(t => t.startsWith('HI '));
  if (!sheetName) throw new Error(`No HI sheet tab found in spreadsheet ${spreadsheetId}`);

  // Read the sheet
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:AZ`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to read sheet: ${error}`);
  }

  const data = await response.json();
  const rows = data.values || [];
  if (rows.length === 0) throw new Error('No data found in sheet');

  const sheetProps = meta.sheets.find(s => s.properties.title === sheetName)?.properties;
  const sheetId = sheetProps?.sheetId;
  const columnCount = sheetProps?.gridProperties?.columnCount || 0;

  return { sheetName, rows, sheetId, columnCount };
}

export default async function autoSyncAvailability(input, base44) {
  try {

    // Get Google Sheets access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Sheet IDs and their date column start index
    // Read handicap sheet URL from AppSettings; fall back to hardcoded defaults
    let sheets = [
      { spreadsheetId: '1r-kIS4b4xmxNUz68Vmzd7WL5u3F7vumQ53_9mvQ-_cw', dateColStart: 8 },
      { spreadsheetId: '1LvPRV7YrM1fquDf_rhdz8RG9kFePiEHpakVJRyHlChw', dateColStart: 10 },
    ];
    try {
      const settings = await base44.asServiceRole.entities.AppSettings.filter({ setting_key: 'handicap_sheet_url' });
      if (settings.length > 0 && settings[0].setting_value) {
        const match = settings[0].setting_value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (match) {
          sheets = [{ spreadsheetId: match[1], dateColStart: 10 }];
        }
      }
    } catch (e) {
      console.log('Could not read handicap_sheet_url setting, using defaults');
    }

    // Get ALL availabilities with pagination
    let allAvailabilities = [];
    let skip = 0;
    const pageSize = 200;
    while (true) {
      const page = await base44.asServiceRole.entities.Availability.filter({}, 'created_date', pageSize, skip);
      allAvailabilities = allAvailabilities.concat(page);
      if (page.length < pageSize) break;
      skip += pageSize;
    }

    console.log('Total availabilities:', allAvailabilities.length);

    // Fetch upcoming tee times so only those dates show availability in the sheet
    const allTeeTimes = await base44.asServiceRole.entities.TeeTime.list('date', 200);
    const todayStr = new Date().toISOString().split('T')[0];
    const upcomingTeeDates = new Set(
      allTeeTimes
        .filter(t => t.date >= todayStr && (t.notes || '').toUpperCase() !== 'CLOSED')
        .map(t => (t.date || '').split('T')[0])
    );
    console.log('Upcoming tee time dates:', [...upcomingTeeDates]);

    const monthNames = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };

    let totalUpdated = 0;
    let totalDeletedColumns = 0;
    const diagnostics = [];

    for (const { spreadsheetId, dateColStart } of sheets) {
      const { sheetName, rows, sheetId, columnCount } = await syncSheet(accessToken, spreadsheetId, dateColStart);
      const headers = rows[0];

      // Categorize date columns: upcoming (write Y/N) vs anything else (delete the column).
      // Blank-header columns are included for deletion — they are leftover cleared columns.
      const upcomingCols = []; // { colIdx, dateToMatch }
      const columnsToDelete = [];
      for (let colIdx = dateColStart; colIdx < headers.length; colIdx++) {
        const header = headers[colIdx];
        let dateToMatch = null;
        if (header) {
          const parts = header.toString().split('-');
          if (parts.length === 2) {
            const day = parseInt(parts[0]);
            const monthIdx = monthNames[parts[1]];
            if (!isNaN(day) && monthIdx !== undefined) {
              const year = new Date().getFullYear();
              dateToMatch = new Date(Date.UTC(year, monthIdx, day)).toISOString().split('T')[0];
            }
          }
        }
        if (dateToMatch && upcomingTeeDates.has(dateToMatch)) {
          upcomingCols.push({ colIdx, dateToMatch });
        } else {
          columnsToDelete.push(colIdx);
        }
      }
      // Also remove any trailing columns beyond the last upcoming date column
      // (orphaned columns the values API truncates because they're blank).
      const maxUpcomingCol = upcomingCols.length > 0
        ? Math.max(...upcomingCols.map(c => c.colIdx))
        : dateColStart - 1;
      for (let colIdx = maxUpcomingCol + 1; colIdx < columnCount; colIdx++) {
        columnsToDelete.push(colIdx);
      }
      console.log(`Sheet ${spreadsheetId}: upcoming=${upcomingCols.length} toDelete=${columnsToDelete.length} columnCount=${columnCount}`);
      diagnostics.push({
        spreadsheetId,
        sheetName,
        sheetId,
        columnCount,
        headersLength: headers.length,
        dateColStart,
        upcomingCount: upcomingCols.length,
        upcomingDates: upcomingCols.map(c => c.dateToMatch),
        columnsToDelete,
        headerSample: headers.slice(dateColStart, Math.min(headers.length, dateColStart + 15))
      });

      // Write Y/N only for upcoming date columns
      const updates = [];
      for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        const firstName = (row[1] || '').trim();
        const lastName  = (row[2] || '').trim();
        if (!firstName || !lastName) continue;

        const fullName = `${firstName} ${lastName}`.toLowerCase();

        for (const { colIdx, dateToMatch } of upcomingCols) {
          const hasAvailability = allAvailabilities.some(a => {
            const normalizedName = a.player_name.replace(/\s+/g, ' ').trim().toLowerCase();
            const aDate = (a.date || '').split('T')[0];
            return aDate === dateToMatch && normalizedName === fullName;
          });

          const cellValue = hasAvailability ? 'Y' : 'N';
          const colLetter = colIdx < 26
            ? String.fromCharCode(65 + colIdx)
            : 'A' + String.fromCharCode(65 + (colIdx - 26));
          const cellAddress = `${colLetter}${rowIdx + 1}`;

          updates.push({
            range: `'${sheetName}'!${cellAddress}`,
            values: [[cellValue]]
          });
        }
      }

      if (updates.length > 0) {
        const updateResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ valueInputOption: 'RAW', data: updates })
          }
        );

        if (!updateResponse.ok) {
          const error = await updateResponse.text();
          throw new Error(`Failed to update sheet ${spreadsheetId}: ${error}`);
        }

        totalUpdated += updates.length;
      }

      // Auto-delete past date columns (right to left to preserve indices)
      if (columnsToDelete.length > 0 && sheetId !== undefined) {
        const deleteRequests = columnsToDelete.sort((a, b) => b - a).map(colIdx => ({
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: colIdx,
              endIndex: colIdx + 1
            }
          }
        }));
        const deleteRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ requests: deleteRequests })
          }
        );
        if (!deleteRes.ok) {
          const error = await deleteRes.text();
          console.error(`Failed to delete columns in sheet ${spreadsheetId}: ${error}`);
        } else {
          totalDeletedColumns += columnsToDelete.length;
        }
      }
    }

    return Response.json({
      success: true,
      message: `Updated ${totalUpdated} cells and deleted ${totalDeletedColumns} columns across both Google Sheets`,
      updatedCells: totalUpdated,
      deletedColumns: totalDeletedColumns,
      upcomingTeeDates: [...upcomingTeeDates],
      diagnostics
    });

  } catch (error) {
    console.error('Error syncing availability:', error);
    return Response.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}