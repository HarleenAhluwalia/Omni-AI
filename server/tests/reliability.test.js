// Sprint 5 - light load / reliability run (Jerry)
//
// Small on purpose so it is quick in CI: fires repeated and concurrent requests
// at read endpoints, requires zero failures, and writes latency numbers to
// server/reliability-results.json so CI can upload them as evidence.
//
// ASSUMPTIONS: same app / mock / token conventions as faultInjection.test.js.
// ADJUST the require paths below to the repo layout.

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
jest.mock('../src/config/supabase', () => require('./helpers/supabaseMock')); // ADJUST
const app = require('../src/app'); // ADJUST

const USER_ID = '11111111-1111-4111-8111-111111111111';
const AUTH = { Authorization: `Bearer ${jwt.sign({ id: USER_ID }, process.env.JWT_SECRET, { expiresIn: '1h' })}` };

const SEQUENTIAL = 50;
const CONCURRENT = 20;
const P95_BUDGET_MS = 500; // generous: the mock is in-process, so this mostly guards regressions

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const summarize = (name, samples, failures) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    endpoint: name,
    requests: samples.length + failures,
    failures,
    min_ms: +sorted[0].toFixed(2),
    p50_ms: +percentile(sorted, 50).toFixed(2),
    p95_ms: +percentile(sorted, 95).toFixed(2),
    max_ms: +sorted[sorted.length - 1].toFixed(2),
  };
};

const ENDPOINTS = ['/api/notification-settings', '/api/tasks']; // ADJUST if routes differ
const results = [];

describe.each(ENDPOINTS)('reliability: GET %s', (url) => {
  test(`${SEQUENTIAL} sequential requests, zero failures`, async () => {
    const samples = [];
    let failures = 0;
    for (let i = 0; i < SEQUENTIAL; i += 1) {
      const t0 = process.hrtime.bigint();
      const res = await request(app).get(url).set(AUTH);
      samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
      if (res.status >= 500) failures += 1;
    }
    const s = summarize(`${url} (sequential)`, samples, failures);
    results.push(s);
    expect(s.failures).toBe(0);
    expect(s.p95_ms).toBeLessThan(P95_BUDGET_MS);
  });

  test(`${CONCURRENT} concurrent requests, zero failures`, async () => {
    const t0 = process.hrtime.bigint();
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT }, () => request(app).get(url).set(AUTH)),
    );
    const total = Number(process.hrtime.bigint() - t0) / 1e6;
    const failures = responses.filter((r) => r.status >= 500).length;
    results.push({ endpoint: `${url} (concurrent)`, requests: CONCURRENT, failures, total_ms: +total.toFixed(2) });
    expect(failures).toBe(0);
  });
});

afterAll(() => {
  const out = path.join(__dirname, '..', 'reliability-results.json');
  fs.writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2));
});
