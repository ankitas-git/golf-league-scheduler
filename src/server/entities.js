import 'server-only';
import { z } from 'zod';
import { prisma } from './db';
import { HttpError } from './http';
import { parse } from './validation';
import { playerKey } from './auth';
import { isOnRoster } from './sheets';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const text = (max) => z.string().trim().max(max).nullable().optional();

// Each entity lists its writable fields and who may do what. Unknown fields are dropped.
export const ENTITIES = {
  Availability: {
    model: 'availability',
    schema: z.object({
      date,
      start_time: text(20),
      end_time: text(20),
      player_name: z.string().trim().min(1).max(100),
      player_email: z.string().trim().max(254).optional(),
      notes: text(500),
    }),
    read: 'user',
    create: 'self',
    update: 'admin',
    delete: 'self',
  },
  TeeTime: {
    model: 'teeTime',
    schema: z.object({
      date,
      start_time: text(20),
      end_time: text(20),
      course: text(100),
      pairing: text(100),
      commissioner: text(50),
      notes: text(500),
    }),
    read: 'user',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
  },
  Foursome: {
    model: 'foursome',
    schema: z.object({
      date,
      group_number: z.number().int().min(1).max(100),
      players: z.array(z.string().trim().max(100)).max(8).default([]),
    }),
    read: 'user',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
  },
  PlayerInterest: {
    model: 'playerInterest',
    schema: z.object({
      date,
      player_name: z.string().trim().min(1).max(100),
      player_email: z.string().trim().max(254),
      notes: text(500),
    }),
    read: 'admin',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
  },
  AppSettings: {
    model: 'appSettings',
    schema: z.object({
      setting_key: z.string().trim().min(1).max(100),
      setting_value: z.string().trim().max(2000),
      description: text(500),
    }),
    read: 'admin',
    create: 'admin',
    update: 'admin',
    delete: 'admin',
  },
};

export function entityConfig(name) {
  const cfg = Object.hasOwn(ENTITIES, name) ? ENTITIES[name] : null;
  if (!cfg) throw new HttpError(404, 'Unknown entity');
  return cfg;
}

const fieldsOf = (cfg) => new Set(['id', 'created_date', 'updated_date', ...Object.keys(cfg.schema.shape)]);

// "date" sorts ascending and "-date" descending, the Base44 SDK convention.
export function orderBy(cfg, sort) {
  if (!sort) return undefined;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!fieldsOf(cfg).has(field)) throw new HttpError(400, `Cannot sort by ${field}`);
  return { [field]: desc ? 'desc' : 'asc' };
}

// Only plain equality on known scalar fields, so no Prisma operators reach the query.
export function whereFrom(cfg, filter) {
  if (!filter) return {};
  if (typeof filter !== 'object' || Array.isArray(filter)) throw new HttpError(400, 'Bad filter');
  const where = {};
  for (const [k, v] of Object.entries(filter)) {
    if (!fieldsOf(cfg).has(k)) throw new HttpError(400, `Cannot filter by ${k}`);
    if (!['string', 'number', 'boolean'].includes(typeof v)) throw new HttpError(400, `Bad filter value for ${k}`);
    where[k] = v;
  }
  return where;
}

export function allowed(rule, user) {
  if (rule === 'user' || rule === 'self') return true;
  return rule === 'admin' && user.role === 'admin';
}

export function assertAllowed(rule, user) {
  if (!allowed(rule, user)) throw new HttpError(403, 'Not allowed');
}

const sameName = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

// Players can only write their own rows. Admins can write for anyone on the roster.
export async function prepareCreate(name, cfg, user, body) {
  const data = parse(cfg.schema, body);
  if (name === 'Availability') {
    if (user.role !== 'admin' || !data.player_name) data.player_name = user.player_name;
    if (user.role === 'admin' && !(await isOnRoster(data.player_name))) {
      throw new HttpError(400, `${data.player_name} is not on the roster`);
    }
    data.player_email = playerKey(data.player_name);
  }
  return data;
}

export function prepareUpdate(cfg, body) {
  return parse(cfg.schema.partial(), body);
}

export function assertOwns(name, cfg, user, record) {
  if (cfg.delete !== 'self' || user.role === 'admin') return;
  if (name === 'Availability' && sameName(record.player_name, user.player_name)) return;
  throw new HttpError(403, 'You can only change your own entries');
}

export const delegate = (cfg) => prisma[cfg.model];

// Back end functions use this the way they used Base44's asServiceRole entities.
export function repo(cfg) {
  const d = delegate(cfg);
  const find = (where, sort, limit, skip) =>
    d.findMany({ where, orderBy: orderBy(cfg, sort), take: limit ?? undefined, skip: skip ?? undefined });
  return {
    list: (sort, limit, skip) => find({}, sort, limit, skip),
    filter: (filter, sort, limit, skip) => find(whereFrom(cfg, filter), sort, limit, skip),
    get: (id) => d.findUnique({ where: { id } }),
    create: (data) => d.create({ data }),
    update: (id, data) => d.update({ where: { id }, data }),
    delete: (id) => d.delete({ where: { id } }),
  };
}
