// Same call shapes the Base44 SDK had, so the ported screens barely changed.

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function query(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// Base44 pushed changes over a socket. Polling every 15 seconds is plenty for a tee sheet.
const POLL_MS = 15000;

function entity(name) {
  const base = `/api/entities/${name}`;
  return {
    list: (sort, limit, skip) => request('GET', base + query({ sort, limit, skip })),
    filter: (q, sort, limit, skip) => request('GET', base + query({ q, sort, limit, skip })),
    get: (id) => request('GET', `${base}/${encodeURIComponent(id)}`),
    create: (data) => request('POST', base, data),
    update: (id, data) => request('PATCH', `${base}/${encodeURIComponent(id)}`, data),
    delete: (id) => request('DELETE', `${base}/${encodeURIComponent(id)}`),
    subscribe: (cb) => {
      const t = setInterval(() => {
        if (document.visibilityState === 'visible') cb({ type: 'poll' });
      }, POLL_MS);
      return () => clearInterval(t);
    },
  };
}

export const api = {
  entities: {
    Availability: entity('Availability'),
    TeeTime: entity('TeeTime'),
    Foursome: entity('Foursome'),
    PlayerInterest: entity('PlayerInterest'),
    AppSettings: entity('AppSettings'),
  },
  auth: {
    me: () => request('GET', '/api/auth/me'),
    login: (username, password) => request('POST', '/api/auth/login', { username, password }),
    signup: (data) => request('POST', '/api/auth/signup', data),
    rosterMatches: (last) => request('GET', '/api/auth/roster' + query({ last })),
    updateMe: (data) => request('PATCH', '/api/auth/me', data),
    deleteAccount: () => request('DELETE', '/api/auth/me'),
    logout: async () => {
      await request('POST', '/api/auth/logout').catch(() => {});
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload drops cached data from the signed out user
      window.location.assign('/');
    },
    redirectToLogin: () => {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload drops cached data from the signed out user
      window.location.assign('/');
    },
  },
  settings: {
    get: () => request('GET', '/api/settings'),
    save: (changes) => request('PUT', '/api/settings', changes),
  },
  admin: {
    accounts: () => request('GET', '/api/admin/accounts'),
    resetPassword: (id, new_password) => request('PATCH', `/api/admin/accounts/${encodeURIComponent(id)}`, { new_password }),
    deleteAccount: (id) => request('DELETE', `/api/admin/accounts/${encodeURIComponent(id)}`),
    roster: () => request('GET', '/api/admin/roster'),
    addToRoster: (first_name, last_name) => request('POST', '/api/admin/roster', { first_name, last_name }),
    removeFromRoster: (id) => request('DELETE', `/api/admin/roster/${encodeURIComponent(id)}`),
    previewRosterImport: () => request('GET', '/api/admin/roster/import'),
    applyRosterImport: (changes) => request('POST', '/api/admin/roster/import', changes),
  },
  // Returns { data } like the axios based SDK did.
  functions: {
    invoke: async (name, body = {}) => ({ data: await request('POST', `/api/functions/${encodeURIComponent(name)}`, body) }),
  },
};
