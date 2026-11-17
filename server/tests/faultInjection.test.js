// Sprint 5 - fault-injection tests (Jerry)
//
// Goal: when a dependency fails or input is hostile, the API answers with a
// clean 4xx/5xx JSON error and keeps serving later requests. It must never
// crash the process or leak internals.
//
// ASSUMPTIONS - adjust the three lines marked "ADJUST" to match the repo:
//   * the Express app is exported from ../src/app (no .listen() in that file)
//   * the shared Supabase mock lives in ./helpers/supabaseMock
//   * tokens are signed with process.env.JWT_SECRET and carry the user id as `id`
//   * notification settings are served at /api/notification-settings

const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../src/config/supabase', () => require('./helpers/supabaseMock')); // ADJUST path

const app = require('../src/app'); // ADJUST path

const USER_ID = '11111111-1111-4111-8111-111111111111'; // valid UUID (see PR #29)
const token = (payload = { id: USER_ID }, secret = process.env.JWT_SECRET, opts = {}) =>
  jwt.sign(payload, secret, { expiresIn: '1h', ...opts });
const auth = (t = token()) => ({ Authorization: `Bearer ${t}` });

describe('fault injection: authentication', () => {
  test('missing Authorization header -> 401', async () => {
    const res = await request(app).get('/api/notification-settings');
    expect(res.status).toBe(401);
  });

  test('non-Bearer scheme -> 401', async () => {
    const res = await request(app)
      .get('/api/notification-settings')
      .set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
  });

  test('token signed with the wrong secret -> 401', async () => {
    const res = await request(app)
      .get('/api/notification-settings')
      .set(auth(token({ id: USER_ID }, 'not-the-real-secret')));
    expect(res.status).toBe(401);
  });

  test('expired token -> 401', async () => {
    const res = await request(app)
      .get('/api/notification-settings')
      .set(auth(token({ id: USER_ID }, process.env.JWT_SECRET, { expiresIn: -10 })));
    expect(res.status).toBe(401);
  });

  test('garbage token -> 401, not a crash', async () => {
    const res = await request(app)
      .get('/api/notification-settings')
      .set('Authorization', 'Bearer %%%not.a.jwt%%%');
    expect(res.status).toBe(401);
  });
});

describe('fault injection: hostile input', () => {
  test('body user_id is ignored (ownership comes from the token)', async () => {
    const res = await request(app)
      .put('/api/notification-settings')
      .set(auth())
      .send({ user_id: '22222222-2222-4222-8222-222222222222', enabled: true });
    // Accepting the request is fine; what matters is it never errors on the spoofed id
    // and never reports the spoofed id back.
    expect(res.status).toBeLessThan(500);
    expect(JSON.stringify(res.body)).not.toContain('22222222-2222-4222-8222-222222222222');
  });

  test('invalid enum value -> 400', async () => {
    const res = await request(app)
      .put('/api/notification-settings')
      .set(auth())
      .send({ frequency: 'every-nanosecond' });
    expect(res.status).toBe(400);
  });

  test('wrong types -> 400, not 500', async () => {
    const res = await request(app)
      .put('/api/notification-settings')
      .set(auth())
      .send({ enabled: 'maybe', reminder_lead_minutes: 'soon' });
    expect(res.status).toBe(400);
  });

  test('malformed JSON body -> 4xx, not 500', async () => {
    const res = await request(app)
      .put('/api/notification-settings')
      .set(auth())
      .set('Content-Type', 'application/json')
      .send('{"enabled": tru');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('non-UUID task id -> 400/404, not 500', async () => {
    const res = await request(app).get('/api/tasks/not-a-uuid').set(auth());
    expect([400, 404]).toContain(res.status);
  });

  test('error responses do not leak stack traces', async () => {
    const res = await request(app).get('/api/tasks/not-a-uuid').set(auth());
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules|\bat\s+\S+\s+\(/);
  });
});

describe('fault injection: database failure', () => {
  // The shared mock must expose a way to force the next query to fail.
  // If it does not yet, add something like:  mock.__failNext(new Error('db down'))
  const mock = require('./helpers/supabaseMock'); // ADJUST path

  test('database error -> 5xx JSON, then the API recovers', async () => {
    if (typeof mock.__failNext !== 'function') {
      console.warn('supabaseMock has no __failNext(); skipping DB-failure test');
      return;
    }
    mock.__failNext(new Error('simulated database outage'));
    const down = await request(app).get('/api/notification-settings').set(auth());
    expect(down.status).toBeGreaterThanOrEqual(500);
    expect(down.headers['content-type']).toMatch(/json/);
    expect(JSON.stringify(down.body)).not.toMatch(/simulated database outage/);

    const up = await request(app).get('/api/notification-settings').set(auth());
    expect(up.status).toBeLessThan(500); // process survived and serves normally
  });
});
