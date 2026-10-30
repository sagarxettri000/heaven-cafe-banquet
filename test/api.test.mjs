/**
 * Exercises the Worker's booking API with a stub D1 binding.
 * Run: node test/api.test.mjs
 */
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

function makeEnv() {
  const calls = { prepared: [], rows: [] };
  const db = {
    prepare(sql) {
      const stmt = {
        sql,
        args: [],
        bind(...args) { stmt.args = args; return stmt; },
        async all() { return { results: [{ n: calls.rows.length }] }; },
        async run() {
          calls.prepared.push({ sql: sql.trim().split('\n')[0].slice(0, 40), args: stmt.args });
          if (sql.startsWith('INSERT')) calls.rows.push(stmt.args);
          return { success: true, meta: { last_row_id: calls.rows.length } };
        },
      };
      return stmt;
    },
  };
  return {
    env: { DB: db, ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } },
    calls,
  };
}

const origin = 'https://heaven.example';
const post = (body, headers = {}) =>
  new Request(`${origin}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const valid = {
  name: 'Anisha Rai',
  phone: '9812345678',
  email: 'a@example.com',
  event_type: 'wedding',
  space: 'heaven-hall',
  event_date: new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10),
  guests: 320,
  message: 'Stage decor please',
};

let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
};

await test('health reports storage', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(new Request(`${origin}/api/health`), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, storage: true });
});

await test('assets are served for non-api routes', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(new Request(`${origin}/`), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
});

await test('GET /api/bookings is rejected', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(new Request(`${origin}/api/bookings`), env);
  assert.equal(res.status, 405);
});

await test('non-JSON content type is rejected', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(
    new Request(`${origin}/api/bookings`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hi' }),
    env,
  );
  assert.equal(res.status, 415);
});

await test('cross-origin posts are refused', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(post(valid, { origin: 'https://evil.example' }), env);
  assert.equal(res.status, 403);
});

await test('oversized body is refused', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(
    new Request(`${origin}/api/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...valid, message: 'x'.repeat(5000) }),
    }),
    env,
  );
  assert.equal(res.status, 413);
});

await test('invalid fields return field errors', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(
    post({ name: 'A', phone: '123', email: 'nope', event_type: 'x', space: 'y', event_date: '2026-13-40', guests: 9999 }),
    env,
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.deepEqual(Object.keys(body.fields).sort(), ['date', 'email', 'guests', 'name', 'phone', 'space', 'type']);
});

await test('past and far-future dates are refused', async () => {
  const { env } = makeEnv();
  for (const event_date of ['2020-01-01', '2099-01-01']) {
    const res = await worker.fetch(post({ ...valid, event_date }), env);
    assert.equal(res.status, 400, event_date);
    assert.ok((await res.json()).fields.date, event_date);
  }
});

await test('honeypot submissions look successful but store nothing', async () => {
  const { env, calls } = makeEnv();
  const res = await worker.fetch(post({ ...valid, company: 'Acme' }), env);
  assert.equal(res.status, 201);
  assert.equal(calls.rows.length, 0);
});

await test('a valid booking is stored with normalised phone', async () => {
  const { env, calls } = makeEnv();
  const res = await worker.fetch(post({ ...valid, phone: '+977 981-234-5678' }), env);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.reference, 'HC-1');
  assert.equal(calls.rows.length, 1);
  assert.equal(calls.rows[0][2], '+9779812345678');
});

await test('unknown fields and script tags are sanitised', async () => {
  const { env, calls } = makeEnv();
  const res = await worker.fetch(post({ ...valid, name: '<script>alert(1)</script>Ram' }), env);
  assert.equal(res.status, 201);
  const stored = calls.rows[0][1];
  assert.ok(!/[<>]/.test(stored), 'angle brackets are stripped');
  assert.equal(stored, 'scriptalert(1)/scriptRam');
});

await test('sixth request in the window is rate limited', async () => {
  const { env, calls } = makeEnv();
  for (let i = 0; i < 5; i++) {
    const res = await worker.fetch(post(valid), env);
    assert.equal(res.status, 201, `request ${i + 1}`);
  }
  const res = await worker.fetch(post(valid), env);
  assert.equal(res.status, 429);
  assert.equal(calls.rows.length, 5);
});

await test('missing D1 reports 503 rather than crashing', async () => {
  const res = await worker.fetch(post(valid), { ASSETS: { fetch: async () => new Response('') } });
  assert.equal(res.status, 503);
});

console.log(`\n${passed} checks passed`);
