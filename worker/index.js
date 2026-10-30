/**
 * Heaven Cafe & Banquet — Cloudflare Worker
 * Serves the static site and handles booking submissions backed by D1.
 */

const JSON_TYPE = 'application/json; charset=utf-8';

const SPACES = ['cafe', 'heaven-hall', 'garden', 'long-table'];
const EVENT_TYPES = ['table', 'wedding', 'birthday', 'corporate', 'other'];
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': JSON_TYPE, 'cache-control': 'no-store', ...extra },
  });

const clean = (value, max) =>
  typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>]/g, '').trim().slice(0, max)
    : '';

const normalizePhone = (raw) => String(raw || '').replace(/[\s\-()]/g, '');

function validPhone(phone) {
  return /^(?:\+?977)?9[6-8]\d{8}$/.test(phone);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return false;
  const today = new Date();
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const t = Date.UTC(y, m - 1, d);
  return t >= start && t <= start + 366 * 86400000;
}

async function hashIp(ip) {
  const data = new TextEncoder().encode(`heaven:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    event_type TEXT NOT NULL,
    space TEXT NOT NULL,
    event_date TEXT NOT NULL,
    guests INTEGER NOT NULL,
    message TEXT,
    ip_hash TEXT,
    status TEXT NOT NULL DEFAULT 'new'
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_bookings_ip ON bookings (ip_hash, created_at)').run();
  schemaReady = true;
}

function validateBooking(body) {
  const fields = {};
  const data = {
    name: clean(body.name, 60),
    phone: normalizePhone(clean(body.phone, 20)),
    email: clean(body.email, 80),
    event_type: clean(body.event_type, 20),
    space: clean(body.space, 20),
    event_date: clean(body.event_date, 10),
    guests: Number(body.guests),
    message: clean(body.message, 500),
  };

  if (data.name.length < 2) fields.name = 'name';
  if (!validPhone(data.phone)) fields.phone = 'phone';
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) fields.email = 'email';
  if (!EVENT_TYPES.includes(data.event_type)) fields.type = 'type';
  if (!SPACES.includes(data.space)) fields.space = 'space';
  if (!Number.isInteger(data.guests) || data.guests < 1 || data.guests > 600) fields.guests = 'guests';
  if (!validDate(data.event_date)) fields.date = 'date';

  return { data, fields };
}

async function handleBooking(request, env) {
  const url = new URL(request.url);

  // Same-origin only: a foreign Origin means a cross-site post.
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'Forbidden' }, 403);

  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    return json({ error: 'Expected JSON' }, 415);
  }

  const raw = await request.text();
  if (raw.length > 4000) return json({ error: 'Request too large' }, 413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Malformed request' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Malformed request' }, 400);
  }

  // Honeypot: accept silently so bots do not learn they were caught.
  if (clean(body.company, 50)) return json({ ok: true }, 201);

  if (!env.DB) return json({ error: 'Storage unavailable' }, 503);

  const { data, fields } = validateBooking(body);
  if (Object.keys(fields).length) {
    return json({ error: 'Please check the highlighted fields.', fields }, 400);
  }

  await ensureSchema(env.DB);

  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const ipHash = await hashIp(ip);
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();

  const { results } = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM bookings WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, since)
    .all();

  if ((results?.[0]?.n ?? 0) >= RATE_LIMIT) {
    return json({ error: 'Too many requests. Please call us instead.' }, 429);
  }

  const insert = await env.DB
    .prepare(`INSERT INTO bookings (created_at, name, phone, email, event_type, space, event_date, guests, message, ip_hash)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      new Date().toISOString(),
      data.name,
      data.phone,
      data.email || null,
      data.event_type,
      data.space,
      data.event_date,
      data.guests,
      data.message || null,
      ipHash,
    )
    .run();

  const id = insert.meta?.last_row_id;
  return json({ ok: true, reference: id ? `HC-${id}` : undefined }, 201);
}

async function handleApi(request, env) {
  const { pathname } = new URL(request.url);

  if (pathname === '/api/health') {
    return json({ ok: true, storage: Boolean(env.DB) });
  }

  if (pathname === '/api/bookings') {
    if (request.method === 'POST') {
      try {
        return await handleBooking(request, env);
      } catch (err) {
        console.error('booking failed', err);
        return json({ error: 'Could not save your request' }, 500);
      }
    }
    return json({ error: 'Method not allowed' }, 405, { allow: 'POST' });
  }

  return json({ error: 'Not found' }, 404);
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'geolocation=(), microphone=(), camera=()',
  'content-security-policy': [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // The hosting platform injects its Web Analytics beacon into HTML responses.
    "script-src 'self' https://static.cloudflareinsights.com",
    "connect-src 'self' https://cloudflareinsights.com",
    "form-action 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }

    let response = await env.ASSETS.fetch(request);
    let status = response.status;

    // Unknown paths get the branded 404 page rather than the host's default.
    if (status === 404) {
      const page = await env.ASSETS.fetch(new URL('/404.html', url));
      if (page.ok) {
        response = page;
        status = 404;
      }
    }

    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);

    if (status === 404) headers.set('cache-control', 'no-store');
    else if (url.pathname === '/' || url.pathname.endsWith('.html')) {
      headers.set('cache-control', 'public, max-age=0, must-revalidate');
    }

    return new Response(response.body, { status, statusText: response.statusText, headers });
  },
};
