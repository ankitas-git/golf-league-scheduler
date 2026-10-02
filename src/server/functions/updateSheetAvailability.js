import 'server-only';


export default async function updateSheetAvailability(input, base44) {
  try {
    const { player_name, date, value } = input; // value: 'Y' or 'N'

    if (!player_name || !date || !value) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Read handicap sheet URL from AppSettings (fallback to hardcoded default)
    const DEFAULT_HANDICAP_SHEET_ID = '1r-kIS4b4xmxNUz68Vmzd7WL5u3F7vumQ53_9mvQ-_cw';
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

    // Find the HI sheet tab (single season-wide sheet)
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const meta = await metaRes.json();
    const allTitles = meta.sheets.map(s => s.properties.title);
    const sheetName = allTitles.find(t => t.startsWith('HI '));
    if (!sheetName) return Response.json({ error: 'No HI sheet tab found' }, { status: 404 });

    // Read the full sheet
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:AZ`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      const error = await response.text();
      return Response.json({ error: 'Failed to read sheet', details: error }, { status: 500 });
    }

    const data = await response.json();
    const rows = data.values || [];
    if (rows.length === 0) return Response.json({ error: 'Empty sheet' }, { status: 400 });

    const headers = rows[0];

    // Parse the input date (YYYY-MM-DD) to match "D-Mon" header format (e.g. "4-Jun")
    const dateObj = new Date(date + 'T12:00:00Z');
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const targetHeader = `${dateObj.getUTCDate()}-${monthNames[dateObj.getUTCMonth()]}`;

    // Find the column index for this date
    let colIdx = -1;
    for (let i = 8; i < headers.length; i++) {
      const header = (headers[i] || '').toString().trim();
      if (header === targetHeader) {
        colIdx = i;
        break;
      }
    }

    if (colIdx === -1) {
      return Response.json({ error: `Date column not found for ${date} (looking for ${targetHeader})` }, { status: 404 });
    }

    // Find the row for this player (columns B=first name, C=last name)
    const nameParts = player_name.trim().split(/\s+/);
    const firstName = nameParts[0].toLowerCase();
    const lastName = nameParts[nameParts.length - 1].toLowerCase();

    let rowIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowFirst = (row[1] || '').trim().toLowerCase();
      const rowLast = (row[2] || '').trim().toLowerCase();
      if (rowFirst === firstName && rowLast === lastName) {
        rowIdx = i;
        break;
      }
    }

    if (rowIdx === -1) {
      return Response.json({ error: `Player not found in sheet: ${player_name}` }, { status: 404 });
    }

    // Build cell address (e.g. I5) and update it
    const col = colIdx < 26
      ? String.fromCharCode(65 + colIdx)
      : 'A' + String.fromCharCode(65 + (colIdx - 26));
    const cellAddress = `${col}${rowIdx + 1}`;

    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!${cellAddress}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [[value]] })
      }
    );

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      return Response.json({ error: 'Failed to update cell', details: error }, { status: 500 });
    }

    console.log(`Updated cell ${cellAddress} to '${value}' for player ${player_name} on ${date}`);
    return Response.json({ success: true, cell: cellAddress, value });

  } catch (error) {
    console.error('Error updating sheet availability:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}