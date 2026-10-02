import 'server-only';
import { prisma } from './db';
import { HttpError } from './http';
import { SETTINGS, SETTINGS_BY_KEY, coerceSetting, serializeSetting } from '@/lib/settings';

export async function getSettings({ includeAdminOnly = true } = {}) {
  const rows = await prisma.appSettings.findMany({ where: { setting_key: { in: SETTINGS.map((s) => s.key) } } });
  const stored = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  const out = {};
  for (const def of SETTINGS) {
    if (def.adminOnly && !includeAdminOnly) continue;
    out[def.key] = coerceSetting(def, stored[def.key]);
  }
  return out;
}

function validate(def, value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value ?? '').trim();
  if (raw.length > 2000) throw new HttpError(400, `${def.label} is too long`);
  if (raw === '') return '';
  if (def.type === 'int') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < def.min || n > def.max) throw new HttpError(400, `${def.label} must be a whole number from ${def.min} to ${def.max}`);
  }
  if (def.type === 'choice' && !def.options.includes(raw)) throw new HttpError(400, `${def.label} must be one of ${def.options.join(', ')}`);
  if (def.type === 'url' && !/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(raw)) {
    throw new HttpError(400, `${def.label} must be a Google Sheets link`);
  }
  return serializeSetting(def, def.type === 'list' ? raw.split(',').map((s) => s.trim()).filter(Boolean) : raw);
}

// An empty value deletes the row, which puts the setting back to its default.
export async function saveSettings(changes) {
  if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) throw new HttpError(400, 'Bad settings');
  const ops = [];
  for (const [key, value] of Object.entries(changes)) {
    const def = Object.hasOwn(SETTINGS_BY_KEY, key) ? SETTINGS_BY_KEY[key] : null;
    if (!def) throw new HttpError(400, `Unknown setting ${key}`);
    const v = validate(def, value);
    ops.push(
      v === ''
        ? prisma.appSettings.deleteMany({ where: { setting_key: key } })
        : prisma.appSettings.upsert({
            where: { setting_key: key },
            create: { setting_key: key, setting_value: v, description: def.label },
            update: { setting_value: v },
          }),
    );
  }
  await prisma.$transaction(ops);
  return getSettings();
}
