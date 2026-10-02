import 'server-only';
import { GoogleAuth } from 'google-auth-library';
import { prisma } from './db';
import { HttpError } from './http';
import { GOLFER_NAMES } from './roster';

export const DEFAULT_HANDICAP_SHEET_ID = '1r-kIS4b4xmxNUz68Vmzd7WL5u3F7vumQ53_9mvQ-_cw';

export function sheetsConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

let googleAuth;

// A service account replaces the Base44 connector. Share each sheet with its email as an editor.
export async function getSheetsToken() {
  if (!sheetsConfigured()) throw new HttpError(503, 'Google Sheets is not configured');
  googleAuth ??= new GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const token = await googleAuth.getAccessToken();
  if (!token) throw new HttpError(502, 'Could not get a Google access token');
  return token;
}

export async function handicapSheetId() {
  const setting = await prisma.appSettings.findUnique({ where: { setting_key: 'handicap_sheet_url' } });
  const match = setting?.setting_value?.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : DEFAULT_HANDICAP_SHEET_ID;
}

// Reads First Name and Last Name (columns B and C) from the HI tab, same as the pairings code.
async function fetchRosterFromSheet() {
  const token = await getSheetsToken();
  const id = await handicapSheetId();
  const headers = { Authorization: `Bearer ${token}` };
  const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`, { headers });
  if (!meta.ok) throw new Error(`Sheet metadata failed with ${meta.status}`);
  const tab = (await meta.json()).sheets.map((s) => s.properties.title).find((t) => t.startsWith('HI '));
  if (!tab) throw new Error('No HI tab found in the handicap sheet');
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(tab)}!B2:C`, { headers });
  if (!res.ok) throw new Error(`Roster read failed with ${res.status}`);
  const rows = (await res.json()).values || [];
  return rows
    .map(([first = '', last = '']) => [first.trim(), last.trim()])
    .filter(([first, last]) => first && last)
    .map(([first, last]) => `${first} ${last}`);
}

const ROSTER_TTL_MS = 10 * 60 * 1000;
let cache = { names: null, at: 0 };

// Without a service account (local dev) the built in copy of the sheet is used.
// With one, a failed refresh keeps the last good list, and with no list at all logins fail closed.
export async function loadRoster() {
  if (!sheetsConfigured()) return GOLFER_NAMES;
  if (cache.names && Date.now() - cache.at < ROSTER_TTL_MS) return cache.names;
  try {
    const names = await fetchRosterFromSheet();
    if (names.length === 0) throw new Error('Roster came back empty');
    cache = { names, at: Date.now() };
  } catch (err) {
    console.error('roster refresh failed:', err.message);
    if (!cache.names) throw new HttpError(503, 'The league roster is unavailable. Try again shortly.');
  }
  return cache.names;
}

const normalize = (name) => name.replace(/\s+/g, ' ').trim().toLowerCase();

export async function isOnRoster(playerName) {
  if (!playerName) return false;
  const target = normalize(playerName);
  return (await loadRoster()).some((n) => normalize(n) === target);
}

// Sorted by last name, which is how the league reads the list.
export async function sortedRoster() {
  const lastOf = (n) => n.trim().split(/\s+/).slice(1).join(' ').toLowerCase();
  return [...(await loadRoster())].sort((a, b) => lastOf(a).localeCompare(lastOf(b)));
}
