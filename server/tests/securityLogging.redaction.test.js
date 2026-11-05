/**
 * SOC 2 CC7.2 — TC-05 / AC-05 (SOC2-S4-04)
 * Sensitive-information redaction.
 *
 * Drives requests that carry recognizable dummy secrets through every place a
 * secret could plausibly leak from — request body, Authorization header,
 * Cookie header, custom headers, query string, URL path, database error text
 * and a malformed JSON body — then searches the complete captured log for any
 * exact occurrence. Pass requirement: zero matches, while each event still
 * carries enough metadata (event, reason, route, requestId, timestamp) to be
 * investigated.
 */

process.env.JWT_SECRET = "cc72-test-only-signing-key";
process.env.SUPABASE_URL = "https://example.supabase.test";
process.env.SUPABASE_ANON_KEY = "dummy-anon-key-for-tests";

jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");
const { createApp } = require("../src/app");
const { UserRepository } = require("../src/config/db");
const supabase = require("../config/supabase");
const { signToken } = require("../src/middleware/auth");
const { failedAuthDetector } = require("../src/utils/failedAuthDetector");
const { startLogCapture, schemaProblems } = require("./helpers/logCapture");

const app = createApp();

// ---- Recognizable dummy secrets -------------------------------------------
const SECRETS = {
  password: "DUMMY-PASSWORD-cc72-Xk9!",
  newPassword: "DUMMY-NEW-PASSWORD-cc72-Qw3!",
  cookie: "DUMMY-COOKIE-SESSION-cc72",
  apiKey: "DUMMY-API-KEY-cc72",
  serviceRoleKey: "DUMMY-SERVICE-ROLE-KEY-cc72",
  dbPassword: "DUMMY-DB-PASSWORD-cc72",
  queryToken: "DUMMY-QUERY-TOKEN-cc72",
  pathSecret: "DUMMY-PATH-SECRET-cc72",
  bodySecret: "DUMMY-BODY-SECRET-cc72",
  oauthToken: "DUMMY-OAUTH-ACCESS-TOKEN-cc72",
  claim: "DUMMY-JWT-CLAIM-cc72",
};

const USER_A = { id: "11111111-1111-4111-8111-111111111111", email: "usera@example.com" };
const USER_B = { id: "22222222-2222-4222-8222-222222222222", email: "userb@example.com" };

// JWTs carrying secrets in their payload.
const forgedToken = jwt.sign({ sub: USER_A.id, note: SECRETS.claim }, "DUMMY-WRONG-SIGNING-KEY-cc72");
const expiredToken = jwt.sign(
  { sub: USER_A.id, email: USER_A.email, note: SECRETS.claim },
  process.env.JWT_SECRET,
  { expiresIn: -60 }
);
const validTokenB = signToken(USER_B);

const JWT_FRAGMENTS = [
  forgedToken,
  expiredToken,
  validTokenB,
  ...forgedToken.split("."),
  ...expiredToken.split("."),
  ...validTokenB.split("."),
];

let capture;

beforeEach(() => {
  supabase.__reset();
  UserRepository._reset();
  failedAuthDetector.reset();
  createClient.mockReset();
  capture = startLogCapture();
});

afterEach(() => {
  capture.stop();
});

async function runLeakScenarios() {
  // 1. Failed login with a password (local account, then Supabase fallback).
  await request(app).post("/api/auth/register").send({
    name: "Redaction Test",
    email: "redact@example.com",
    password: SECRETS.newPassword,
  });
  capture.clear(); // registration succeeded; only failure paths matter below

  await request(app)
    .post("/api/auth/login")
    .set("Cookie", `session=${SECRETS.cookie}`)
    .set("X-Api-Key", SECRETS.apiKey)
    .send({ email: "redact@example.com", password: SECRETS.password });

  createClient.mockReturnValue({
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { user: null },
        error: { status: 400, code: "invalid_credentials", message: SECRETS.password },
      }),
    },
  });
  await request(app)
    .post("/api/auth/login")
    .send({ email: "unknown@example.com", password: SECRETS.password });

  // 2. Rejected tokens, with secrets in headers, cookies, query and path.
  await request(app)
    .get(`/api/tasks?access_token=${SECRETS.queryToken}&apikey=${SECRETS.apiKey}`)
    .set("Authorization", `Bearer ${forgedToken}`)
    .set("Cookie", `session=${SECRETS.cookie}`);

  await request(app)
    .get("/api/tasks")
    .set("Authorization", `Bearer ${expiredToken}`);

  await request(app)
    .get(`/api/tasks/${SECRETS.pathSecret}`)
    .set("Authorization", `Bearer ${forgedToken}`);

  await request(app).get("/api/tasks").set("Authorization", `Basic ${SECRETS.password}`);

  // 3. Cross-user access with a *valid* token.
  const created = await request(app)
    .post("/api/tasks")
    .set("Authorization", `Bearer ${signToken(USER_A)}`)
    .send({
      title: "Private",
      due_date: "2026-11-10T00:00:00.000Z",
      point_value: 1,
      estimated_effort_minutes: 10,
      priority: "low",
    });

  await request(app)
    .put(`/api/tasks/${created.body.data.id}?token=${SECRETS.queryToken}`)
    .set("Authorization", `Bearer ${validTokenB}`)
    .set("Cookie", `session=${SECRETS.cookie}`)
    .send({ title: SECRETS.bodySecret, password: SECRETS.password });

  // 4. Database failure whose error text carries credentials.
  const realFrom = supabase.from;
  supabase.from = jest.fn(() => {
    throw new Error(
      `postgres://svc:${SECRETS.dbPassword}@db.internal/omni service_role=${SECRETS.serviceRoleKey}`
    );
  });
  try {
    await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${signToken(USER_A)}`);
  } finally {
    supabase.from = realFrom;
  }

  // 5. Invalid OAuth session whose error echoes the token.
  supabase.auth.getUser = jest.fn().mockResolvedValue({
    data: { user: null },
    error: { message: `invalid JWT: ${SECRETS.oauthToken}` },
  });
  await request(app).post("/api/auth/oauth").send({ access_token: SECRETS.oauthToken });

  // 6. Malformed JSON body containing a secret (goes to the global handler).
  await request(app)
    .post("/api/auth/login")
    .set("Content-Type", "application/json")
    .send(`{"password":"${SECRETS.bodySecret}"`);
}

describe("TC-05 / AC-05: sensitive values never reach the security log", () => {
  test("zero exact matches for any dummy secret across all failure scenarios", async () => {
    await runLeakScenarios();

    // The scenarios must actually have produced events to inspect.
    expect(capture.lines.length).toBeGreaterThanOrEqual(9);

    const text = capture.text();

    for (const [name, value] of Object.entries(SECRETS)) {
      expect({ secret: name, leaked: text.includes(value) }).toEqual({
        secret: name,
        leaked: false,
      });
    }

    for (const fragment of JWT_FRAGMENTS) {
      expect(text).not.toContain(fragment);
    }
  });

  test("no email address, header name or bearer scheme appears in the log either", async () => {
    await runLeakScenarios();

    const text = capture.text();

    for (const email of ["redact@example.com", "unknown@example.com", USER_A.email, USER_B.email]) {
      expect(text).not.toContain(email);
    }
    expect(text).not.toMatch(/bearer|cookie|x-api-key|set-cookie/i);
    expect(text).not.toMatch(/postgres:\/\/|service_role/i);
  });

  test("events stay useful for investigation after redaction", async () => {
    await runLeakScenarios();

    const events = capture.events();

    expect(schemaProblems(events)).toEqual([]);

    for (const event of events) {
      expect(event.event).toBeTruthy();
      expect(event.reason).not.toBe("unspecified");
      expect(event.route).toMatch(/^\/[a-z:/-]*$/);
      expect(event.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(Date.parse(event.timestamp)).not.toBeNaN();
    }

    // Distinct requests have distinct ids, so events can be told apart.
    const ids = events.map((e) => e.requestId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("secrets in the URL path and query string are replaced or dropped from `route`", async () => {
    await request(app)
      .get(`/api/tasks/${SECRETS.pathSecret}?access_token=${SECRETS.queryToken}`)
      .set("Authorization", `Bearer ${forgedToken}`);

    const [event] = capture.events();
    expect(event.route).toBe("/api/tasks/:param");
    expect(capture.text()).not.toContain(SECRETS.pathSecret);
    expect(capture.text()).not.toContain(SECRETS.queryToken);
  });

  test("a token placed in the URL path is not logged", async () => {
    await request(app).get(`/api/tasks/${forgedToken}`);

    const [event] = capture.events();
    expect(event.route).toBe("/api/tasks/:param");
    for (const fragment of forgedToken.split(".")) {
      expect(capture.text()).not.toContain(fragment);
    }
  });
});
