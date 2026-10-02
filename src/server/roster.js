import 'server-only';
import { prisma } from './db';
import { HttpError } from './http';
import { handicapSheetId } from './sheets';

// The roster lives in the database. The handicap sheet is world editable, so it is only
// ever a source for an import that an admin reviews and approves.

export const nameKey = (name) => String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
export const fullName = (p) => `${p.first_name} ${p.last_name}`;
const lastKey = (p) => p.last_name.replace(/\(.*\)/, '').trim().toLowerCase();

export async function isOnRoster(playerName) {
  const key = nameKey(playerName);
  if (!key) return false;
  return Boolean(await prisma.rosterPlayer.findUnique({ where: { name_key: key }, select: { id: true } }));
}

// The spelling stored on the roster, so accounts match it exactly.
export async function rosterName(playerName) {
  const p = await prisma.rosterPlayer.findUnique({ where: { name_key: nameKey(playerName) } });
  return p ? fullName(p) : null;
}

const byLast = (a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name);

export async function listRoster() {
  return (await prisma.rosterPlayer.findMany()).sort(byLast);
}

export async function sortedRosterNames() {
  return (await listRoster()).map(fullName);
}

export async function matchesForLastName(last) {
  const key = last.trim().toLowerCase();
  return (await listRoster()).filter((p) => lastKey(p) === key).map(fullName);
}

// GHIN H.I. keyed by lowercase last name, the shape the dashboard already reads.
export async function handicapMap() {
  const map = {};
  for (const p of await listRoster()) if (p.hi_index !== null) map[lastKey(p)] = p.hi_index;
  return map;
}

// Minimal CSV parser. The gviz export quotes every field and doubles embedded quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Reads the public CSV export, so no Google credentials are needed just to see the roster.
async function fetchSheetRoster() {
  const id = await handicapSheetId();
  let res;
  try {
    res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1`, {
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch {
    throw new HttpError(502, 'Could not reach the handicap sheet. Check that anyone with the link can view it.');
  }
  if (!res.ok) throw new HttpError(502, `The handicap sheet answered ${res.status}. Check that anyone with the link can view it.`);
  const rows = parseCsv(await res.text());
  const header = rows[0] || [];
  const col = (re) => header.findIndex((h) => re.test(h.replace(/\s+/g, ' ').trim()));
  const fi = col(/^first name$/i);
  const li = col(/^last name$/i);
  const hi = col(/^ghin .*h\.i\.?$/i);
  if (fi < 0 || li < 0) throw new HttpError(422, 'The first tab of the handicap sheet has no First Name and Last Name columns.');

  const players = new Map();
  for (const r of rows.slice(1)) {
    const first = (r[fi] || '').trim();
    const last = (r[li] || '').trim();
    // Notes and formulas sit in the name columns below the table, so skip anything long or odd.
    if (!first || !last || first.length > 40 || last.length > 40 || /[=*/]/.test(first + last)) continue;
    const idx = hi >= 0 ? Number.parseFloat(r[hi]) : Number.NaN;
    const p = { first_name: first, last_name: last, name_key: nameKey(`${first} ${last}`), hi_index: Number.isFinite(idx) ? idx : null };
    players.set(p.name_key, p);
  }
  if (players.size === 0) throw new HttpError(422, 'The handicap sheet has no golfers on its first tab.');
  return players;
}

// What an import would change. Nothing is written until an admin approves specific rows.
export async function previewImport() {
  const sheet = await fetchSheetRoster();
  const current = new Map((await listRoster()).map((p) => [p.name_key, p]));
  const accounts = new Set((await prisma.user.findMany({ select: { player_name: true } })).map((u) => nameKey(u.player_name)));

  const add = [...sheet.values()].filter((p) => !current.has(p.name_key)).sort(byLast);
  const remove = [...current.values()].filter((p) => !sheet.has(p.name_key)).sort(byLast)
    .map((p) => ({ ...p, has_account: accounts.has(p.name_key) }));
  const handicaps = [...sheet.values()]
    .filter((p) => current.has(p.name_key) && current.get(p.name_key).hi_index !== p.hi_index)
    .sort(byLast)
    .map((p) => ({ ...p, old_hi_index: current.get(p.name_key).hi_index }));
  return { sheet_count: sheet.size, roster_count: current.size, add, remove, handicaps };
}

// Re-reads the sheet rather than trusting the browser, then applies only the approved keys.
export async function applyImport({ add = [], remove = [], updateHandicaps = false }, actor) {
  const preview = await previewImport();
  const addKeys = new Set(add);
  const removeKeys = new Set(remove);
  if (removeKeys.has(nameKey(actor.player_name))) throw new HttpError(400, 'You cannot remove yourself from the roster.');

  const toAdd = preview.add.filter((p) => addKeys.has(p.name_key));
  const toRemove = preview.remove.filter((p) => removeKeys.has(p.name_key));
  const toUpdate = updateHandicaps ? preview.handicaps : [];

  await prisma.$transaction([
    ...toAdd.map(({ first_name, last_name, name_key, hi_index }) =>
      prisma.rosterPlayer.create({ data: { first_name, last_name, name_key, hi_index } })),
    prisma.rosterPlayer.deleteMany({ where: { name_key: { in: toRemove.map((p) => p.name_key) } } }),
    ...toUpdate.map((p) => prisma.rosterPlayer.update({ where: { name_key: p.name_key }, data: { hi_index: p.hi_index } })),
  ]);
  return { added: toAdd.length, removed: toRemove.length, handicaps_updated: toUpdate.length };
}

export async function addPlayer({ first_name, last_name }) {
  const key = nameKey(`${first_name} ${last_name}`);
  if (await prisma.rosterPlayer.findUnique({ where: { name_key: key } })) {
    throw new HttpError(409, `${first_name} ${last_name} is already on the roster`);
  }
  return prisma.rosterPlayer.create({ data: { first_name, last_name, name_key: key } });
}

export async function removePlayer(id, actor) {
  const p = await prisma.rosterPlayer.findUnique({ where: { id } });
  if (!p) throw new HttpError(404, 'Not on the roster');
  if (p.name_key === nameKey(actor.player_name)) throw new HttpError(400, 'You cannot remove yourself from the roster.');
  await prisma.rosterPlayer.delete({ where: { id } });
  return p;
}
