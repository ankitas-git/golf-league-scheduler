import 'server-only';
import { HttpError } from './http';

// In memory fixed windows. Fine for one replica. Needs a shared store if this ever scales out.
const buckets = new Map();

function sweep(now) {
  for (const [key, b] of buckets) if (b.reset <= now) buckets.delete(key);
}

export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset <= now) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (buckets.size > 10000) sweep(now);
  if (b.count > limit) {
    const wait = Math.ceil((b.reset - now) / 60000);
    throw new HttpError(429, `Too many attempts. Try again in ${wait} minute${wait === 1 ? '' : 's'}.`);
  }
}
