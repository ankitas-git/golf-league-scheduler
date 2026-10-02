// League settings admins can change from the dashboard. Stored in AppSettings, these are the defaults.
// adminOnly settings are hidden from players.

export const SETTINGS = [
  { key: 'league_name', label: 'League name', type: 'text', default: 'Young Retiree League', help: 'Shown in the header and email sign offs.' },
  { key: 'sheet_title_prefix', label: 'Pairings sheet title', type: 'text', default: 'Young Retirees', help: 'Starts the heading on the pairings sheet.' },
  { key: 'tee_interval_minutes', label: 'Minutes between tee times', type: 'int', min: 1, max: 30, default: 10 },
  { key: 'scramble_team_pct', label: 'Scramble team handicap %', type: 'int', min: 1, max: 100, default: 50, help: 'Share of the summed course handicaps a scramble team gets.' },
  { key: 'default_tee', label: 'Default tee', type: 'choice', options: ['White', 'Silver'], default: 'White' },
  { key: 'courses', label: 'Courses', type: 'list', default: ['North', 'South'], help: 'Comma separated. Must match the course names in the HI sheet headers.' },
  { key: 'commissioners', label: 'Commissioners', type: 'list', default: ['Mike', 'Ravi', 'Rai', 'Doug', 'Ray'], help: 'Comma separated.' },
  { key: 'player_fee_text', label: 'Fee captains collect', type: 'text', default: '$15  ($10 for game & $5 for 1st Tee)' },
  { key: 'cancel_phone', label: '1st Tee phone for cancellations', type: 'text', default: '(248)433-0674' },
  { key: 'local_rule_text', label: 'Local rule line', type: 'text', default: 'YR Local Rule: lift & place in the rough is allowed' },
  { key: 'handicap_sheet_url', label: 'Handicap sheet link', type: 'url', default: '', adminOnly: true, help: 'The Google Sheet with the HI tab. The Roster tab imports from it.' },
  { key: 'pairings_sheet_url', label: 'Pairings sheet link', type: 'url', default: '', adminOnly: true },
];

export const SETTINGS_BY_KEY = Object.fromEntries(SETTINGS.map((s) => [s.key, s]));

// Turns the stored string into the setting's type. Bad values fall back to the default.
export function coerceSetting(def, raw) {
  if (raw === undefined || raw === null || raw === '') return def.default;
  switch (def.type) {
    case 'int': {
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= def.min && n <= def.max ? n : def.default;
    }
    case 'list': {
      const items = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
      return items.length ? items : def.default;
    }
    case 'choice':
      return def.options.includes(raw) ? raw : def.default;
    default:
      return String(raw);
  }
}

// What gets stored. Lists are saved comma separated.
export function serializeSetting(def, value) {
  return def.type === 'list' && Array.isArray(value) ? value.join(', ') : String(value ?? '');
}
