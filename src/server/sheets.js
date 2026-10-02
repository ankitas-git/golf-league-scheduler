import 'server-only';
import { GoogleAuth } from 'google-auth-library';
import { prisma } from './db';
import { HttpError } from './http';

export const DEFAULT_HANDICAP_SHEET_ID = '1r-kIS4b4xmxNUz68Vmzd7WL5u3F7vumQ53_9mvQ-_cw';

// Only writes need this. Reading the roster for an import uses the public export.
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
